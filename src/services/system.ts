import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appDir,
  appControlDir,
  appEnvFile,
  appSharedDir,
  appUserName,
  config,
  unitName,
  unitPath,
} from "../config.js";
import type { AppRow, DatabaseRow, EnvRow } from "../db.js";
import { runCommand } from "../lib/command.js";
import { chownIfPossible, ensureDir, pathExists, writeFileAtomic } from "../lib/fsx.js";
import { formatEnvFile } from "../lib/validation.js";

export const RESERVED_ENV = new Set(["PORT", "NODE_ENV", "HOME", "PATH", "DATABASE_URL", "SQLITE_PATH"]);

export function appLog(message: string): void {
  console.log(`[paas] ${message}`);
}

export async function ensureAppUser(slug: string): Promise<void> {
  if (config.mock) return;
  const user = appUserName(slug);
  const result = await runCommand("id", ["-u", user], { allowFailure: true });
  if (result.code === 0) return;
  await ensureDir(appDir(slug), 0o755);
  await runCommand(
    "useradd",
    [
      "--system",
      "--user-group",
      "--no-create-home",
      "--home-dir",
      appDir(slug),
      "--shell",
      "/usr/sbin/nologin",
      user,
    ],
    { timeoutMs: 15000 },
  );
  const ids = await getUserIdsByName(user);
  if (!ids) throw new Error(`Created user ${user} but could not resolve its uid/gid`);
  appLog(`created system user ${user}`);
}

export async function deleteAppUser(slug: string): Promise<void> {
  if (config.mock) return;
  const user = appUserName(slug);
  await runCommand("userdel", [user], { allowFailure: true, timeoutMs: 15000 });
  await runCommand("groupdel", [user], { allowFailure: true, timeoutMs: 15000 });
}

export async function getUserIdsByName(user: string): Promise<{ uid: number; gid: number } | null> {
  if (config.mock || !config.isLinux) return null;
  const uidResult = await runCommand("id", ["-u", user], { allowFailure: true });
  const gidResult = await runCommand("id", ["-g", user], { allowFailure: true });
  if (uidResult.code !== 0 || gidResult.code !== 0) return null;
  const uid = Number(uidResult.stdout.trim());
  const gid = Number(gidResult.stdout.trim());
  if (!Number.isInteger(uid) || !Number.isInteger(gid)) return null;
  return { uid, gid };
}

export async function getUserIds(slug: string): Promise<{ uid: number; gid: number } | null> {
  return getUserIdsByName(appUserName(slug));
}

export function buildEnvironment(
  app: AppRow,
  envVars: EnvRow[],
  database: DatabaseRow | undefined,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const item of envVars) {
    if (RESERVED_ENV.has(item.key)) continue;
    values[item.key] = item.value;
  }
  if (database) {
    values.DATABASE_URL = database.url;
    if (database.engine === "sqlite") {
      const file = database.url.replace(/^file:/, "");
      values.SQLITE_PATH = file;
    }
  }
  values.NODE_ENV = "production";
  values.PORT = String(app.port);
  return values;
}

export async function writeEnvFile(
  app: AppRow,
  envVars: EnvRow[],
  database: DatabaseRow | undefined,
): Promise<void> {
  await ensureDir(appControlDir(app.name), 0o750);
  const contents = formatEnvFile(buildEnvironment(app, envVars, database));
  await writeFileAtomic(appEnvFile(app.name), contents, 0o600);
  const appIds = await getUserIds(app.name).catch(() => null);
  if (appIds) {
    await chownIfPossible(appControlDir(app.name), 0, appIds.gid);
    await fsp.chmod(appControlDir(app.name), 0o750).catch(() => undefined);
    await chownIfPossible(appEnvFile(app.name), 0, appIds.gid);
    await fsp.chmod(appEnvFile(app.name), 0o640).catch(() => undefined);
  }
}

export async function writeStartScript(slug: string, startCommand: string): Promise<void> {
  const target = path.join(appControlDir(slug), "start.sh");
  const contents = `#!/bin/sh\nset -e\nexec ${startCommand}\n`;
  await ensureDir(appControlDir(slug), 0o750);
  await writeFileAtomic(target, contents, 0o755);
  const appIds = await getUserIds(slug).catch(() => null);
  if (appIds) {
    await chownIfPossible(appControlDir(slug), 0, appIds.gid);
    await fsp.chmod(appControlDir(slug), 0o750).catch(() => undefined);
    await chownIfPossible(target, 0, appIds.gid);
    await fsp.chmod(target, 0o750).catch(() => undefined);
  }
}

