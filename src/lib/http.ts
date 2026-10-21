import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { requestUser } from "../auth.js";
import type { UserRow } from "../db.js";

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export function requireUser(request: FastifyRequest): UserRow {
  const user = requestUser(request);
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

export function parseBody<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

export function clientIp(request: FastifyRequest): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}
