import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config, unitPath } from "../config.js";
import {
  getApp,
  getDatabase,
  getDeploymentForApp,
  listApps,
  listDeployments,
  listEnv,
  replaceEnv,
  updateApp,
  type AppRow,
} from "../db.js";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import { isValidGithubBranch } from "../lib/github.js";
import { pathExists } from "../lib/fsx.js";
import {
  appNameSchema,
  commandSchema,
  domainSchema,
  envKeySchema,
  envValueSchema,
  memoryMbSchema,
} from "../lib/validation.js";
import { createApp, removeApp, updateAppSettings, type GithubSourceInput } from "../services/apps.js";
import { destroyDatabase, provisionDatabase } from "../services/database.js";
import {
  GithubApiError,
  GithubNotConfiguredError,
  getBranch,
  getRepositoryById,
} from "../services/github.js";
import {
  currentDeploymentLog,
  onDeploymentEvent,
  refreshEnvironment,
  triggerDeployment,
} from "../services/deployer.js";
import { streamRuntimeLogs } from "../services/logs.js";
import {
  RESERVED_ENV,
  restartUnit,
  startUnit,
  stopUnit,
  unitStatus,
} from "../services/system.js";

const githubSourceSchema = z.object({
  type: z.literal("github"),
  installationId: z.number().int().positive(),
  repoId: z.number().int().positive(),
  branch: z.string().trim().max(200).refine(isValidGithubBranch, "Enter a valid branch name"),
});

const createAppSchema = z.object({
  name: appNameSchema,
  domain: domainSchema.optional(),
  startCmd: commandSchema.nullable().optional(),
  buildCmd: commandSchema.nullable().optional(),
  installCmd: commandSchema.nullable().optional(),
  memoryMb: memoryMbSchema.optional(),
  source: githubSourceSchema.optional(),
});

const updateAppSchema = z.object({
  domain: domainSchema.nullable().optional(),
  startCmd: commandSchema.nullable().optional(),
  buildCmd: commandSchema.nullable().optional(),
  installCmd: commandSchema.nullable().optional(),
  memoryMb: memoryMbSchema.optional(),
});

const deleteSchema = z.object({ confirm: z.string().max(64) });

const envSchema = z.object({
  vars: z
    .record(envKeySchema, envValueSchema)
    .refine((value) => Object.keys(value).length <= 100, "At most 100 variables are allowed"),
});

const databaseSchema = z.object({ engine: z.enum(["sqlite", "postgres", "mysql"]) });
const databaseProvisioning = new Set<number>();

function appOrThrow(name: string): AppRow {
  const app = getApp(name);
  if (!app) throw new HttpError(404, "App not found");
  return app;
}

function throwGithubError(error: unknown): never {
  if (error instanceof GithubNotConfiguredError) throw new HttpError(503, error.message);
  if (error instanceof GithubApiError) {
    throw new HttpError(error.status === 404 ? 404 : 502, error.message);
  }
  throw error;
}

async function syncStatus(app: AppRow): Promise<AppRow> {
  if (config.mock || app.status === "idle" || app.status === "queued" || app.status === "building" || app.status === "starting") {
    return app;
  }
  const live = await unitStatus(app.name);
  if ((live === "running" || live === "stopped" || live === "failed") && live !== app.status) {
    updateApp(app.id, { status: live });
    return { ...app, status: live };
  }
  return app;
}

function sshInfo(request: FastifyRequest, app: AppRow) {
  const host = config.sshHost ?? request.hostname;
  return {
    user: config.sshUser,
    host,
    remote: `${config.sshUser}@${host}:${app.name}.git`,
  };
}

function sseHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.write(": connected\n\n");
}

