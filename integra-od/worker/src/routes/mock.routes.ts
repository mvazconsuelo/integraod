import { Hono } from "hono";
import type { Env } from "../types/env";
import { mockCheckoutSchema } from "../schemas";
import { parseBody } from "../middleware/validation";
import { simulateCheckout } from "../services/payments.service";
import { allow, clientKey } from "../utils/ratelimit";

/** Checkout simulado del piloto (público, como lo sería el real). Solo funciona si el servicio de pagos tiene el modo piloto activo. */
export const mock = new Hono<{ Bindings: Env }>();

mock.post("/checkout/:publicId", async (c) => {
  if (!(await allow(c.env.DB, await clientKey("mock", c.req.header("CF-Connecting-IP") ?? null), 30, 60))) return c.json({ error: "Demasiados intentos. Esperá un momento." }, 429);
  const { outcome } = await parseBody(c, mockCheckoutSchema);
  return c.json(await simulateCheckout(c.env, c.req.param("publicId"), outcome));
});