export function systemdUnit(app: AppRow, startCommand: string): string {
  const dir = appDir(app.name);
  const user = appUserName(app.name);
  const envFile = appEnvFile(app.name);
  const memoryLine = app.memory_mb ? `MemoryMax=${app.memory_mb}M\n` : "";
  return `[Unit]
Description=NodePaaS app ${app.name}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
Group=${user}
WorkingDirectory=${dir}/current
Environment=HOME=${dir}/shared
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=${envFile}
ExecStart=/bin/sh ${path.join(appControlDir(app.name), "start.sh")}
Restart=always
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM
SyslogIdentifier=paas-${app.name}
${memoryLine}NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
`;
}

export async function writeUnit(app: AppRow, startCommand: string): Promise<void> {
  await writeStartScript(app.name, startCommand);
  await writeFileAtomic(unitPath(app.name), systemdUnit(app, startCommand), 0o644);
  if (!config.mock) {
    await runCommand("systemctl", ["daemon-reload"], { timeoutMs: 30000 });
  } else {
    appLog(`[mock] wrote systemd unit ${unitName(app.name)}`);
  }
}

export interface UnitFileSnapshot {
  start: string | null;
  unit: string | null;
}

export async function snapshotUnit(slug: string): Promise<UnitFileSnapshot> {
  const start = await fsp.readFile(path.join(appControlDir(slug), "start.sh"), "utf8").catch(() => null);
  const unit = await fsp.readFile(unitPath(slug), "utf8").catch(() => null);
  return { start, unit };
}

export async function restoreUnit(slug: string, snapshot: UnitFileSnapshot): Promise<void> {
  const startPath = path.join(appControlDir(slug), "start.sh");
  if (snapshot.start === null) {
    await fsp.rm(startPath, { force: true });
  } else {
    await writeFileAtomic(startPath, snapshot.start, 0o755);
    const appIds = await getUserIds(slug).catch(() => null);
    if (appIds) {
      await chownIfPossible(startPath, 0, appIds.gid);
      await fsp.chmod(startPath, 0o750).catch(() => undefined);
    }
  }
  if (snapshot.unit === null) {
    await fsp.rm(unitPath(slug), { force: true });
  } else {
    await writeFileAtomic(unitPath(slug), snapshot.unit, 0o644);
  }
  if (!config.mock) {
    await runCommand("systemctl", ["daemon-reload"], { timeoutMs: 30000 });
  }
}

