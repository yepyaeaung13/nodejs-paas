import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { appSharedDir, config } from "../config.js";
import {
  createDatabase,
  deleteDatabaseRow,
  getDatabase,
  type AppRow,
  type DatabaseRow,
} from "../db.js";
import { hasCommand, runCommand } from "../lib/command.js";
import { ensureDir } from "../lib/fsx.js";
import { ensureAppDirs, getUserIds } from "./system.js";

export type DatabaseEngine = "sqlite" | "postgres" | "mysql";

function identifier(slug: string): string {
  return `app_${slug.replace(/-/g, "_")}`;
}

function randomPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function databaseEngineAvailable(engine: DatabaseEngine): Promise<boolean> {
  if (config.mock) return true;
  if (engine === "sqlite") return true;
  if (engine === "postgres") return hasCommand("psql");
  return hasCommand("mysql");
}

async function runAsPostgres(sql: string) {
  const base = ["-u", "postgres", "--", "psql", "-X", "-v", "ON_ERROR_STOP=1"];
  try {
    return await runCommand("runuser", base, { timeoutMs: 30000, input: sql });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return runCommand("sudo", ["-u", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1"], {
        timeoutMs: 30000,
        input: sql,
      });
    }
    throw error;
  }
}

async function provisionPostgres(slug: string): Promise<{ name: string; username: string; password: string; url: string }> {
  const name = identifier(slug);
  const username = identifier(slug);
  const password = randomPassword();
  if (config.mock) {
    return {
      name,
      username,
      password,
      url: `postgresql://${username}:${password}@127.0.0.1:5432/${name}`,
    };
  }
  if (!(await hasCommand("psql"))) {
    throw new Error("PostgreSQL is not installed on this server");
  }
  let roleCreated = false;
  let databaseCreated = false;
  try {
    await runAsPostgres(`CREATE ROLE "${username}" LOGIN PASSWORD '${password}';`);
    roleCreated = true;
    await runAsPostgres(`CREATE DATABASE "${name}" OWNER "${username}";`);
    databaseCreated = true;
    await runCommand("psql", ["-h", "127.0.0.1", "-U", username, "-d", name, "-tAc", "SELECT 1"], {
      env: { PGPASSWORD: password },
      timeoutMs: 15000,
    });
  } catch (error) {
    if (databaseCreated) {
      await runAsPostgres(`DROP DATABASE IF EXISTS "${name}";`).catch(() => undefined);
    }
    if (roleCreated) {
      await runAsPostgres(`DROP ROLE IF EXISTS "${username}";`).catch(() => undefined);
    }
    throw new Error(`PostgreSQL provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    name,
    username,
    password,
    url: `postgresql://${username}:${encodeURIComponent(password)}@127.0.0.1:5432/${name}`,
  };
}

async function provisionMysql(slug: string): Promise<{ name: string; username: string; password: string; url: string }> {
  const name = identifier(slug);
  const username = identifier(slug);
  const password = randomPassword();
  if (config.mock) {
    return {
      name,
      username,
      password,
      url: `mysql://${username}:${password}@127.0.0.1:3306/${name}`,
    };
  }
  if (!(await hasCommand("mysql"))) {
    throw new Error("MySQL is not installed on this server");
  }
  let databaseCreated = false;
  let userCreated = false;
  try {
    await runCommand("mysql", ["--protocol=socket", "-uroot"], {
      input: `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      timeoutMs: 30000,
    });
    databaseCreated = true;
    await runCommand("mysql", ["--protocol=socket", "-uroot"], {
      input: `CREATE USER '${username}'@'127.0.0.1' IDENTIFIED BY '${password}'; GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${username}'@'127.0.0.1'; FLUSH PRIVILEGES;`,
      timeoutMs: 30000,
    });
    userCreated = true;
    await runCommand("mysql", ["-h", "127.0.0.1", "-u", username, "-D", name], {
      env: { MYSQL_PWD: password },
      input: "SELECT 1;",
      timeoutMs: 15000,
    });
  } catch (error) {
    const cleanup = [
      userCreated ? `DROP USER IF EXISTS '${username}'@'127.0.0.1';` : "",
      databaseCreated ? `DROP DATABASE IF EXISTS \`${name}\`;` : "",
    ].join(" ");
    if (cleanup.trim()) {
      await runCommand("mysql", ["--protocol=socket", "-uroot"], {
        allowFailure: true,
        input: cleanup,
        timeoutMs: 15000,
      }).catch(() => undefined);
    }
    throw new Error(`MySQL provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    name,
    username,
    password,
    url: `mysql://${username}:${encodeURIComponent(password)}@127.0.0.1:3306/${name}`,
  };
}

async function provisionSqlite(app: AppRow): Promise<{ name: string; username: null; password: null; url: string }> {
  const shared = appSharedDir(app.name);
  await ensureAppDirs(app.name);
  const file = path.join(shared, "data.sqlite");
  try {
    const existing = await fsp.lstat(file).catch(() => null);
    if (existing?.isSymbolicLink()) await fsp.rm(file, { force: true });
    const regularFile = !existing || existing.isFile() || existing.isSymbolicLink();
    if (regularFile) {
      const flags = config.isLinux
        ? fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_APPEND |
          fsConstants.O_NOFOLLOW |
          fsConstants.O_NONBLOCK
        : "a";
      const handle = await fsp.open(file, flags, 0o660);
      try {
        const stats = await handle.stat();
        if (stats.isFile()) {
          await handle.chmod(0o660);
          const ids = await getUserIds(app.name).catch(() => null);
          if (ids) await handle.chown(ids.uid, ids.gid);
        }
      } finally {
        await handle.close();
      }
    }
  } catch {
    // The app can create the file itself on first use if provisioning failed.
  }
  return { name: "data.sqlite", username: null, password: null, url: `file:${file}` };
}

export async function provisionDatabase(app: AppRow, engine: DatabaseEngine): Promise<DatabaseRow> {
  if (!(await databaseEngineAvailable(engine))) {
    throw new Error(`${engine} is not available on this server`);
  }
  await ensureAppDirs(app.name);
  if (engine === "sqlite") {
    const info = await provisionSqlite(app);
    return createDatabase({ appId: app.id, engine, ...info });
  }
  if (engine === "postgres") {
    const info = await provisionPostgres(app.name);
    return createDatabase({ appId: app.id, engine, ...info });
  }
  const info = await provisionMysql(app.name);
  return createDatabase({ appId: app.id, engine, ...info });
}

export async function destroyDatabase(app: AppRow): Promise<void> {
  const database = getDatabase(app.id);
  if (!database) return;
  if (database.engine === "sqlite") {
    const file = path.resolve(database.url.replace(/^file:/, ""));
    const relative = path.relative(appSharedDir(app.name), file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to delete a SQLite file outside the app shared directory");
    }
    await fsp.rm(file, { force: true });
    await fsp.rm(`${file}-wal`, { force: true });
    await fsp.rm(`${file}-shm`, { force: true });
  } else if (database.engine === "postgres" && !config.mock) {
    if (!(await hasCommand("psql"))) {
      throw new Error("PostgreSQL is not available; cannot remove the app database");
    }
    const name = database.name;
    const username = database.username;
    await runAsPostgres(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid();`,
    );
    await runAsPostgres(`DROP DATABASE IF EXISTS "${name}";`);
    if (username) {
      await runAsPostgres(`DROP ROLE IF EXISTS "${username}";`);
    }
  } else if (database.engine === "mysql" && !config.mock) {
    if (!(await hasCommand("mysql"))) {
      throw new Error("MySQL is not available; cannot remove the app database");
    }
    const name = database.name;
    const username = database.username;
    const userSql = username
      ? `DROP USER IF EXISTS '${username}'@'127.0.0.1'; DROP USER IF EXISTS '${username}'@'localhost';`
      : "";
    await runCommand("mysql", ["--protocol=socket", "-uroot"], {
      input: `DROP DATABASE IF EXISTS \`${name}\`; ${userSql}`,
      timeoutMs: 20000,
    });
  }
  deleteDatabaseRow(app.id);
}

export function databaseUrlForEnv(database: DatabaseRow | undefined): Record<string, string> {
  if (!database) return {};
  const values: Record<string, string> = { DATABASE_URL: database.url };
  if (database.engine === "sqlite") values.SQLITE_PATH = database.url.replace(/^file:/, "");
  return values;
}

export async function createDatabaseDir(app: AppRow): Promise<void> {
  await ensureDir(appSharedDir(app.name), 0o750);
}
