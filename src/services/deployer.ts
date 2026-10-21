import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { appDir, appUserName, config } from "../config.js";
import {
  createDeployment,
  getAppById,
  getDatabase,
  getDeployment,
  listEnv,
  updateApp,
  updateDeployment,
  type AppRow,
  type DeploymentRow,
} from "../db.js";
import { runCommand } from "../lib/command.js";
import { ensureDir, pathExists } from "../lib/fsx.js";
import {
  commitInfo,
  detectBuildCommand,
  detectInstallCommand,
  detectStartCommand,
  exportRelease,
  resolveRef,
} from "./git.js";
import {
  appLog,
  buildEnvironment,
  cleanupReleases,
  currentRelease,
  ensureAppDirs,
  ensureAppUser,
  getUserIds,
  removeReleaseLink,
  removeUnit,
  restartUnit,
  restoreUnit,
  snapshotUnit,
  startUnit,
  switchRelease,
  unitStatus,
  writeEnvFile,
  writeUnit,
  type UnitFileSnapshot,
} from "./system.js";

export type DeploymentEvent =
  | { type: "log"; line: string }
  | { type: "done"; status: string };

const deploymentEmitter = new EventEmitter();
deploymentEmitter.setMaxListeners(100);

const queues = new Map<string, Promise<void>>();
const liveLogs = new Map<number, string>();

export function onDeploymentEvent(id: number, listener: (event: DeploymentEvent) => void): () => void {
  const channel = `deployment:${id}`;
  deploymentEmitter.on(channel, listener);
  return () => deploymentEmitter.off(channel, listener);
}

function emit(id: number, event: DeploymentEvent): void {
  deploymentEmitter.emit(`deployment:${id}`, event);
}

const MAX_DEPLOYMENT_LOG = 1024 * 1024;

class DeploymentLogger {
  private buffer = "";
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  private written = 0;
  private truncated = false;

  constructor(private readonly id: number) {
    liveLogs.set(id, "");
  }

  line(text: string, force = false): void {
    if (this.closed || (this.truncated && !force)) return;
    const stamp = new Date().toISOString().slice(11, 19);
    for (const raw of String(text).replace(/\r/g, "").split("\n")) {
      let line = raw.length > 0 ? `[${stamp}] ${raw}` : "";
      if (!force && this.written + line.length + 1 > MAX_DEPLOYMENT_LOG) {
        line = "[log limit reached; further output omitted]";
        this.truncated = true;
      }
      this.written += line.length + 1;
      this.buffer += `${line}\n`;
      liveLogs.set(this.id, `${liveLogs.get(this.id) ?? ""}${line}\n`.slice(-262144));
      emit(this.id, { type: "log", line });
      if (this.truncated) break;
    }
    if (this.buffer.length > 6000) this.flush();
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.flush();
      }, 400);
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const chunk = this.buffer;
    this.buffer = "";
    updateDeployment(this.id, { appendLog: chunk });
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.flush();
    this.closed = true;
    liveLogs.delete(this.id);
  }
}

export async function triggerDeployment(
  app: AppRow,
  options: { ref?: string; sha?: string } = {},
): Promise<DeploymentRow> {
  const sha = await resolveRef(app.name, options.sha ?? options.ref);
  const info = await commitInfo(app.name, sha);
  return queueDeployment(app, info.sha, info.message);
}

export function queueDeployment(app: AppRow, sha: string, message: string): DeploymentRow {
  const deployment = createDeployment(app.id, sha, message);
  updateApp(app.id, { status: "queued" });
  const previous = queues.get(app.name) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(() => runDeployment(app.id, deployment.id))
    .catch((error) => {
      appLog(`deployment ${deployment.id} crashed: ${error instanceof Error ? error.stack : String(error)}`);
    });
  queues.set(app.name, task);
  void task.finally(() => {
    if (queues.get(app.name) === task) queues.delete(app.name);
  });
  return deployment;
}

