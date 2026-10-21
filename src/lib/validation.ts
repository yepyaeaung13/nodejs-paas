import { z } from "zod";

export const appNameSchema = z
  .string()
  .trim()
  .min(3, "App name must be at least 3 characters")
  .max(24, "App name must be at most 24 characters")
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "Use lowercase letters, numbers and hyphens; start with a letter and end with a letter or number")
  .refine((value) => !value.includes("--"), "App name cannot contain consecutive hyphens");

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(48, "Username is too long")
  .regex(/^[a-zA-Z0-9._-]+$/, "Username may contain letters, numbers, dots, underscores and hyphens");

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(256, "Password is too long");

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253, "Domain is too long")
  .refine((value) => {
    if (value.length === 0) return true;
    if (value === "localhost") return true;
    if (value.includes("://") || value.includes("/") || value.includes(":") || /\s/.test(value)) return false;
    return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
  }, "Enter a valid domain such as app.example.com");

export const commandSchema = z
  .string()
  .trim()
  .max(500, "Command is too long")
  .refine((value) => !/[\r\n\0]/.test(value), "Command cannot contain newlines");

export const envKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z_][A-Z0-9_]*$/, "Use uppercase environment variable names")
  .max(64, "Variable name is too long");

export const envValueSchema = z
  .string()
  .max(8192, "Variable value is too long")
  .refine((value) => !/[\0\r\n]/.test(value), "Variable values cannot contain NUL bytes or newlines");

const SSH_KEY_TYPES = new Set([
  "ssh-rsa",
  "ssh-ed25519",
  "ssh-dss",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
  "ssh-ed25519-cert-v01@openssh.com",
  "ssh-rsa-cert-v01@openssh.com",
]);

export function isValidSshPublicKey(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const type = parts[0];
  const blob = parts[1];
  if (!type || !blob || !SSH_KEY_TYPES.has(type)) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(blob)) return false;
  try {
    const decoded = Buffer.from(blob, "base64");
    return decoded.length > 32;
  } catch {
    return false;
  }
}

export const sshKeySchema = z
  .string()
  .trim()
  .max(8192, "Public key is too long")
  .refine((value) => !/[\r\n]/.test(value), "Paste a single public key")
  .refine(isValidSshPublicKey, "That does not look like an SSH public key");

export const memoryMbSchema = z
  .number()
  .int()
  .min(64, "Memory limit must be at least 64 MB")
  .max(16384, "Memory limit is too large")
  .nullable();

export function normalizeDomain(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const parsed = domainSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid domain");
  return parsed.data.length === 0 ? null : parsed.data;
}

export function validateAppName(value: string): string {
  const parsed = appNameSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid app name");
  return parsed.data;
}

export function validateCommand(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = commandSchema.safeParse(trimmed);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid command");
  return parsed.data;
}

export function validateEnvKey(value: string): string {
  const parsed = envKeySchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid variable name");
  return parsed.data;
}

export function escapeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@%+~,-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function formatEnvFile(values: Record<string, string>): string {
  const lines = ["# Managed by NodePaaS. Do not edit by hand."];
  for (const key of Object.keys(values).sort()) {
    const value = values[key]!;
    validateEnvKey(key);
    lines.push(`${key}=${escapeEnvValue(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function isValidDomainForCaddy(domain: string): boolean {
  return domainSchema.safeParse(domain).success;
}
