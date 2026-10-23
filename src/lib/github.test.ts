import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createGithubAppJwt,
  isValidGithubBranch,
  isValidGithubRepoFullName,
  verifyGithubSignature,
} from "./github.js";

function decodePart(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
}

test("creates a verifiable GitHub App JWT", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const now = 1_700_000_000;
  const jwt = createGithubAppJwt("12345", privatePem, now);
  const [header, payload, signature] = jwt.split(".");
  assert.ok(header && payload && signature);

  const headerData = decodePart(header);
  const payloadData = decodePart(payload);
  assert.deepEqual(headerData, { alg: "RS256", typ: "JWT" });
  assert.equal(payloadData.iss, "12345");
  assert.equal(payloadData.iat, now - 60);
  assert.equal(payloadData.exp, now + 9 * 60);
  assert.equal(
    crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicPem,
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});

test("verifies GitHub webhook signatures", () => {
  const secret = "a long webhook secret";
  const body = Buffer.from(JSON.stringify({ hello: "world" }));
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

  assert.equal(verifyGithubSignature(secret, body, signature), true);
  assert.equal(verifyGithubSignature(secret, Buffer.from("tampered"), signature), false);
  assert.equal(verifyGithubSignature("wrong secret", body, signature), false);
  assert.equal(verifyGithubSignature(secret, body, undefined), false);
  assert.equal(verifyGithubSignature(secret, body, "sha1=abcd"), false);
  assert.equal(verifyGithubSignature(secret, body, "sha256=not-hex"), false);
});

test("validates GitHub branch names", () => {
  for (const branch of ["main", "release/v1", "feature_1", "fix.bug", "a-good-branch"]) {
    assert.equal(isValidGithubBranch(branch), true, branch);
  }
  for (const branch of ["", "-main", "main..next", "main//next", "main ", "main.", "main.lock", "a\\b", "a:b", "a~b", "a^b", "a?b", "a*b", "a[b", "a]b", "@{bad}", "feature/", "@", ".hidden", "feature/.hidden", "feature.lock/next"]) {
    assert.equal(isValidGithubBranch(branch), false, branch);
  }
});

test("validates GitHub repository names", () => {
  assert.equal(isValidGithubRepoFullName("owner/repo"), true);
  assert.equal(isValidGithubRepoFullName("my-org/my.repo_name"), true);
  assert.equal(isValidGithubRepoFullName("owner"), false);
  assert.equal(isValidGithubRepoFullName("owner/"), false);
  assert.equal(isValidGithubRepoFullName("owner/repo/extra"), false);
  assert.equal(isValidGithubRepoFullName("own er/repo"), false);
  assert.equal(isValidGithubRepoFullName("owner/.."), false);
});
