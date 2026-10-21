import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { listSshKeys } from "../db.js";
import { chownIfPossible, ensureDir, writeFileAtomic } from "../lib/fsx.js";
import { getUserIdsByName } from "./system.js";

const FORCED_COMMAND = 'command="/usr/local/bin/paas-git-hook",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty';

export function sshFingerprint(publicKey: string): string {
  const parts = publicKey.trim().split(/\s+/);
  const blob = parts[1] ?? "";
  try {
    const digest = crypto.createHash("sha256").update(Buffer.from(blob, "base64")).digest("base64").replace(/=+$/, "");
    return `SHA256:${digest}`;
  } catch {
    return "SHA256:unknown";
  }
}

export async function syncAuthorizedKeys(): Promise<void> {
  const keys = listSshKeys();
  const contents = keys
    .map((key) => `${FORCED_COMMAND} ${key.public_key.trim()}\n`)
    .join("");
  const target = config.authorizedKeysPath;
  await ensureDir(path.dirname(target), 0o700);
  await writeFileAtomic(target, contents, 0o600);
  const ids = await getUserIdsByName(config.sshUser);
  if (ids) {
    await fsp.chmod(path.dirname(target), 0o700).catch(() => undefined);
    await fsp.chmod(target, 0o600).catch(() => undefined);
    await chownIfPossible(path.dirname(target), ids.uid, ids.gid);
    await chownIfPossible(target, ids.uid, ids.gid);
  }
}

export async function removeAuthorizedKey(publicKey: string): Promise<void> {
  const target = config.authorizedKeysPath;
  try {
    const contents = await fsp.readFile(target, "utf8");
    const filtered = contents
      .split("\n")
      .filter((line) => line.trim().length > 0 && !line.includes(publicKey.trim().split(/\s+/)[1] ?? "__missing__"))
      .join("\n");
    await writeFileAtomic(target, filtered.length > 0 ? `${filtered}\n` : "", 0o600);
  } catch {
    await syncAuthorizedKeys();
  }
}

export function gitRemote(slug: string, host: string): string {
  return `${config.sshUser}@${host}:${slug}.git`;
}