function sseSend(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function appRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/apps", async (request, reply) => {
    requireUser(request);
    return reply.send({ apps: listApps() });
  });

  app.post("/api/apps", async (request, reply) => {
    requireUser(request);
    const body = parseBody(createAppSchema, request.body);
    try {
      let source: GithubSourceInput | undefined;
      if (body.source) {
        try {
          const repository = await getRepositoryById(body.source.installationId, body.source.repoId);
          const branch = await getBranch(body.source.installationId, repository, body.source.branch);
          source = {
            type: "github",
            installationId: body.source.installationId,
            repoId: repository.id,
            repoFullName: repository.fullName,
            branch: branch.name,
          };
        } catch (error) {
          throwGithubError(error);
        }
      }
      const created = await createApp({
        name: body.name,
        domain: body.domain,
        startCmd: body.startCmd,
        buildCmd: body.buildCmd,
        installCmd: body.installCmd,
        memoryMb: body.memoryMb,
        source,
      });
      return reply.code(201).send({
        app: created,
        ssh: created.source_type === "github" ? null : sshInfo(request, created),
      });
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed: apps.name")) {
        throw new HttpError(409, "That app name is already taken");
      }
      if (String(error).includes("UNIQUE constraint failed: apps.domain")) {
        throw new HttpError(409, "That domain is already used by another app");
      }
      if (String(error).includes("UNIQUE constraint failed: apps.port")) {
        throw new HttpError(409, "Port allocation collision, try again");
      }
      if (String(error).includes("UNIQUE constraint failed: apps.github_repo_id")) {
        throw new HttpError(409, "That GitHub repository and branch is already connected to another app");
      }
      if (error instanceof GithubNotConfiguredError || error instanceof GithubApiError) {
        throwGithubError(error);
      }
      throw error;
    }
  });

  app.get("/api/apps/:name", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    let found = appOrThrow(params.name);
    found = await syncStatus(found);
    return reply.send({
      app: found,
      deployments: listDeployments(found.id, 30),
      env: listEnv(found.id),
      database: getDatabase(found.id) ?? null,
      ssh: found.source_type === "github" ? null : sshInfo(request, found),
    });
  });

  app.patch("/api/apps/:name", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    const body = parseBody(updateAppSchema, request.body);
    const updated = await updateAppSettings(found, body);
    return reply.send({ app: updated });
  });

  app.delete("/api/apps/:name", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    if (["queued", "building", "starting"].includes(found.status)) {
      throw new HttpError(409, "Wait for the current deployment to finish before deleting this app");
    }
    if (databaseProvisioning.has(found.id)) {
      throw new HttpError(409, "Wait for database provisioning to finish before deleting this app");
    }
    const body = parseBody(deleteSchema, request.body ?? {});
    if (body.confirm !== found.name) throw new HttpError(400, "Confirmation does not match the app name");
    await removeApp(found, body.confirm);
    return reply.send({ ok: true });
  });

  app.post("/api/apps/:name/deploy", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    let deployment;
    try {
      deployment = await triggerDeployment(found);
    } catch (error) {
      if (error instanceof GithubNotConfiguredError || error instanceof GithubApiError) {
        throwGithubError(error);
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("No deployable commit") || message === "Invalid git reference") {
        throw new HttpError(400, message);
      }
      if (message.startsWith("GitHub")) throw new HttpError(502, message);
      throw error;
    }
    return reply.code(202).send({ deployment });
  });

  app.post("/api/apps/:name/:action", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string; action: string };
    const found = appOrThrow(params.name);
    if (!["start", "stop", "restart"].includes(params.action)) {
      throw new HttpError(404, "Unknown action");
    }
    if (["queued", "building", "starting"].includes(found.status)) {
      throw new HttpError(409, "Wait for the current deployment to finish");
    }
    if (params.action !== "stop" && !(await pathExists(unitPath(found.name)))) {
      throw new HttpError(400, "Deploy this app before starting it");
    }
    if (params.action === "start") {
      await startUnit(found.name);
      updateApp(found.id, { status: "running" });
    } else if (params.action === "stop") {
      await stopUnit(found.name);
      updateApp(found.id, { status: "stopped" });
    } else {
      await restartUnit(found.name);
      updateApp(found.id, { status: "running" });
    }
    const updated = getApp(found.name);
    return reply.send({ app: updated });
  });

  app.get("/api/apps/:name/deployments", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    return reply.send({ deployments: listDeployments(found.id, 100) });
  });

  app.get("/api/apps/:name/deployments/:id", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string; id: string };
    const found = appOrThrow(params.name);
    const deployment = getDeploymentForApp(found.id, Number(params.id));
    if (!deployment) throw new HttpError(404, "Deployment not found");
    return reply.send({ deployment });
  });

  app.get("/api/apps/:name/deployments/:id/log", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string; id: string };
    const found = appOrThrow(params.name);
    const deployment = getDeploymentForApp(found.id, Number(params.id));
    if (!deployment) throw new HttpError(404, "Deployment not found");
    return reply.type("text/plain; charset=utf-8").send(await currentDeploymentLog(deployment.id));
  });

  app.get("/api/apps/:name/deployments/:id/stream", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string; id: string };
    const found = appOrThrow(params.name);
    const deployment = getDeploymentForApp(found.id, Number(params.id));
    if (!deployment) throw new HttpError(404, "Deployment not found");

    reply.hijack();
    sseHeaders(reply);
    let closed = false;
    let heartbeat: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    };

    const snapshot = currentDeploymentLog(deployment.id);
    const unsubscribe = onDeploymentEvent(deployment.id, (event) => {
      if (closed) return;
      if (event.type === "log") {
        sseSend(reply, "log", { line: event.line });
      } else {
        sseSend(reply, "done", { status: event.status });
        cleanup();
      }
    });

    sseSend(reply, "snapshot", { log: snapshot });
    if (deployment.status === "running" || deployment.status === "failed") {
      sseSend(reply, "done", { status: deployment.status });
      cleanup();
      return;
    }

    heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(": ping\n\n");
    }, 15000);
    request.raw.on("close", cleanup);
  });

  app.get("/api/apps/:name/logs/stream", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);

    reply.hijack();
    sseHeaders(reply);
    let closed = false;
    let stream: { stop: () => void } | undefined;
    let heartbeat: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      stream?.stop();
      reply.raw.end();
    };

    request.raw.on("close", cleanup);
    heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(": ping\n\n");
    }, 15000);

    stream = streamRuntimeLogs(
      found.name,
      (line) => {
        if (!closed) sseSend(reply, "log", { line });
      },
      (message) => {
        if (!closed) sseSend(reply, "error", { message });
      },
      () => {
        if (!closed) {
          sseSend(reply, "done", {});
          cleanup();
        }
      },
    );
  });

  app.get("/api/apps/:name/env", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    return reply.send({ env: listEnv(found.id) });
  });

  app.put("/api/apps/:name/env", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    const body = parseBody(envSchema, request.body);
    for (const key of Object.keys(body.vars)) {
      if (RESERVED_ENV.has(key)) {
        throw new HttpError(400, `${key} is managed by NodePaaS and cannot be overridden`);
      }
    }
    const previous = Object.fromEntries(listEnv(found.id).map((item) => [item.key, item.value]));
    replaceEnv(found.id, body.vars);
    try {
      await refreshEnvironment(found);
    } catch (error) {
      replaceEnv(found.id, previous);
      await refreshEnvironment(found).catch(() => undefined);
      throw error;
    }
    return reply.send({ env: listEnv(found.id), restartRequired: true });
  });

  app.post("/api/apps/:name/database", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    if (getDatabase(found.id)) throw new HttpError(409, "This app already has a database");
    if (databaseProvisioning.has(found.id)) throw new HttpError(409, "A database is already being provisioned");
    const body = parseBody(databaseSchema, request.body);
    databaseProvisioning.add(found.id);
    try {
      const database = await provisionDatabase(found, body.engine);
      try {
        await refreshEnvironment(found);
      } catch (error) {
        await destroyDatabase(found).catch(() => undefined);
        await refreshEnvironment(found).catch(() => undefined);
        throw error;
      }
      return reply.code(201).send({ database, restartRequired: true });
    } finally {
      databaseProvisioning.delete(found.id);
    }
  });

  app.delete("/api/apps/:name/database", async (request, reply) => {
    requireUser(request);
    const params = request.params as { name: string };
    const found = appOrThrow(params.name);
    if (databaseProvisioning.has(found.id)) throw new HttpError(409, "A database is being provisioned");
    if (!getDatabase(found.id)) throw new HttpError(404, "This app has no database");
    await destroyDatabase(found);
    await refreshEnvironment(found);
    return reply.send({ ok: true, restartRequired: true });
  });
}
