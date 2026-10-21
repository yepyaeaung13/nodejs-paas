import assert from "node:assert/strict";
import test from "node:test";
import {
  envValueSchema,
  escapeEnvValue,
  formatEnvFile,
  isValidSshPublicKey,
  normalizeDomain,
  validateAppName,
  validateCommand,
} from "./validation.js";

test("accepts safe app names", () => {
  assert.equal(validateAppName("my-api"), "my-api");
  assert.equal(validateAppName("api2"), "api2");
  assert.throws(() => validateAppName("My-API"));
  assert.throws(() => validateAppName("api--prod"));
  assert.throws(() => validateAppName("-api"));
  assert.throws(() => validateAppName("api-"));
  assert.throws(() => validateAppName("ab"));
});

test("normalizes domains", () => {
  assert.equal(normalizeDomain("API.Example.com"), "api.example.com");
  assert.equal(normalizeDomain(""), null);
  assert.equal(normalizeDomain(null), null);
  assert.throws(() => normalizeDomain("https://example.com"));
  assert.throws(() => normalizeDomain("example.com/path"));
  assert.throws(() => normalizeDomain("not a domain"));
});

test("validates commands", () => {
  assert.equal(validateCommand("  node server.js  "), "node server.js");
  assert.equal(validateCommand("   "), null);
  assert.throws(() => validateCommand("node\nserver.js"));
});

test("rejects multiline environment values", () => {
  assert.equal(envValueSchema.safeParse("a normal value").success, true);
  assert.equal(envValueSchema.safeParse("line one\nline two").success, false);
  assert.equal(envValueSchema.safeParse("carriage\rreturn").success, false);
});

test("escapes environment values for systemd", () => {
  assert.equal(escapeEnvValue("simple-value"), "simple-value");
  assert.equal(escapeEnvValue("two words"), '"two words"');
  assert.equal(escapeEnvValue('quote"here'), '"quote\\"here"');
  assert.equal(escapeEnvValue("dollar$sign"), '"dollar$sign"');
  assert.equal(escapeEnvValue("back\\slash"), '"back\\\\slash"');
});

test("formats environment files deterministically", () => {
  const output = formatEnvFile({ ZED: "last", ALPHA: "first value", DATABASE_URL: "file:/tmp/a.db" });
  assert.match(output, /^# Managed by NodePaaS/);
  assert.ok(output.indexOf("ALPHA=") < output.indexOf("DATABASE_URL="));
  assert.ok(output.indexOf("DATABASE_URL=") < output.indexOf("ZED="));
  assert.match(output, /ALPHA="first value"/);
  assert.throws(() => formatEnvFile({ "bad-key": "value" }));
});

test("accepts well-formed SSH public keys", () => {
  const blob = Buffer.alloc(64, 7).toString("base64");
  assert.equal(isValidSshPublicKey(`ssh-ed25519 ${blob} user@example`), true);
  assert.equal(isValidSshPublicKey("ssh-ed25519 not-base64!! user@example"), false);
  assert.equal(isValidSshPublicKey("not-a-key"), false);
});
