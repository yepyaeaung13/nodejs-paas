import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function writeFileAtomic(
  target: string,
  contents: string,
  mode: number = 0o644,
): Promise<void> {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tmp, contents, { encoding: "utf8", mode, flag: "wx" });
  if (process.platform !== "win32") {
    await fsp.chmod(tmp, mode).catch(() => undefined);
  }
  await fsp.rename(tmp, target);
}

export async function rmrf(target: string): Promise<void> {
  await fsp.rm(target, { recursive: true, force: true });
}

export async function chownIfPossible(target: string, uid?: number, gid?: number): Promise<void> {
  if (config.mock || !config.isLinux || uid === undefined || gid === undefined) return;
  await fsp.chown(target, uid, gid);
}

export async function chownRecursiveIfPossible(target: string, uid?: number, gid?: number): Promise<void> {
  if (config.mock || !config.isLinux || uid === undefined || gid === undefined) return;
  const entries = await fsp.readdir(target, { withFileTypes: true });
  await fsp.lchown(target, uid, gid);
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await chownRecursiveIfPossible(child, uid, gid);
    } else {
      await fsp.lchown(child, uid, gid).catch(() => undefined);
    }
  }
}

export async function ensureDir(target: string, mode?: number): Promise<void> {
  await fsp.mkdir(target, { recursive: true, mode });
}

export function ensureDirSync(target: string, mode?: number): void {
  fs.mkdirSync(target, { recursive: true, mode });
}
