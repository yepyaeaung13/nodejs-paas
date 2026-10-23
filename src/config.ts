import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const isLinux = process.platform === "linux";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function envFlag(name: string): boolean | undefined {
  const value = env(name);
  if (value === undefined) return undefined;
  return value === "1" || value.toLowerCase() === "true";
}

const explicitMock = envFlag("PAAS_MOCK");
const dataDir = path.resolve(env("PAAS_DATA_DIR") ?? (isLinux ? "/var/lib/paas" : "./.data"));
const mock = explicitMock ?? !isLinux;

const port = Number(env("PAAS_PORT") ?? 3001);
const appPortStart = Number(env("PAAS_APP_PORT_START") ?? 3100);
const appPortEnd = Number(env("PAAS_APP_PORT_END") ?? 3999);

export const config = {
  isLinux,
  mock,
  host: env("PAAS_HOST") ?? "0.0.0.0",
  port,
  trustProxy: env("PAAS_TRUST_PROXY") ?? "127.0.0.1",
  publicUrl: env("PAAS_PUBLIC_URL") ?? `http://localhost:${port}`,
  hookUrl: env("PAAS_HOOK_URL") ?? `http://127.0.0.1:${port}`,
  dataDir,
  dbPath: path.join(dataDir, "paas.db"),
  appsDir: path.join(dataDir, "apps"),
  reposDir: path.join(dataDir, "repos"),
  tmpDir: path.join(dataDir, "tmp"),
  logDir: path.join(dataDir, "logs"),
  sessionSecretFile: path.join(dataDir, "session.secret"),
  internalTokenFile:
    env("PAAS_INTERNAL_TOKEN_FILE") ??
    (isLinux ? "/etc/paas/internal.token" : path.join(dataDir, "internal.token")),
  internalToken: env("PAAS_INTERNAL_TOKEN"),
  sessionSecret: env("PAAS_SESSION_SECRET"),
  sshUser: env("PAAS_SSH_USER") ?? "paas",
  sshHost: env("PAAS_SSH_HOST"),
  authorizedKeysPath:
    env("PAAS_AUTHORIZED_KEYS") ??
    (isLinux ? "/home/paas/.ssh/authorized_keys" : path.join(dataDir, "authorized_keys")),
  caddyConfigPath:
    env("PAAS_CADDY_CONFIG") ??
    (isLinux ? "/etc/paas/apps.caddy" : path.join(dataDir, "apps.caddy")),
  caddyService: env("PAAS_CADDY_SERVICE") ?? "caddy",
  githubAppId: env("PAAS_GITHUB_APP_ID"),
  githubPrivateKeyFile:
    env("PAAS_GITHUB_PRIVATE_KEY_FILE") ??
    (isLinux ? "/etc/paas/github-app.pem" : path.join(dataDir, "github-app.pem")),
  githubWebhookSecret: env("PAAS_GITHUB_WEBHOOK_SECRET"),
  githubAppSlug: env("PAAS_GITHUB_APP_SLUG"),
  githubApiUrl: (env("PAAS_GITHUB_API_URL") ?? "https://api.github.com").replace(/\/+$/, ""),
  githubWebUrl: (env("PAAS_GITHUB_WEB_URL") ?? "https://github.com").replace(/\/+$/, ""),
  dashboardDomain: env("PAAS_DASHBOARD_DOMAIN")?.toLowerCase(),
  systemdDir: env("PAAS_SYSTEMD_DIR") ?? (isLinux ? "/etc/systemd/system" : path.join(dataDir, "systemd")),
  appPortStart,
  appPortEnd,
  nodeBinary: process.execPath,
  version: "0.1.0",
};

export function ensureDataDirs(): void {
  const dirs: Array<[string, number]> = [
    [config.dataDir, 0o711],
    [config.appsDir, 0o711],
    [config.reposDir, 0o711],
    [config.tmpDir, 0o711],
    [config.logDir, 0o700],
    [config.systemdDir, 0o755],
  ];
  for (const [dir, mode] of dirs) {
    fs.mkdirSync(dir, { recursive: true, mode });
    try {
      fs.chmodSync(dir, mode);
    } catch {
      // best effort on platforms without POSIX permissions
    }
  }
}

function readOrCreateSecret(file: string, bytes = 32): string {
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // create below
  }
  const secret = crypto.randomBytes(bytes).toString("base64url");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

ensureDataDirs();

export const sessionSecret = config.sessionSecret ?? readOrCreateSecret(config.sessionSecretFile);
export const internalToken = config.internalToken ?? readOrCreateSecret(config.internalTokenFile, 32);

export function writeInternalTokenFile(): void {
  try {
    const existing = fs.existsSync(config.internalTokenFile)
      ? fs.readFileSync(config.internalTokenFile, "utf8").trim()
      : "";
    if (existing !== internalToken) {
      fs.mkdirSync(path.dirname(config.internalTokenFile), { recursive: true });
      fs.writeFileSync(config.internalTokenFile, internalToken, { encoding: "utf8", mode: 0o640 });
    }
    try {
      fs.chmodSync(config.internalTokenFile, 0o640);
    } catch {
      // best effort on platforms without POSIX permissions
    }
    if (isLinux) {
      try {
        execFileSync("chgrp", [config.sshUser, config.internalTokenFile], { stdio: "ignore" });
      } catch {
        // The installer sets the group when the SSH user exists.
      }
    }
  } catch {
    // The API still works if the token file cannot be written; git hooks will fail loudly.
  }
}

writeInternalTokenFile();

export function appDir(slug: string): string {
  return path.join(config.appsDir, slug);
}

export function appReleasesDir(slug: string): string {
  return path.join(appDir(slug), "releases");
}

export function appSharedDir(slug: string): string {
  return path.join(appDir(slug), "shared");
}

export function appControlDir(slug: string): string {
  return path.join(appDir(slug), "control");
}

export function appEnvFile(slug: string): string {
  return path.join(appControlDir(slug), "app.env");
}

export function repoDir(slug: string): string {
  return path.join(config.reposDir, `${slug}.git`);
}

export function unitName(slug: string): string {
  return `paas-${slug}.service`;
}

export function unitPath(slug: string): string {
  return path.join(config.systemdDir, unitName(slug));
}

export function appUserName(slug: string): string {
  return `app_${slug.replace(/-/g, "_")}`;
}

export function appPortForSlot(slot: number): number {
  return config.appPortStart + slot;
}
