import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types/env";
import { verifyRequest } from "../integrations/payments/signing";
import { handlePaymentEvent } from "../services/payments.service";
import { AppError } from "../utils/errors";

const eventSchema = z.object({ id: z.string().min(1).max(64), type: z.string().max(60), entity: z.enum(["intent", "payment"]), entityId: z.string().min(1).max(64) });

/**
 * Avisos del servicio de pagos. Es una ruta pública, así que solo se acepta con firma válida, reciente y de un solo uso.
 * El aviso no trae datos de dinero: solo "algo cambió"; el estado real se consulta al servicio.
 */
export const internal = new Hono<{ Bindings: Env }>();

internal.post("/payment-events", async (c) => {
  const raw = await c.req.text();
  const url = new URL(c.req.url);
  const ok = await verifyRequest({
    clientId: c.env.PAYMENTS_CLIENT_ID,
    secrets: [c.env.SVC_SECRET_EVENTS, c.env.SVC_SECRET_EVENTS_PREV].filter((s): s is string => Boolean(s)),
    method: "POST", path: url.pathname + url.search, body: raw, headers: c.req.raw.headers,
    seen: async (nonce, expiresAt) => {
      const res = await c.env.DB.prepare("INSERT OR IGNORE INTO nonces (nonce, expires_at) VALUES (?, ?)").bind(nonce, expiresAt).run();
      if (Math.random() < 0.02) await c.env.DB.prepare("DELETE FROM nonces WHERE expires_at < ?").bind(Date.now()).run();
      return (res.meta.changes ?? 0) === 0;
    },
  });
  if (!ok) return c.json({ error: "No autorizado." }, 401);

  let ev: z.infer<typeof eventSchema>;
  try { ev = eventSchema.parse(JSON.parse(raw)); } catch { return c.json({ error: "Aviso inválido." }, 400); }
  try {
    await handlePaymentEvent(c.env, ev);
  } catch (e) {
    // Si el cobro o pago ya no existe en el servicio de pagos no hay nada que reintentar: se da por recibido.
    if (e instanceof AppError && e.status === 404) return c.json({ ok: true, skipped: true });
    console.error("payment_event_failed", ev.type, e instanceof Error ? e.name : "unknown");
    return c.json({ error: "Falla temporal." }, 500); // el servicio de pagos reintenta
  }
  return c.json({ ok: true });
});
