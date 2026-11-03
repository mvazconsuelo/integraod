import { Hono } from "hono";
import type { Env } from "../types/env";
import { rangeSchema } from "../schemas";
import { getSummary } from "../services/dashboard.service";
import { reviewQueue } from "../services/payments.service";
import { monthRange } from "../utils/dates";

export const dashboard = new Hono<{ Bindings: Env }>();

const rangeFrom = (c: { req: { query: (k: string) => string | undefined } }) => {
  const def = monthRange();
  return rangeSchema.parse({ from: c.req.query("from") ?? def.from, to: c.req.query("to") ?? def.to });
};

dashboard.get("/", async (c) => {
  const { from, to } = rangeFrom(c);
  // Pagos de un proveedor que no coinciden con ningún cobro. Si el servicio de pagos no responde, el Resumen igual carga.
  const review = await reviewQueue(c.env).then((r) => r.length).catch(() => 0);
  return c.json({ ...(await getSummary(c.env.DB, from, to)), review_count: review });
});
