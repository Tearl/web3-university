import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { z } from "zod";
import { config } from "./config.js";

const completionQuery = z.object({
  wallet: z.string().transform((value) => getAddress(value)),
  courseId: z.coerce.bigint().positive(),
  nonce: z.string().min(8),
});

const nonceBody = z.object({ wallet: z.string().transform((value) => getAddress(value)) });

export function createApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok", service: "web3-university-api" }));

  app.post("/profile/nonce", async (request, reply) => {
    const parsed = nonceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_wallet" });

    // TODO: verify Privy access token, persist nonce with a five-minute expiry.
    return reply.send({
      wallet: parsed.data.wallet,
      nonce: randomBytes(16).toString("hex"),
      expiresInSeconds: 300,
      warning: "framework_only_not_persisted",
    });
  });

  app.patch("/profile", async (_request, reply) => {
    // Deliberately closed until Privy token verification, EIP-712 recovery and nonce persistence are wired.
    return reply.code(501).send({ error: "signature_verification_not_configured" });
  });

  app.get("/oracle/completion", async (request, reply) => {
    if (request.headers["x-oracle-key"] !== config.ORACLE_API_KEY || config.ORACLE_API_KEY === "change-me") {
      return reply.code(401).send({ error: "oracle_not_authorized" });
    }

    const parsed = completionQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });

    // TODO: query OracleEvidence after DB wiring. Never return completed=true from client input.
    return reply.send({
      wallet: parsed.data.wallet,
      courseId: parsed.data.courseId.toString(),
      completed: false,
      progress: 0,
      evidenceHash: null,
      status: "database_not_configured",
    });
  });

  return app;
}
