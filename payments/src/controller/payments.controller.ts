import { Hono } from "hono";
import { z } from "zod";
import { cancelIntent } from "../application/cancel-intent";
import { connectProvider } from "../application/connect-provider";
import { createIntent } from "../application/create-intent";
import { deliverOutbox } from "../application/deliver-outbox";
import { disconnectProvider } from "../application/disconnect-provider";
import { getIntentStatus, getPaymentStatus } from "../application/get-payment-status";
import { listProviders } from "../application/providers";
import { recordManualPayment } from "../application/record-manual-payment";
import { dismissReview, listReview } from "../application/review-queue";
import { simulateMockPayment } from "../application/simulate-mock-payment";
import { voidPayment } from "../application/void-payment";
import type { Client } from "../domain/client";
import { buildDeps, clientRepository, nonceStore } from "../infrastructure/container";
import { AppError } from "../shared/errors";
import { logger } from "../shared/logger";
import type { Env } from "../shared/env";
import { requireSignedRequest } from "../shared/security/service-auth";
import { createIntentSchema, manualPaymentSchema, mockPaySchema, reasonSchema } from "./payments.schemas";

type Vars = { rawBody: string; client: Client };

/** API interna: solo una app registrada puede llamarla, y solo con pedidos firmados con su propia clave. Cada pedido trabaja dentro de ESE cliente. */
export function paymentsController() {
  const r = new Hono<{ Bindings: Env; Variables: Vars }>();

  r.use("*", requireSignedRequest<Client>({
    authenticate: async (env: Env, clientId) => {
      const client = await clientRepository(env).byId(clientId);
      return client ? { secrets: client.secrets, principal: client } : null;
    },
    nonces: nonceStore,
  }));

  type Ctx = { env: Env; get: (k: "client") => Client };
  const depsOf = (c: Ctx) => buildDeps(c.env, c.get("client"));

  const body = <S extends z.ZodTypeAny>(c: { get: (k: "rawBody") => string }, schema: S): z.infer<S> => {
    try { return schema.parse(JSON.parse(c.get("rawBody") || "{}")); } catch (e) { if (e instanceof z.ZodError) throw e; throw new AppError(400, "No pudimos leer los datos enviados."); }
  };

  /** Después de responder, intenta entregar los avisos pendientes (el cron reintenta los que fallen). */
  const flush = async (c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }, deps: ReturnType<typeof buildDeps>) => {
    const task = deliverOutbox(deps).catch((e) => logger.error("outbox_flush_failed", { error: e instanceof Error ? e.message : "error" }));
    try { c.executionCtx.waitUntil(task); } catch { await task; } // sin contexto de ejecución (pruebas): se espera
  };

  r.get("/providers", async (c) => c.json(await listProviders(depsOf(c))));
  r.post("/providers/:id/connect", async (c) => c.json(await connectProvider(depsOf(c), c.req.param("id"))));
  r.post("/providers/:id/disconnect", async (c) => {
    await disconnectProvider(depsOf(c), c.req.param("id"));
    return c.json({ ok: true });
  });

  r.post("/intents", async (c) => {
    const deps = depsOf(c);
    const intent = await createIntent(deps, body(c, createIntentSchema));
    await flush(c, deps);
    return c.json({ intent }, 201);
  });
  r.get("/intents/:id", async (c) => c.json(await getIntentStatus(depsOf(c), c.req.param("id"))));
  r.post("/intents/:id/cancel", async (c) => {
    const deps = depsOf(c);
    const intent = await cancelIntent(deps, c.req.param("id"));
    await flush(c, deps);
    return c.json({ intent });
  });

  r.post("/payments/manual", async (c) => {
    const deps = depsOf(c);
    const v = body(c, manualPaymentSchema);
    const payment = await recordManualPayment(deps, v);
    await flush(c, deps);
    return c.json({ payment, intent: payment.intent_id ? (await getIntentStatus(deps, payment.intent_id)).intent : null }, 201);
  });
  r.get("/payments/:id", async (c) => c.json(await getPaymentStatus(depsOf(c), c.req.param("id"))));
  r.post("/payments/:id/void", async (c) => {
    const deps = depsOf(c);
    const payment = await voidPayment(deps, c.req.param("id"), body(c, reasonSchema).reason);
    await flush(c, deps);
    return c.json({ payment, intent: payment.intent_id ? (await getIntentStatus(deps, payment.intent_id)).intent : null });
  });

  r.post("/mock/:publicId/pay", async (c) => {
    const deps = depsOf(c);
    const result = await simulateMockPayment(deps, c.req.param("publicId"), body(c, mockPaySchema).outcome);
    await flush(c, deps);
    return c.json(result);
  });

  r.get("/review", async (c) => c.json(await listReview(depsOf(c))));
  r.post("/review/:id/dismiss", async (c) => {
    await dismissReview(depsOf(c), c.req.param("id"), body(c, reasonSchema).reason);
    return c.json({ ok: true });
  });

  r.get("/audit/verify", async (c) => c.json(await depsOf(c).audit.verify()));
  return r;
}
