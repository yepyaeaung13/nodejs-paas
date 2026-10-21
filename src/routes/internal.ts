import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { internalToken } from "../config.js";
import { getApp } from "../db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { triggerDeployment } from "../services/deployer.js";

const deploySchema = z.object({
  ref: z.string().max(200).optional(),
  sha: z.string().max(64).optional(),
});

function tokenValid(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length);
  const expected = internalToken;
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/internal/deploy/:slug", async (request, reply) => {
    if (!tokenValid(request.headers.authorization)) {
      throw new HttpError(401, "Invalid internal token");
    }
    const params = request.params as { slug: string };
    const found = getApp(params.slug);
    if (!found) throw new HttpError(404, "App not found");
    const body = parseBody(deploySchema, request.body ?? {});
    const deployment = await triggerDeployment(found, { ref: body.ref, sha: body.sha });
    return reply.code(202).send({ deploymentId: deployment.id, status: deployment.status });
  });
}
