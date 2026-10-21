import fsp from "node:fs/promises";
import path from "node:path";
import { config, repoDir } from "../config.js";
import { runCommand } from "../lib/command.js";
import {
  chownRecursiveIfPossible,
  ensureDir,
  pathExists,
  writeFileAtomic,
} from "../lib/fsx.js";
import { appLog, getUserIdsByName } from "./system.js";

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function gitArgs(repo: string, args: string[]): string[] {
  return ["-c", `safe.directory=${repo}`, "--git-dir", repo, ...args];
}

export function postReceiveHook(slug: string): string {
  const tokenFile = shQuote(config.internalTokenFile);
  const endpoint = shQuote(`${config.hookUrl.replace(/\/$/, "")}/api/internal/deploy/${slug}`);
  return `#!/bin/sh
set -u
token_file=${tokenFile}
url=${endpoint}
while read -r old new ref; do
  case "$ref" in
    refs/heads/main|refs/heads/master)
      [ -f "$token_file" ] || exit 0
      token=$(cat "$token_file")
      printf 'header = "Authorization: Bearer %s"\\n' "$token" | \\
        curl -fsS --max-time 10 -X POST --config - \\
          -H "Content-Type: application/json" \\
          -d "{\\"ref\\":\\"$ref\\",\\"sha\\":\\"$new\\"}" \\
          "$url" >/dev/null 2>&1 || true
      ;;
  esac
done
`;
}

export async function createBareRepo(slug: string): Promise<string> {
  const repo = repoDir(slug);
  await ensureDir(path.dirname(repo), 0o750);
  if (!(await pathExists(repo))) {
    await runCommand("git", ["init", "--bare", repo], { timeoutMs: 30000 });
  }
  await runCommand("git", gitArgs(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]), { timeoutMs: 10000 });
  await runCommand("git", gitArgs(repo, ["config", "core.logAllRefUpdates", "true"]), { timeoutMs: 10000 });
  await installHook(slug);
  await chownRepo(slug);
  return repo;
}

export async function installHook(slug: string): Promise<void> {
  const repo = repoDir(slug);
  const hookPath = path.join(repo, "hooks", "post-receive");
  await fsp.mkdir(path.join(repo, "hooks"), { recursive: true });
  await writeFileAtomic(hookPath, postReceiveHook(slug), 0o755);
  if (!config.mock) {
    await fsp.chmod(hookPath, 0o755).catch(() => undefined);
  }
}

async function chownRepo(slug: string): Promise<void> {
  const ids = await getUserIdsByName(config.sshUser);
  if (!ids) return;
  await chownRecursiveIfPossible(repoDir(slug), ids.uid, ids.gid);
  await fsp.chmod(repoDir(slug), 0o700).catch(() => undefined);
}

export async function repoExists(slug: string): Promise<boolean> {
  return pathExists(path.join(repoDir(slug), "HEAD"));
}

export async function deleteRepo(slug: string): Promise<void> {
  await fsp.rm(repoDir(slug), { recursive: true, force: true });
}

export async function resolveRef(slug: string, ref?: string): Promise<string> {
  const repo = repoDir(slug);
  const candidates: string[] = [];
  if (ref) {
    if (/^[0-9a-f]{7,40}$/i.test(ref)) {
      candidates.push(`${ref}^{commit}`);
    } else if (/^[A-Za-z0-9._/-]{1,200}$/.test(ref)) {
      candidates.push(ref, `refs/heads/${ref}`);
    } else {
      throw new Error("Invalid git reference");
    }
  } else {
    candidates.push("refs/heads/main", "refs/heads/master", "HEAD");
  }
  for (const candidate of candidates) {
    const result = await runCommand("git", gitArgs(repo, ["rev-parse", "--verify", "--quiet", candidate]), {
      allowFailure: true,
      timeoutMs: 10000,
    });
    const sha = result.stdout.trim();
    if (result.code === 0 && /^[0-9a-f]{40}$/.test(sha)) return sha;
  }
  throw new Error("No deployable commit found. Push a commit to main first.");
}

