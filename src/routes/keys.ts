import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addSshKey, deleteSshKey, listSshKeys } from "../db.js";
import { HttpError, parseBody, requireUser } from "../lib/http.js";
import { sshKeySchema } from "../lib/validation.js";
import { removeAuthorizedKey, sshFingerprint, syncAuthorizedKeys } from "../services/ssh.js";

const keySchema = z.object({
  name: z.string().trim().min(1, "Give the key a name").max(64),
  publicKey: sshKeySchema,
});

export async function keyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/ssh-keys", async (request, reply) => {
    requireUser(request);
    return reply.send({ keys: listSshKeys() });
  });

  app.post("/api/ssh-keys", async (request, reply) => {
    requireUser(request);
    const body = parseBody(keySchema, request.body);
    let key;
    try {
      key = addSshKey(body.name, body.publicKey, sshFingerprint(body.publicKey));
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new HttpError(409, "That key has already been added");
      throw error;
    }
    try {
      await syncAuthorizedKeys();
    } catch (error) {
      deleteSshKey(key.id);
      await removeAuthorizedKey(body.publicKey).catch(() => undefined);
      throw new HttpError(500, `Could not write authorized_keys: ${error instanceof Error ? error.message : String(error)}`);
    }
    return reply.code(201).send({ key, keys: listSshKeys() });
  });

  app.delete("/api/ssh-keys/:id", async (request, reply) => {
    requireUser(request);
    const params = request.params as { id: string };
    const id = Number(params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Invalid key id");
    const removed = deleteSshKey(id);
    if (!removed) throw new HttpError(404, "SSH key not found");
    try {
      await syncAuthorizedKeys();
    } catch (error) {
      await removeAuthorizedKey(removed.public_key).catch(() => undefined);
      throw new HttpError(
        500,
        `Could not update authorized_keys: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return reply.send({ keys: listSshKeys() });
  });
}
