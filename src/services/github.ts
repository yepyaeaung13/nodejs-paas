import { constants } from "node:fs";
import fs from "node:fs/promises";
import { config } from "../config.js";
import { createGithubAppJwt } from "../lib/github.js";

const API_VERSION = "2022-11-28";
const CACHE_TTL = 60_000;
const TOKEN_SAFETY_MS = 60_000;

export interface GithubInstallation {
  id: number;
  account: string;
  type: string;
  avatarUrl: string | null;
}

export interface GithubRepository {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  installationId: number;
  account: string;
}

export interface GithubBranch {
  name: string;
  sha: string;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

export class GithubNotConfiguredError extends Error {
  constructor(message = "GitHub is not configured on this NodePaaS instance") {
    super(message);
    this.name = "GithubNotConfiguredError";
  }
}

export class GithubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
  }
}

const tokenCache = new Map<number, TokenCacheEntry>();
let repositoryCache: { at: number; value: GithubRepository[] } | null = null;
let installationCache: { at: number; value: GithubInstallation[] } | null = null;

export function githubMissingConfig(): string[] {
  const missing: string[] = [];
  if (!config.githubAppId) missing.push("PAAS_GITHUB_APP_ID");
  if (!config.githubPrivateKeyFile) missing.push("PAAS_GITHUB_PRIVATE_KEY_FILE");
  if (!config.githubWebhookSecret) missing.push("PAAS_GITHUB_WEBHOOK_SECRET");
  if (!config.githubAppSlug) missing.push("PAAS_GITHUB_APP_SLUG");
  return missing;
}

export function githubConfigured(): boolean {
  return githubMissingConfig().length === 0;
}

export async function githubStatus(): Promise<{
  configured: boolean;
  missing: string[];
  appSlug: string | null;
  installUrl: string | null;
  webhookUrl: string;
  apiUrl: string;
}> {
  const appSlug = config.githubAppSlug ?? null;
  const missing = githubMissingConfig();
  if (!missing.includes("PAAS_GITHUB_PRIVATE_KEY_FILE")) {
    try {
      await fs.access(config.githubPrivateKeyFile, fs.constants.R_OK);
    } catch {
      missing.push("PAAS_GITHUB_PRIVATE_KEY_FILE (not readable)");
    }
  }
  return {
    configured: missing.length === 0,
    missing,
    appSlug,
    installUrl: appSlug ? `${config.githubWebUrl}/apps/${encodeURIComponent(appSlug)}/installations/new` : null,
    webhookUrl: `${config.publicUrl.replace(/\/+$/, "")}/api/github/webhook`,
    apiUrl: config.githubApiUrl,
  };
}

