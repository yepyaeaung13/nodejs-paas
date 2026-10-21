import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  clearLoginFailures,
  clearSessionCookie,
  loginAllowed,
  recordLoginFailure,
  requestUser,
  setSessionCookie,
} from "../auth.js";
import {
  createUser,
  getUserByUsername,
  getUserCount,
} from "../db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { clientIp, HttpError, parseBody } from "../lib/http.js";
import { passwordSchema, usernameSchema } from "../lib/validation.js";

const setupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(512),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth", async (request, reply) => {
    if (getUserCount() === 0) {
      return reply.send({ setupRequired: true, user: null });
    }
    const user = requestUser(request);
    if (!user) throw new HttpError(401, "Unauthorized");
    return reply.send({
      setupRequired: false,
      user: { id: user.id, username: user.username },
    });
  });

  app.post("/api/setup", async (request, reply) => {
    if (getUserCount() > 0) throw new HttpError(409, "Setup has already been completed");
    const body = parseBody(setupSchema, request.body);
    let user;
    try {
      user = createUser(body.username, hashPassword(body.password));
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new HttpError(409, "That username is already taken");
      throw error;
    }
    setSessionCookie(request, reply, user.id);
    return reply.code(201).send({ user: { id: user.id, username: user.username } });
  });

  app.post("/api/login", async (request, reply) => {
    const ip = clientIp(request);
    if (!loginAllowed(ip)) throw new HttpError(429, "Too many login attempts. Try again later.");
    const body = parseBody(loginSchema, request.body);
    const user = getUserByUsername(body.username);
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      recordLoginFailure(ip);
      throw new HttpError(401, "Invalid username or password");
    }
    clearLoginFailures(ip);
    setSessionCookie(request, reply, user.id);
    return reply.send({ user: { id: user.id, username: user.username } });
  });

  app.post("/api/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}
