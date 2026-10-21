import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { AppRow } from "../db.js";
import { runCommand } from "../lib/command.js";
import { writeFileAtomic } from "../lib/fsx.js";
import { isValidDomainForCaddy } from "../lib/validation.js";
import { appLog } from "./system.js";

const BLOCKED_DOMAINS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function siteBlock(domain: string, port: number): string {
  return `${domain} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:${port}
}
`;
}

export function renderCaddyConfig(apps: AppRow[]): string {
  const blocks: string[] = ["# Managed by NodePaaS. Do not edit by hand."];
  if (
    config.dashboardDomain &&
    !BLOCKED_DOMAINS.has(config.dashboardDomain) &&
    isValidDomainForCaddy(config.dashboardDomain)
  ) {
    blocks.push(siteBlock(config.dashboardDomain, config.port));
  }
  for (const app of apps) {
    if (
      app.domain &&
      app.domain !== config.dashboardDomain &&
      !BLOCKED_DOMAINS.has(app.domain) &&
      isValidDomainForCaddy(app.domain)
    ) {
      blocks.push(siteBlock(app.domain, app.port));
    }
  }
  return `${blocks.join("\n")}\n`;
}

export async function reloadCaddy(apps: AppRow[]): Promise<void> {
  const contents = renderCaddyConfig(apps);
  await writeFileAtomic(config.caddyConfigPath, contents, 0o644);
  if (config.mock) {
    appLog(`[mock] wrote Caddy config ${config.caddyConfigPath}`);
    return;
  }
  if (!(await commandAvailable("caddy"))) {
    appLog("caddy is not installed; domains will not be proxied");
    return;
  }
  try {
    await runCommand("caddy", ["validate", "--config", config.caddyConfigPath, "--adapter", "caddyfile"], {
      timeoutMs: 20000,
    });
    await runCommand("systemctl", ["reload-or-restart", config.caddyService], { timeoutMs: 30000 });
    appLog("Caddy configuration reloaded");
  } catch (error) {
    appLog(`Caddy reload failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Caddy reload failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    const result = await runCommand(process.platform === "win32" ? "where" : "which", [command], {
      allowFailure: true,
      timeoutMs: 3000,
    });
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function readCaddyConfig(): Promise<string> {
  try {
    return await fsp.readFile(config.caddyConfigPath, "utf8");
  } catch {
    return "";
  }
}

export function caddyConfigPath(): string {
  return path.resolve(config.caddyConfigPath);
}