export interface CommitInfo {
  sha: string;
  message: string;
}

export async function commitInfo(slug: string, sha: string): Promise<CommitInfo> {
  const repo = repoDir(slug);
  const result = await runCommand("git", gitArgs(repo, ["log", "-1", "--format=%H%n%s", sha]), {
    allowFailure: true,
    timeoutMs: 10000,
  });
  if (result.code !== 0) return { sha, message: "" };
  const [fullSha, ...messageParts] = result.stdout.trim().split("\n");
  return { sha: fullSha || sha, message: messageParts.join(" ").trim() };
}

export async function exportRelease(
  slug: string,
  sha: string,
  destination: string,
  ids?: { uid: number; gid: number } | null,
): Promise<void> {
  if (config.mock) {
    await ensureDir(destination, 0o750);
    await writeFileAtomic(
      path.join(destination, "package.json"),
      JSON.stringify({ name: slug, scripts: { start: "node server.js" } }, null, 2),
    );
    await writeFileAtomic(path.join(destination, "server.js"), "console.log('mock app');\n");
    return;
  }
  const repo = repoDir(slug);
  const tarDir = config.tmpDir;
  const tarPath = path.join(tarDir, `${slug}-${sha.slice(0, 12)}-${Date.now()}.tar`);
  await ensureDir(tarDir, 0o711);
  await ensureDir(destination, 0o750);
  if (ids) {
    await fsp.chown(destination, ids.uid, ids.gid).catch(() => undefined);
  }
  try {
    await runCommand(
      "git",
      gitArgs(repo, ["archive", "--format=tar", `--output=${tarPath}`, sha]),
      { timeoutMs: 120000 },
    );
    if (ids) {
      await fsp.chown(tarPath, ids.uid, ids.gid);
      await fsp.chmod(tarPath, 0o600);
    }
    await runCommand("tar", ["--no-same-owner", "-xf", tarPath, "-C", destination], {
      timeoutMs: 120000,
      uid: ids?.uid,
      gid: ids?.gid,
    });
  } finally {
    await fsp.rm(tarPath, { force: true }).catch(() => undefined);
  }
}

export interface PackageJson {
  scripts?: Record<string, string>;
  engines?: { node?: string };
  packageManager?: string;
  [key: string]: unknown;
}

export async function readPackageJson(directory: string): Promise<PackageJson | null> {
  try {
    const raw = await fsp.readFile(path.join(directory, "package.json"), "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

export async function detectStartCommand(directory: string): Promise<string> {
  const pkg = await readPackageJson(directory);
  if (pkg?.scripts?.start) return "npm start";
  for (const candidate of [
    "server.js",
    "index.js",
    "app.js",
    "dist/server.js",
    "dist/index.js",
    "build/index.js",
  ]) {
    if (await pathExists(path.join(directory, candidate))) {
      return `node ${candidate}`;
    }
  }
  throw new Error("Could not find a start script. Add a start script to package.json or set a start command.");
}

export async function detectBuildCommand(directory: string): Promise<string | null> {
  const pkg = await readPackageJson(directory);
  if (pkg?.scripts?.build) return "npm run build";
  return null;
}

export async function detectInstallCommand(directory: string): Promise<string> {
  if (await pathExists(path.join(directory, "package-lock.json"))) {
    return "npm ci --include=dev --no-audit --no-fund";
  }
  if (await pathExists(path.join(directory, "pnpm-lock.yaml"))) {
    return "corepack pnpm install --frozen-lockfile";
  }
  if (await pathExists(path.join(directory, "yarn.lock"))) {
    return "corepack yarn install --frozen-lockfile";
  }
  return "npm install --include=dev --no-audit --no-fund";
}

export async function remoteUrl(slug: string): Promise<string> {
  return `ssh://${config.sshUser}@${config.sshHost ?? "<your-server>"}/${slug}.git`;
}
