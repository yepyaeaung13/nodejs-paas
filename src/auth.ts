import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sessionSecret } from "./config.js";
import { getUserById, type UserRow } from "./db.js";

export const SESSION_COOKIE = "paas_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  uid: number;
  exp: number;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

export function createSessionToken(userId: number): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const index = token.lastIndexOf(".");
  if (index <= 0) return null;
  const encoded = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = sign(encoded);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!Number.isInteger(payload.uid) || !Number.isFinite(payload.exp)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requestUser(request: FastifyRequest): UserRow | null {
  const token = request.cookies[SESSION_COOKIE];
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return getUserById(payload.uid) ?? null;
}

export function setSessionCookie(request: FastifyRequest, reply: FastifyReply, userId: number, secure?: boolean): void {
  const isSecure = secure ?? (request.protocol === "https" || request.headers["x-forwarded-proto"] === "https");
  reply.setCookie(SESSION_COOKIE, createSessionToken(userId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

interface AttemptBucket {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptBucket>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;

function bucket(ip: string): AttemptBucket {
  const now = Date.now();
  const existing = attempts.get(ip);
  if (!existing || existing.resetAt < now) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, fresh);
    return fresh;
  }
  return existing;
}

export function loginAllowed(ip: string): boolean {
  return bucket(ip).count < MAX_ATTEMPTS;
}

export function recordLoginFailure(ip: string): void {
  bucket(ip).count += 1;
}

export function clearLoginFailures(ip: string): void {
  attempts.delete(ip);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, value] of attempts) {
    if (value.resetAt < now) attempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();
