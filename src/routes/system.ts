import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  countApps,
  countDatabases,
  countDeployments,
  listApps,
  listRecentDeployments,
} from "../db.js";
import { requireUser } from "../lib/http.js";
import { databaseEngineAvailable } from "../services/database.js";
import { getSystemInfo } from "../services/system.js";

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async (_request, reply) => {
    return reply.send({ ok: true, version: config.version, mock: config.mock });
  });

  app.get("/api/system", async (request, reply) => {
    requireUser(request);
    const [system, postgres, mysql] = await Promise.all([
      getSystemInfo(),
      databaseEngineAvailable("postgres"),
      databaseEngineAvailable("mysql"),
    ]);
    return reply.send({
      system,
      ssh: {
        user: config.sshUser,
        host: config.sshHost ?? request.hostname,
      },
      caddyConfig: config.caddyConfigPath,
      engines: { sqlite: true, postgres, mysql },
    });
  });

  app.get("/api/overview", async (request, reply) => {
    requireUser(request);
    const apps = listApps();
    const system = await getSystemInfo();
    return reply.send({
      apps,
      recent: listRecentDeployments(10),
      system,
      stats: {
        apps: countApps(),
        databases: countDatabases(),
        deployments: countDeployments(),
        running: apps.filter((item) => item.status === "running").length,
        failed: apps.filter((item) => item.status === "failed").length,
      },
      ssh: {
        user: config.sshUser,
        host: config.sshHost ?? request.hostname,
      },
    });
  });
}