export async function systemctl(
  args: string[],
  options: { allowFailure?: boolean; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (config.mock) {
    appLog(`[mock] systemctl ${args.join(" ")}`);
    return { code: 0, stdout: "", stderr: "" };
  }
  return runCommand("systemctl", args, {
    allowFailure: options.allowFailure ?? false,
    timeoutMs: options.timeoutMs ?? 60000,
  });
}

export async function startUnit(slug: string): Promise<void> {
  await systemctl(["enable", "--now", unitName(slug)]);
}

export async function stopUnit(slug: string): Promise<void> {
  await systemctl(["stop", unitName(slug)], { allowFailure: true });
}

export async function restartUnit(slug: string): Promise<void> {
  await systemctl(["restart", unitName(slug)]);
}

export async function unitStatus(slug: string): Promise<string> {
  if (config.mock) return "mock";
  const result = await systemctl(["is-active", unitName(slug)], { allowFailure: true, timeoutMs: 10000 });
  const value = result.stdout.trim();
  if (value === "active") return "running";
  if (value === "inactive") return "stopped";
  if (value === "failed") return "failed";
  return value || "unknown";
}

export async function removeUnit(slug: string): Promise<void> {
  await systemctl(["stop", unitName(slug)], { allowFailure: true });
  if (!config.mock && (await unitStatus(slug)) === "running") {
    throw new Error("Could not stop the app service");
  }
  await systemctl(["disable", unitName(slug)], { allowFailure: true });
  await fsp.rm(unitPath(slug), { force: true }).catch(() => undefined);
  if (!config.mock) {
    await runCommand("systemctl", ["daemon-reload"], { allowFailure: true, timeoutMs: 30000 });
  }
}

export async function cleanupReleases(slug: string, keep = 3): Promise<void> {
  const releasesDir = path.join(appDir(slug), "releases");
  let entries: string[];
  try {
    entries = await fsp.readdir(releasesDir);
  } catch {
    return;
  }
  entries.sort();
  const remove = entries.slice(0, Math.max(0, entries.length - keep));
  await Promise.all(remove.map((entry) => fsp.rm(path.join(releasesDir, entry), { recursive: true, force: true })));
}

export async function currentRelease(slug: string): Promise<string | null> {
  const link = path.join(appDir(slug), "current");
  try {
    const target = await fsp.readlink(link);
    return path.resolve(path.dirname(link), target);
  } catch {
    return null;
  }
}

export async function switchRelease(slug: string, releasePath: string): Promise<void> {
  const link = path.join(appDir(slug), "current");
  const relative = path.relative(appDir(slug), releasePath);
  const tmp = `${link}.${Date.now()}.tmp`;
  await fsp.rm(tmp, { force: true });
  await fsp.symlink(relative, tmp, "dir");
  try {
    await fsp.rename(tmp, link);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    await fsp.rm(link, { force: true });
    await fsp.rename(tmp, link);
  }
  const appIds = await getUserIds(slug).catch(() => null);
  if (appIds) {
    await fsp.lchown(link, appIds.uid, appIds.gid).catch(() => undefined);
  }
}

export async function removeReleaseLink(slug: string): Promise<void> {
  await fsp.rm(path.join(appDir(slug), "current"), { force: true }).catch(() => undefined);
}

export interface SystemInfo {
  platform: string;
  mock: boolean;
  version: string;
  hostname: string;
  uptimeSeconds: number;
  totalMemory: number;
  freeMemory: number;
  loadAverage: number[];
  caddy: boolean;
  postgres: boolean;
  mysql: boolean;
  dataDir: string;
  nodeVersion: string;
}

let cachedTools: { at: number; value: Omit<SystemInfo, "platform" | "mock" | "version" | "hostname" | "uptimeSeconds" | "totalMemory" | "freeMemory" | "loadAverage" | "dataDir" | "nodeVersion"> } | null = null;

export async function getSystemInfo(): Promise<SystemInfo> {
  const now = Date.now();
  if (!cachedTools || now - cachedTools.at > 30000) {
    const [caddy, postgres, mysql] = await Promise.all([
      hasAnyCommand(["caddy"]),
      hasAnyCommand(["pg_isready"]),
      hasAnyCommand(["mysql"]),
    ]);
    cachedTools = { at: now, value: { caddy, postgres, mysql } };
  }
  return {
    platform: `${os.platform()} ${os.release()}`,
    mock: config.mock,
    version: config.version,
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    loadAverage: os.loadavg(),
    dataDir: config.dataDir,
    nodeVersion: process.version,
    ...cachedTools.value,
  };
}

async function hasAnyCommand(names: string[]): Promise<boolean> {
  if (config.mock) return false;
  for (const name of names) {
    try {
      const result = await runCommand(process.platform === "win32" ? "where" : "which", [name], {
        allowFailure: true,
        timeoutMs: 3000,
      });
      if (result.code === 0) return true;
    } catch {
      // try next
    }
  }
  return false;
}

export function fileExists(target: string): boolean {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

export async function ensureAppDirs(slug: string): Promise<void> {
  await ensureDir(path.join(appDir(slug), "releases"), 0o750);
  await ensureDir(path.join(appDir(slug), "shared"), 0o750);
  await ensureDir(appControlDir(slug), 0o750);
  await ensureDir(path.join(appDir(slug), ".npm"), 0o750);
  const ids = await getUserIds(slug).catch(() => null);
  if (ids) {
    await chownIfPossible(appDir(slug), 0, ids.gid);
    await fsp.chmod(appDir(slug), 0o750).catch(() => undefined);
    const releases = path.join(appDir(slug), "releases");
    await chownIfPossible(releases, 0, ids.gid);
    await fsp.chmod(releases, 0o750).catch(() => undefined);
    await chownIfPossible(appControlDir(slug), 0, ids.gid);
    await fsp.chmod(appControlDir(slug), 0o750).catch(() => undefined);
    await chownIfPossible(appSharedDir(slug), ids.uid, ids.gid);
    await chownIfPossible(path.join(appDir(slug), ".npm"), ids.uid, ids.gid);
  }
}

export async function pathIsDirectory(target: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function translateStatus(status: string): Promise<string> {
  if (status === "active") return "running";
  return status;
}
