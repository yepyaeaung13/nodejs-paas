import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface AppRow {
  id: number;
  name: string;
  port: number;
  domain: string | null;
  status: string;
  memory_mb: number | null;
  install_cmd: string | null;
  build_cmd: string | null;
  start_cmd: string | null;
  created_at: string;
  updated_at: string;
  last_deployed_at: string | null;
}

export interface EnvRow {
  app_id: number;
  key: string;
  value: string;
}

export interface DeploymentRow {
  id: number;
  app_id: number;
  sha: string;
  commit_message: string;
  status: string;
  log: string;
  created_at: string;
  finished_at: string | null;
}

export interface DatabaseRow {
  id: number;
  app_id: number;
  engine: "sqlite" | "postgres" | "mysql";
  name: string;
  username: string | null;
  password: string | null;
  url: string;
  created_at: string;
}

export interface SshKeyRow {
  id: number;
  name: string;
  public_key: string;
  fingerprint: string;
  created_at: string;
}

type Param = string | number | null;

export const db = new DatabaseSync(config.dbPath, { timeout: 5000 });
try {
  fs.chmodSync(config.dbPath, 0o600);
} catch {
  // best effort on platforms without POSIX permissions
}
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    port INTEGER NOT NULL UNIQUE,
    domain TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'idle',
    memory_mb INTEGER,
    install_cmd TEXT,
    build_cmd TEXT,
    start_cmd TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_deployed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS env_vars (
    app_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (app_id, key),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    sha TEXT NOT NULL,
    commit_message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    log TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    finished_at TEXT,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS deployments_app_created
    ON deployments(app_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS app_databases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL UNIQUE,
    engine TEXT NOT NULL,
    name TEXT NOT NULL,
    username TEXT,
    password TEXT,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ssh_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL UNIQUE,
    fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function row<T>(value: Record<string, unknown> | undefined): T | undefined {
  return value as T | undefined;
}

function rows<T>(value: Record<string, unknown>[]): T[] {
  return value as T[];
}

function run(sql: string, params: Param[] = []): { changes: number; lastInsertRowid: number } {
  const result = db.prepare(sql).run(...(params as never[]));
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

export function now(): string {
  return new Date().toISOString();
}

export function failInterruptedWork(): void {
  const timestamp = now();
  const note = `[boot] Deployment interrupted by a control plane restart\n`;
  db.exec("BEGIN IMMEDIATE");
  try {
    run(
      "UPDATE deployments SET status = 'failed', finished_at = ?, log = substr(COALESCE(log, '') || ?, -262144) WHERE status IN ('queued', 'building', 'starting')",
      [timestamp, note],
    );
    run("UPDATE apps SET status = 'failed', updated_at = ? WHERE status IN ('queued', 'building', 'starting')", [
      timestamp,
    ]);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getUserCount(): number {
  const result = row<{ count: number }>(db.prepare("SELECT COUNT(*) AS count FROM users").get());
  return Number(result?.count ?? 0);
}

export function getUserById(id: number): UserRow | undefined {
  return row<UserRow>(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined);
}

export function getUserByUsername(username: string): UserRow | undefined {
  return row<UserRow>(
    db.prepare("SELECT * FROM users WHERE username = ?").get(username) as Record<string, unknown> | undefined,
  );
}

export function createUser(username: string, passwordHash: string): UserRow {
  const createdAt = now();
  const result = run("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)", [
    username,
    passwordHash,
    createdAt,
  ]);
  return { id: result.lastInsertRowid, username, password_hash: passwordHash, created_at: createdAt };
}

export function listApps(): AppRow[] {
  return rows<AppRow>(db.prepare("SELECT * FROM apps ORDER BY name ASC").all() as Record<string, unknown>[]);
}

export function getApp(name: string): AppRow | undefined {
  return row<AppRow>(db.prepare("SELECT * FROM apps WHERE name = ?").get(name) as Record<string, unknown> | undefined);
}

export function getAppById(id: number): AppRow | undefined {
  return row<AppRow>(db.prepare("SELECT * FROM apps WHERE id = ?").get(id) as Record<string, unknown> | undefined);
}

export function isPortTaken(port: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM apps WHERE port = ?").get(port));
}

export function createApp(input: {
  name: string;
  port: number;
  domain: string | null;
  installCmd: string | null;
  buildCmd: string | null;
  startCmd: string | null;
  memoryMb: number | null;
}): AppRow {
  const timestamp = now();
  const result = run(
    `INSERT INTO apps (name, port, domain, status, memory_mb, install_cmd, build_cmd, start_cmd, created_at, updated_at)
     VALUES (?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.port,
      input.domain,
      input.memoryMb,
      input.installCmd,
      input.buildCmd,
      input.startCmd,
      timestamp,
      timestamp,
    ],
  );
  const created = getAppById(result.lastInsertRowid);
  if (!created) throw new Error("Failed to create app");
  return created;
}

export interface AppPatch {
  domain?: string | null;
  status?: string;
  memoryMb?: number | null;
  installCmd?: string | null;
  buildCmd?: string | null;
  startCmd?: string | null;
  lastDeployedAt?: string | null;
}

export function updateApp(id: number, patch: AppPatch): void {
  const sets: string[] = [];
  const params: Param[] = [];
  if (patch.domain !== undefined) {
    sets.push("domain = ?");
    params.push(patch.domain);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (patch.memoryMb !== undefined) {
    sets.push("memory_mb = ?");
    params.push(patch.memoryMb);
  }
  if (patch.installCmd !== undefined) {
    sets.push("install_cmd = ?");
    params.push(patch.installCmd);
  }
  if (patch.buildCmd !== undefined) {
    sets.push("build_cmd = ?");
    params.push(patch.buildCmd);
  }
  if (patch.startCmd !== undefined) {
    sets.push("start_cmd = ?");
    params.push(patch.startCmd);
  }
  if (patch.lastDeployedAt !== undefined) {
    sets.push("last_deployed_at = ?");
    params.push(patch.lastDeployedAt);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  params.push(now());
  params.push(id);
  run(`UPDATE apps SET ${sets.join(", ")} WHERE id = ?`, params);
}

export function deleteAppRow(id: number): void {
  run("DELETE FROM apps WHERE id = ?", [id]);
}

export function listEnv(appId: number): EnvRow[] {
  return rows<EnvRow>(
    db.prepare("SELECT * FROM env_vars WHERE app_id = ? ORDER BY key ASC").all(appId) as Record<string, unknown>[],
  );
}

export function replaceEnv(appId: number, vars: Record<string, string>): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    run("DELETE FROM env_vars WHERE app_id = ?", [appId]);
    for (const [key, value] of Object.entries(vars)) {
      run("INSERT INTO env_vars (app_id, key, value) VALUES (?, ?, ?)", [appId, key, value]);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createDeployment(appId: number, sha: string, commitMessage: string): DeploymentRow {
  const createdAt = now();
  const result = run(
    "INSERT INTO deployments (app_id, sha, commit_message, status, log, created_at) VALUES (?, ?, ?, 'queued', '', ?)",
    [appId, sha, commitMessage, createdAt],
  );
  const deployment = getDeployment(result.lastInsertRowid);
  if (!deployment) throw new Error("Failed to create deployment");
  return deployment;
}

export function getDeployment(id: number): DeploymentRow | undefined {
  return row<DeploymentRow>(
    db.prepare("SELECT * FROM deployments WHERE id = ?").get(id) as Record<string, unknown> | undefined,
  );
}

export function getDeploymentForApp(appId: number, id: number): DeploymentRow | undefined {
  return row<DeploymentRow>(
    db.prepare("SELECT * FROM deployments WHERE id = ? AND app_id = ?").get(id, appId) as
      | Record<string, unknown>
      | undefined,
  );
}

export function listDeployments(appId: number, limit = 30): DeploymentRow[] {
  return rows<DeploymentRow>(
    db
      .prepare("SELECT * FROM deployments WHERE app_id = ? ORDER BY id DESC LIMIT ?")
      .all(appId, limit) as Record<string, unknown>[],
  );
}

export function updateDeployment(
  id: number,
  patch: { status?: string; log?: string; appendLog?: string; finishedAt?: string | null },
): void {
  const sets: string[] = [];
  const params: Param[] = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (patch.log !== undefined) {
    sets.push("log = ?");
    params.push(patch.log.slice(-262144));
  }
  if (patch.appendLog !== undefined) {
    sets.push("log = substr(COALESCE(log, '') || ?, -262144)");
    params.push(patch.appendLog);
  }
  if (patch.finishedAt !== undefined) {
    sets.push("finished_at = ?");
    params.push(patch.finishedAt);
  }
  if (sets.length === 0) return;
  params.push(id);
  run(`UPDATE deployments SET ${sets.join(", ")} WHERE id = ?`, params);
}

export function getDatabase(appId: number): DatabaseRow | undefined {
  return row<DatabaseRow>(
    db.prepare("SELECT * FROM app_databases WHERE app_id = ?").get(appId) as Record<string, unknown> | undefined,
  );
}

export function createDatabase(input: {
  appId: number;
  engine: DatabaseRow["engine"];
  name: string;
  username: string | null;
  password: string | null;
  url: string;
}): DatabaseRow {
  const createdAt = now();
  run(
    "INSERT INTO app_databases (app_id, engine, name, username, password, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [input.appId, input.engine, input.name, input.username, input.password, input.url, createdAt],
  );
  const created = getDatabase(input.appId);
  if (!created) throw new Error("Failed to create database");
  return created;
}

export function deleteDatabaseRow(appId: number): void {
  run("DELETE FROM app_databases WHERE app_id = ?", [appId]);
}

export function listSshKeys(): SshKeyRow[] {
  return rows<SshKeyRow>(
    db.prepare("SELECT * FROM ssh_keys ORDER BY id DESC").all() as Record<string, unknown>[],
  );
}

export function addSshKey(name: string, publicKey: string, fingerprint: string): SshKeyRow {
  const createdAt = now();
  const result = run(
    "INSERT INTO ssh_keys (name, public_key, fingerprint, created_at) VALUES (?, ?, ?, ?)",
    [name, publicKey, fingerprint, createdAt],
  );
  const found = row<SshKeyRow>(
    db.prepare("SELECT * FROM ssh_keys WHERE id = ?").get(result.lastInsertRowid) as Record<string, unknown> | undefined,
  );
  if (!found) throw new Error("Failed to add SSH key");
  return found;
}

export function deleteSshKey(id: number): SshKeyRow | undefined {
  const found = row<SshKeyRow>(
    db.prepare("SELECT * FROM ssh_keys WHERE id = ?").get(id) as Record<string, unknown> | undefined,
  );
  if (!found) return undefined;
  run("DELETE FROM ssh_keys WHERE id = ?", [id]);
  return found;
}

export function countApps(): number {
  const result = row<{ count: number }>(db.prepare("SELECT COUNT(*) AS count FROM apps").get());
  return Number(result?.count ?? 0);
}

export function countDeployments(status?: string): number {
  const result = status
    ? row<{ count: number }>(db.prepare("SELECT COUNT(*) AS count FROM deployments WHERE status = ?").get(status))
    : row<{ count: number }>(db.prepare("SELECT COUNT(*) AS count FROM deployments").get());
  return Number(result?.count ?? 0);
}

export interface DeploymentWithApp extends DeploymentRow {
  app_name: string;
}

export function listRecentDeployments(limit = 12): DeploymentWithApp[] {
  return rows<DeploymentWithApp>(
    db
      .prepare(
        `SELECT d.*, a.name AS app_name
         FROM deployments d JOIN apps a ON a.id = d.app_id
         ORDER BY d.id DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[],
  );
}

export function countDatabases(): number {
  const result = row<{ count: number }>(db.prepare("SELECT COUNT(*) AS count FROM app_databases").get());
  return Number(result?.count ?? 0);
}
