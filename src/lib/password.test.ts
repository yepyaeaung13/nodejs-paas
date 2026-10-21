import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("hashes and verifies passwords", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.match(stored, /^scrypt\$/);
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("wrong password", stored), false);
});

test("does not accept malformed hashes", () => {
  assert.equal(verifyPassword("anything", ""), false);
  assert.equal(verifyPassword("anything", "scrypt$bad"), false);
  assert.equal(verifyPassword("anything", "bcrypt$1$2$3$4$5"), false);
});

test("uses a fresh salt for every hash", () => {
  const first = hashPassword("same password");
  const second = hashPassword("same password");
  assert.notEqual(first, second);
});
