import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { requireUser } from "./lib/http.js";
import { config } from "./config.js";
import { failInterruptedWork, getUserCount, createUser, listApps } from "./db.js";
import { hashPassword } from "./lib/password.js";
import { authRoutes } from "./routes/auth.js";
import { appRoutes } from "./routes/apps.js";
import { internalRoutes } from "./routes/internal.js";
import { keyRoutes } from "./routes/keys.js";
import { systemRoutes } from "./routes/system.js";
import { reloadCaddy } from "./services/caddy.js";
import { installHook } from "./services/git.js";
import { syncAuthorizedKeys } from "./services/ssh.js";

const PUBLIC_API = new Set(["/api/health", "/api/auth", "/api/setup", "/api/login"]);

function pathname(url: string | undefined): string {
  if (!url) return "/";
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}

function bootstrapAdmin(): void {
  const username = process.env.PAAS_ADMIN_USER?.trim();
  const password = process.env.PAAS_ADMIN_PASSWORD;
  if (!username || !password) return;
  if (getUserCount() > 0) return;
  if (username.length < 3 || password.length < 10) {
    console.warn("[paas] PAAS_ADMIN_USER/PAAS_ADMIN_PASSWORD ignored: username >= 3 and password >= 10 required");
    return;
  }
  createUser(username, hashPassword(password));
  console.log(`[paas] bootstrapped admin user ${username}`);
}

export async function start(): Promise<void> {
  failInterruptedWork();
  bootstrapAdmin();

  for (const existing of listApps()) {
    await installHook(existing.name).catch((error) => {
      console.warn(
        `[paas] could not refresh git hook for ${existing.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie);

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    return payload;
  });

  app.addHook("preHandler", async (request) => {
    const path = pathname(request.url);
    if (!path.startsWith("/api/")) return;
    if (path.startsWith("/api/internal/")) return;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin) {
        try {
          const parsed = new URL(origin);
          if (parsed.host !== request.headers.host) {
            throw new Error("Cross-origin request rejected");
          }
        } catch {
          const error = new Error("Cross-origin request rejected") as Error & { statusCode: number };
          error.statusCode = 403;
          throw error;
        }
      }
    }
    if (PUBLIC_API.has(path)) return;
    requireUser(request);
  });

  await app.register(systemRoutes);
  await app.register(authRoutes);
  await app.register(appRoutes);
  await app.register(keyRoutes);
  await app.register(internalRoutes);

  const publicDir = fileURLToPath(new URL("../public", import.meta.url));
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    wildcard: false,
    index: ["index.html"],
    cacheControl: true,
    maxAge: 0,
    immutable: false,
  });

  app.setNotFoundHandler((request, reply) => {
    if (pathname(request.url).startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.code(404).type("text/plain").send("Not found");
  });

  app.setErrorHandler((error, request, reply) => {
    const status = Number((error as { statusCode?: number }).statusCode) || 500;
    if (status >= 500) {
      request.log.error(error);
    }
    const message =
      status >= 500 && process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error instanceof Error
          ? error.message
          : String(error);
    return reply.code(status).send({ error: message });
  });

  await syncAuthorizedKeys().catch((error) => {
    app.log.warn(`could not sync authorized_keys: ${error instanceof Error ? error.message : String(error)}`);
  });
  await reloadCaddy(listApps()).catch((error) => {
    app.log.warn(`could not reload Caddy: ${error instanceof Error ? error.message : String(error)}`);
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`NodePaaS dashboard: ${config.publicUrl}`);
  if (config.mock) {
    app.log.warn("Running in mock mode: systemd, useradd, npm builds, Caddy and journalctl are not executed.");
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
