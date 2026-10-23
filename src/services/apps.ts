import fsp from "node:fs/promises";
import net from "node:net";
import { appDir, config } from "../config.js";
import {
  createApp as createAppRow,
  deleteAppRow,
  getApp,
  isPortTaken,
  listApps as listAppRows,
  updateApp,
  type AppRow,
} from "../db.js";
import { createBareRepo, deleteRepo } from "./git.js";
import { reloadCaddy } from "./caddy.js";
import { destroyDatabase } from "./database.js";
import {
  appLog,
  deleteAppUser,
  ensureAppDirs,
  ensureAppUser,
  getUserIds,
  removeUnit,
  writeEnvFile,
} from "./system.js";
import { normalizeDomain, validateAppName, validateCommand } from "../lib/validation.js";
import { chownIfPossible, ensureDir } from "../lib/fsx.js";
import { triggerDeployment } from "./deployer.js";

export interface GithubSourceInput {
  type: "github";
  installationId: number;
  repoId: number;
  repoFullName: string;
  branch: string;
}

export interface CreateAppInput {
  name: string;
  domain?: string | null;
  startCmd?: string | null;
  buildCmd?: string | null;
  installCmd?: string | null;
  memoryMb?: number | null;
  source?: GithubSourceInput;
}

async function portFree(port: number): Promise<boolean> {
  if (config.mock) return true;
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "0.0.0.0" }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocatePort(): Promise<number> {
  for (let port = config.appPortStart; port <= config.appPortEnd; port += 1) {
    if (!isPortTaken(port) && (await portFree(port))) return port;
  }
  throw new Error(`No free app ports between ${config.appPortStart} and ${config.appPortEnd}`);
}

export async function createApp(input: CreateAppInput): Promise<AppRow> {
  const name = validateAppName(input.name);
  if (getApp(name)) throw new Error(`App "${name}" already exists`);
  const domain = normalizeDomain(input.domain);
  if (domain && domain === config.dashboardDomain) {
    throw new Error("That domain is used by the dashboard");
  }
  const startCmd = validateCommand(input.startCmd);
  const buildCmd = validateCommand(input.buildCmd);
  const installCmd = validateCommand(input.installCmd);
  const memoryMb = input.memoryMb ?? null;
  const port = await allocatePort();

  const app = createAppRow({
    name,
    port,
    domain,
    installCmd,
    buildCmd,
    startCmd,
    memoryMb,
    sourceType: input.source?.type ?? "git",
    githubInstallationId: input.source?.installationId ?? null,
    githubRepoId: input.source?.repoId ?? null,
    githubRepoFullName: input.source?.repoFullName ?? null,
    githubBranch: input.source?.branch ?? null,
  });

  try {
    await ensureAppUser(name);
    await ensureAppDirs(name);
    await ensureDir(appDir(name), 0o750);
    await writeEnvFile(app, [], undefined);
    const ids = await getUserIds(name).catch(() => null);
    if (ids) await chownIfPossible(appDir(name), 0, ids.gid);
    await createBareRepo(app);
    await reloadCaddy(listAppRows()).catch((error) => {
      appLog(`created ${name} but Caddy reload failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (app.source_type === "github") {
      await triggerDeployment(app);
      return getApp(name) ?? app;
    }
    return app;
  } catch (error) {
    await rollbackCreate(app);
    throw error;
  }
}

async function rollbackCreate(app: AppRow): Promise<void> {
  await removeUnit(app.name).catch(() => undefined);
  await destroyDatabase(app).catch(() => undefined);
  await deleteRepo(app.name).catch(() => undefined);
  await deleteAppRow(app.id);
  await fsp.rm(appDir(app.name), { recursive: true, force: true }).catch(() => undefined);
  await deleteAppUser(app.name).catch(() => undefined);
  await reloadCaddy(listAppRows()).catch(() => undefined);
}

export interface UpdateAppInput {
  domain?: string | null;
  startCmd?: string | null;
  buildCmd?: string | null;
  installCmd?: string | null;
  memoryMb?: number | null;
}

export async function updateAppSettings(app: AppRow, input: UpdateAppInput): Promise<AppRow> {
  const patch: Parameters<typeof updateApp>[1] = {};
  if (input.domain !== undefined) {
    patch.domain = normalizeDomain(input.domain);
    if (patch.domain && patch.domain === config.dashboardDomain) {
      throw new Error("That domain is used by the dashboard");
    }
  }
  if (input.startCmd !== undefined) patch.startCmd = validateCommand(input.startCmd);
  if (input.buildCmd !== undefined) patch.buildCmd = validateCommand(input.buildCmd);
  if (input.installCmd !== undefined) patch.installCmd = validateCommand(input.installCmd);
  if (input.memoryMb !== undefined) {
    if (input.memoryMb !== null && (!Number.isInteger(input.memoryMb) || input.memoryMb < 64 || input.memoryMb > 16384)) {
      throw new Error("Memory limit must be between 64 and 16384 MB");
    }
    patch.memoryMb = input.memoryMb;
  }
  try {
    updateApp(app.id, patch);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: apps.domain")) {
      throw new Error("That domain is already used by another app");
    }
    throw error;
  }
  const updated = getApp(app.name);
  if (!updated) throw new Error("App disappeared");
  if (input.domain !== undefined) {
    await reloadCaddy(listAppRows()).catch((error) => {
      appLog(`Caddy reload failed after updating ${app.name}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  return updated;
}

export async function removeApp(app: AppRow, confirmation: string): Promise<void> {
  if (confirmation !== app.name) throw new Error("Confirmation does not match the app name");
  await removeUnit(app.name);
  await destroyDatabase(app);
  await deleteRepo(app.name);
  await fsp.rm(appDir(app.name), { recursive: true, force: true });
  await deleteAppRow(app.id);
  await reloadCaddy(listAppRows()).catch((error) => {
    appLog(`Caddy reload failed after deleting ${app.name}: ${error instanceof Error ? error.message : String(error)}`);
  });
  await deleteAppUser(app.name).catch((error) => {
    appLog(`failed to delete system user for ${app.name}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

export function listApps(): AppRow[] {
  return listAppRows();
}
