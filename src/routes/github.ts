import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  deleteGithubDelivery,
  getGithubApp,
  recordGithubDelivery,
} from "../db.js";
import { isValidGithubBranch, verifyGithubSignature } from "../lib/github.js";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import {
  GithubApiError,
  GithubNotConfiguredError,
  githubStatus,
  listBranches,
  listRepositories,
} from "../services/github.js";
import { triggerDeployment } from "../services/deployer.js";

const branchQuerySchema = z.object({
  installationId: z.coerce.number().int().positive(),
});

const repositoryQuerySchema = z.object({
  refresh: z.literal("1").optional(),
});

interface PushPayload {
  ref?: string;
  after?: string;
  deleted?: boolean;
  repository?: { id?: number; full_name?: string };
  installation?: { id?: number };
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function githubHttpError(error: unknown): never {
  if (error instanceof GithubNotConfiguredError) throw new HttpError(503, error.message);
  if (error instanceof GithubApiError) {
    throw new HttpError(error.status === 404 ? 404 : 502, error.message);
  }
  throw error;
}

export async function githubRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/github/status", async (request, reply) => {
    requireUser(request);
    return reply.send(await githubStatus());
  });

  app.get("/api/github/repositories", async (request, reply) => {
    requireUser(request);
    const query = parseBody(repositoryQuerySchema, request.query);
    try {
      const repositories = await listRepositories(query.refresh === "1");
      return reply.send({ repositories });
    } catch (error) {
      githubHttpError(error);
    }
  });

  app.get("/api/github/repositories/:repoId/branches", async (request, reply) => {
    requireUser(request);
    const params = request.params as { repoId: string };
    const repoId = Number(params.repoId);
    if (!Number.isInteger(repoId) || repoId <= 0) throw new HttpError(400, "Invalid repository id");
    const query = parseBody(branchQuerySchema, request.query);
    try {
      const branches = await listBranches(query.installationId, repoId);
      return reply.send({ branches });
    } catch (error) {
      githubHttpError(error);
    }
  });

  app.post("/api/github/webhook", async (request, reply) => {
    if (!config.githubWebhookSecret) {
      throw new HttpError(503, "GitHub webhook secret is not configured");
    }
    const deliveryId = header(request, "x-github-delivery");
    const event = header(request, "x-github-event");
    const signature = header(request, "x-hub-signature-256");
    const rawBody = request.rawBody;
    if (!deliveryId || !event || !rawBody) throw new HttpError(400, "Missing GitHub webhook headers");
    if (!verifyGithubSignature(config.githubWebhookSecret, rawBody, signature)) {
      throw new HttpError(401, "Invalid GitHub webhook signature");
    }

    if (event === "ping") {
      recordGithubDelivery(deliveryId);
      return reply.send({ ok: true, event });
    }
    if (event !== "push") {
      recordGithubDelivery(deliveryId);
      return reply.send({ ok: true, ignored: `unsupported event: ${event}` });
    }

    const payload = (request.body ?? {}) as PushPayload;
    const branch = payload.ref?.startsWith("refs/heads/") ? payload.ref.slice("refs/heads/".length) : "";
    if (!branch || !isValidGithubBranch(branch)) throw new HttpError(400, "Invalid push ref");
    if (payload.deleted || !payload.after || /^0+$/.test(payload.after)) {
      recordGithubDelivery(deliveryId);
      return reply.send({ ok: true, ignored: "branch deletion" });
    }
    const repoId = payload.repository?.id;
    const installationId = payload.installation?.id;
    if (!Number.isInteger(repoId) || !Number.isInteger(installationId)) {
      throw new HttpError(400, "Push payload is missing repository or installation");
    }
    const found = getGithubApp(Number(repoId), branch);
    if (!found) {
      recordGithubDelivery(deliveryId);
      return reply.send({ ok: true, ignored: "no app uses this repository and branch" });
    }
    if (found.github_installation_id !== Number(installationId)) {
      throw new HttpError(400, "GitHub installation does not match the app");
    }
    if (!recordGithubDelivery(deliveryId)) {
      return reply.send({ ok: true, ignored: "duplicate delivery" });
    }
    try {
      const deployment = await triggerDeployment(found);
      return reply.code(202).send({
        ok: true,
        app: found.name,
        deploymentId: deployment.id,
      });
    } catch (error) {
      deleteGithubDelivery(deliveryId);
      request.log.error({ err: error, app: found.name }, "GitHub push deployment failed");
      throw new HttpError(500, "Could not queue the deployment");
    }
  });
}
