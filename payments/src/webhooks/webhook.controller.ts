import { Hono } from "hono";
import { deliverOutbox } from "../application/deliver-outbox";
import { buildDeps, clientRepository, platformLimiter, providerRegistry } from "../infrastructure/container";
import type { Env } from "../shared/env";
import { logger } from "../shared/logger";
import { MAX_BODY, validateWebhook } from "./webhook-validator";
import { processWebhook } from "./webhook-processor";

/**
 * Avisos de los proveedores (públicos: cualquiera puede mandar uno). La dirección lleva el cliente:
 * /webhooks/<proveedor>/<cliente>. Por eso:
 * 1) se verifica la firma del proveedor; 2) se consulta el pago real a su API con las credenciales de ESE cliente;
 * 3) se verifican importe, moneda y referencia. Un aviso falso, alterado o dirigido al cliente equivocado no mueve dinero.
 */
export const webhookController = new Hono<{ Bindings: Env }>();

webhookController.post("/:provider/:clientId", async (c) => {
  const provider = providerRegistry.get(c.req.param("provider"));
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const limiter = platformLimiter(c.env);

  if (!(await limiter.allow(`wh:${provider.id}`, ip, 300, 60))) return c.json({ error: "Demasiados pedidos." }, 429);

  const rawBody = await c.req.text();
  if (rawBody.length > MAX_BODY) return c.json({ error: "Pedido demasiado grande." }, 400);

  const client = await clientRepository(c.env).byId(c.req.param("clientId"));
  if (!client) return c.json({ error: "No encontrado." }, 404);
  const deps = buildDeps(c.env, client);

  const check = await validateWebhook(deps, provider, { headers: c.req.raw.headers, query: new URL(c.req.url).searchParams, rawBody });
  if (!check.ok) {
    // Los intentos con firma inválida se cuentan aparte: un atacante probando firmas se frena rápido.
    if (!(await limiter.allow(`whbad:${provider.id}`, ip, 20, 60))) return c.json({ error: "Demasiados pedidos." }, 429);
    await deps.providerLog.log(provider.id, null, "invalid_signature", "");
    return c.json({ error: "Firma inválida." }, check.status);
  }
  if ("ignore" in check) return c.json({ ok: true, ignored: true });

  try {
    const result = await processWebhook(deps, provider, check.paymentId);
    const task = deliverOutbox(deps).catch(() => undefined);
    try { c.executionCtx.waitUntil(task); } catch { await task; }
    return c.json({ ok: true, outcome: result.outcome });
  } catch (e) {
    logger.error("webhook_failed", { client: client.id, error: e instanceof Error ? e.name : "unknown" });
    return c.json({ error: "Falla temporal." }, 500); // el proveedor reintenta; todo es idempotente
  }
});
