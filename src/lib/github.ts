import crypto from "node:crypto";

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export function createGithubAppJwt(
  appId: string | number,
  privateKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: String(appId),
    }),
  );
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

export function verifyGithubSignature(
  secret: string,
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const supplied = signature.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(supplied, "hex");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export function isValidGithubBranch(value: string): boolean {
  if (value.length === 0 || value.length > 200 || value === "@") return false;
  if (value.startsWith("-") || value.endsWith("/") || value.endsWith(".") || value.endsWith(".lock")) {
    return false;
  }
  if (/[\x00-\x20\x7f~^:?*[\]\\]/.test(value)) return false;
  if (value.includes("..") || value.includes("//") || value.includes("@{")) return false;
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== ".." &&
      !segment.startsWith(".") &&
      !segment.endsWith(".lock"),
  );
}

export function isValidGithubRepoFullName(value: string): boolean {
  if (value.length < 3 || value.length > 201) return false;
  const parts = value.split("/");
  if (parts.length !== 2) return false;
  const [owner, repo] = parts;
  if (!owner || !repo) return false;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})$/.test(owner)) return false;
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return false;
  return repo !== "." && repo !== "..";
}