async function runDeployment(appId: number, deploymentId: number): Promise<void> {
  const logger = new DeploymentLogger(deploymentId);
  let app = getAppById(appId);
  let releasePath: string | null = null;
  let previousRelease: string | null = null;
  let previousHealthy = false;
  let switchedRelease = false;
  let unitSnapshot: UnitFileSnapshot | null = null;

  const fail = (message: string) => {
    logger.line(`ERROR: ${message}`, true);
    updateDeployment(deploymentId, { status: "failed", finishedAt: new Date().toISOString() });
    emit(deploymentId, { type: "done", status: "failed" });
  };

  if (!app) {
    fail("App no longer exists");
    logger.close();
    return;
  }

  try {
    const deployment = getDeployment(deploymentId);
    if (!deployment) throw new Error("Deployment record disappeared");
    updateDeployment(deploymentId, { status: "building" });
    updateApp(app.id, { status: "building" });

    logger.line(`Deploying ${app.name} from ${deployment.sha.slice(0, 10)}${deployment.commit_message ? ` - ${deployment.commit_message}` : ""}`);
    logger.line(`Runtime: Node ${process.version}${config.mock ? " (mock mode)" : ""}`);

    await ensureAppUser(app.name);
    await ensureAppDirs(app.name);
    await ensureDir(path.join(appDir(app.name), ".tmp"), 0o750);

    const ids = await getUserIds(app.name);
    if (!ids && !config.mock) throw new Error("Could not resolve the app system user");
    if (ids) {
      const tmpDir = path.join(appDir(app.name), ".tmp");
      await fsp.chown(tmpDir, ids.uid, ids.gid).catch(() => undefined);
    }

    const envRows = listEnv(app.id);
    const database = getDatabase(app.id);
    await writeEnvFile(app, envRows, database);

    const releaseName = `${Date.now()}-${deployment.sha.slice(0, 7)}`;
    releasePath = path.join(appDir(app.name), "releases", releaseName);
    await ensureDir(releasePath, 0o750);
    logger.line("Extracting source archive");
    await exportRelease(app.name, deployment.sha, releasePath, ids);

    const installCommand = app.install_cmd ?? (await detectInstallCommand(releasePath));
    const buildCommand = app.build_cmd ?? (await detectBuildCommand(releasePath));
    const startCommand = app.start_cmd ?? (await detectStartCommand(releasePath));

    const appEnv = buildEnvironment(app, envRows, database);
    const baseEnv: Record<string, string> = {
      ...appEnv,
      HOME: path.join(appDir(app.name), "shared"),
      USER: appUserName(app.name),
      LOGNAME: appUserName(app.name),
      SHELL: "/bin/sh",
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: "C.UTF-8",
      TMPDIR: path.join(appDir(app.name), ".tmp"),
      npm_config_cache: path.join(appDir(app.name), ".npm"),
      npm_config_update_notifier: "false",
      NODE_ENV: "production",
      CI: "1",
    };

    logger.line(`$ ${installCommand}`);
    await runAppCommand(app, installCommand, releasePath, logger, { ...baseEnv, NODE_ENV: "development" }, 15 * 60 * 1000);

    if (buildCommand) {
      logger.line(`$ ${buildCommand}`);
      await runAppCommand(app, buildCommand, releasePath, logger, baseEnv, 15 * 60 * 1000);
    }

    updateDeployment(deploymentId, { status: "starting" });
    updateApp(app.id, { status: "starting" });

    const current = await currentRelease(app.name);
    if (current && (await pathExists(current))) {
      previousRelease = current;
      previousHealthy = (await unitStatus(app.name)) === "running";
    }

    await switchRelease(app.name, releasePath);
    switchedRelease = true;
    if (previousRelease) unitSnapshot = await snapshotUnit(app.name);
    await writeUnit(app, startCommand);
    logger.line(`Starting ${startCommand}`);
    await startUnit(app.name);
    await restartUnit(app.name);

    logger.line("Waiting for the application to accept connections");
    await waitForPort(app.port, 45_000);
    logger.line(`Application is listening on port ${app.port}`);

    updateDeployment(deploymentId, { status: "running", finishedAt: new Date().toISOString() });
    updateApp(app.id, { status: "running", lastDeployedAt: new Date().toISOString() });
    logger.line("Deployment successful");
    emit(deploymentId, { type: "done", status: "running" });
    await cleanupReleases(app.name, 3).catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.line(`Deployment failed: ${message}`, true);
    updateDeployment(deploymentId, { status: "failed", finishedAt: new Date().toISOString() });
    emit(deploymentId, { type: "done", status: "failed" });

    if (releasePath) {
      await fsp.rm(releasePath, { recursive: true, force: true }).catch(() => undefined);
    }

    let rolledBack = false;
    if (switchedRelease) {
      if (previousRelease) {
        try {
          logger.line(`Rolling back to ${path.basename(previousRelease)}`, true);
          if (unitSnapshot?.unit) await restoreUnit(app.name, unitSnapshot);
          await switchRelease(app.name, previousRelease);
          await restartUnit(app.name);
          await waitForPort(app.port, 20_000);
          rolledBack = true;
        } catch (rollbackError) {
          logger.line(
            `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          );
        }
      } else {
        await removeUnit(app.name).catch((error) => {
          logger.line(`Could not remove the failed app service: ${error instanceof Error ? error.message : String(error)}`);
        });
        await removeReleaseLink(app.name).catch(() => undefined);
      }
    }

    updateApp(app.id, {
      status: switchedRelease ? (rolledBack ? "running" : "failed") : previousHealthy ? "running" : "failed",
    });
    if (rolledBack) logger.line("Rollback complete; previous version is live");
  } finally {
    logger.close();
    app = getAppById(appId);
  }
}

async function runAppCommand(
  app: AppRow,
  command: string,
  cwd: string,
  logger: DeploymentLogger,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<void> {
  if (config.mock) {
    logger.line(`[mock] skipped: ${command}`);
    return;
  }
  const ids = await getUserIds(app.name);
  if (!ids && !config.mock) throw new Error("Could not resolve the app system user");
  await runCommand("/bin/sh", ["-c", command], {
    cwd,
    env,
    replaceEnv: true,
    uid: ids?.uid,
    gid: ids?.gid,
    timeoutMs,
    onLine: (line) => logger.line(line),
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  if (config.mock) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      await tryConnect("127.0.0.1", port);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`App did not open port ${port} in time${lastError ? ` (${lastError})` : ""}`);
}

function tryConnect(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const done = (error?: Error) => {
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(1500);
    socket.once("connect", () => done());
    socket.once("timeout", () => done(new Error("connection timeout")));
    socket.once("error", (error) => done(error));
  });
}

export async function refreshEnvironment(app: AppRow): Promise<void> {
  await writeEnvFile(app, listEnv(app.id), getDatabase(app.id));
}

export function currentDeploymentLog(id: number): string {
  return liveLogs.get(id) ?? getDeployment(id)?.log ?? "";
}