async function readPrivateKey(): Promise<string> {
  if (!config.githubAppId || !config.githubPrivateKeyFile) throw new GithubNotConfiguredError();
  try {
    return await fs.readFile(config.githubPrivateKeyFile, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GithubNotConfiguredError(`Could not read GitHub App private key: ${message}`);
  }
}

async function appJwt(): Promise<string> {
  if (!config.githubAppId) throw new GithubNotConfiguredError();
  return createGithubAppJwt(config.githubAppId, await readPrivateKey());
}

interface GithubRequestOptions {
  method?: string;
  token?: string;
  jwt?: boolean;
  body?: unknown;
}

async function githubRequest<T>(pathname: string, options: GithubRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": `nodejs-paas/${config.version}`,
  };
  let authorization = options.token;
  if (options.jwt) authorization = await appJwt();
  if (authorization) headers.Authorization = `Bearer ${authorization}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${config.githubApiUrl}${pathname}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GithubApiError(502, `GitHub request failed: ${message}`);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `GitHub returned HTTP ${response.status}`;
    throw new GithubApiError(response.status, message);
  }
  return payload as T;
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt - Date.now() > TOKEN_SAFETY_MS) return cached.token;
  const result = await githubRequest<{ token?: string; expires_at?: string }>(
    `/app/installations/${installationId}/access_tokens`,
    { method: "POST", jwt: true, body: {} },
  );
  if (!result.token) throw new GithubApiError(502, "GitHub did not return an installation token");
  const expiresAt = result.expires_at ? Date.parse(result.expires_at) : Date.now() + 50 * 60 * 1000;
  tokenCache.set(installationId, {
    token: result.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 50 * 60 * 1000,
  });
  return result.token;
}

interface GithubApiInstallation {
  id?: number;
  account?: { login?: string; type?: string; avatar_url?: string | null };
}

export async function listInstallations(force = false): Promise<GithubInstallation[]> {
  if (!force && installationCache && Date.now() - installationCache.at < CACHE_TTL) {
    return installationCache.value;
  }
  const value: GithubInstallation[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await githubRequest<GithubApiInstallation[]>(
      `/app/installations?per_page=100&page=${page}`,
      { jwt: true },
    );
    const items = Array.isArray(result) ? result : [];
    for (const item of items) {
      if (!Number.isInteger(item.id)) continue;
      value.push({
        id: Number(item.id),
        account: item.account?.login ?? "unknown",
        type: item.account?.type ?? "User",
        avatarUrl: item.account?.avatar_url ?? null,
      });
    }
    if (items.length < 100) break;
  }
  installationCache = { at: Date.now(), value };
  return value;
}

interface GithubApiRepository {
  id?: number;
  full_name?: string;
  name?: string;
  owner?: { login?: string };
  private?: boolean;
  default_branch?: string;
  clone_url?: string;
  html_url?: string;
}

interface GithubRepositoryList {
  total_count?: number;
  repositories?: GithubApiRepository[];
}

function mapRepository(item: GithubApiRepository, installationId: number, account: string): GithubRepository | null {
  if (
    !Number.isInteger(item.id) ||
    typeof item.full_name !== "string" ||
    typeof item.name !== "string" ||
    typeof item.owner?.login !== "string"
  ) {
    return null;
  }
  return {
    id: Number(item.id),
    fullName: item.full_name,
    name: item.name,
    owner: item.owner.login,
    private: Boolean(item.private),
    defaultBranch: item.default_branch ?? "main",
    cloneUrl: item.clone_url ?? `${config.githubWebUrl}/${item.full_name}.git`,
    htmlUrl: item.html_url ?? `${config.githubWebUrl}/${item.full_name}`,
    installationId,
    account,
  };
}

export async function listRepositories(force = false): Promise<GithubRepository[]> {
  if (!force && repositoryCache && Date.now() - repositoryCache.at < CACHE_TTL) {
    return repositoryCache.value;
  }
  const installations = await listInstallations(force);
  const repositories: GithubRepository[] = [];
  for (const installation of installations) {
    const token = await getInstallationToken(installation.id);
    for (let page = 1; page <= 10; page += 1) {
      const result = await githubRequest<GithubRepositoryList>(
        `/installation/repositories?per_page=100&page=${page}`,
        { token },
      );
      const items = result.repositories ?? [];
      for (const item of items) {
        const mapped = mapRepository(item, installation.id, installation.account);
        if (mapped) repositories.push(mapped);
      }
      if (items.length < 100) break;
    }
  }
  repositories.sort((a, b) => a.fullName.localeCompare(b.fullName));
  repositoryCache = { at: Date.now(), value: repositories };
  return repositories;
}

export async function getRepositoryById(
  installationId: number,
  repoId: number,
  force = false,
): Promise<GithubRepository> {
  const repositories = await listRepositories(force);
  const found = repositories.find(
    (item) => item.id === repoId && item.installationId === installationId,
  );
  if (!found) throw new GithubApiError(404, "Repository is not available to this GitHub App installation");
  return found;
}

interface GithubApiBranch {
  name?: string;
  commit?: { sha?: string };
}

export async function listBranches(
  installationId: number,
  repoId: number,
): Promise<GithubBranch[]> {
  const repository = await getRepositoryById(installationId, repoId);
  const token = await getInstallationToken(installationId);
  const branches: GithubBranch[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await githubRequest<GithubApiBranch[]>(
      `/repos/${repository.fullName}/branches?per_page=100&page=${page}`,
      { token },
    );
    const items = Array.isArray(result) ? result : [];
    for (const item of items) {
      if (typeof item.name === "string" && item.name) {
        branches.push({ name: item.name, sha: item.commit?.sha ?? "" });
      }
    }
    if (items.length < 100) break;
  }
  return branches;
}

export async function getBranch(
  installationId: number,
  repository: GithubRepository,
  branch: string,
): Promise<GithubBranch> {
  const token = await getInstallationToken(installationId);
  const result = await githubRequest<GithubApiBranch>(
    `/repos/${repository.fullName}/branches/${encodeURIComponent(branch)}`,
    { token },
  );
  if (!result.name) throw new GithubApiError(404, "Branch not found");
  return { name: result.name, sha: result.commit?.sha ?? "" };
}

export function clearGithubCaches(): void {
  installationCache = null;
  repositoryCache = null;
  tokenCache.clear();
}
