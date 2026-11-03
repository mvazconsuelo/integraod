import { Hono } from "hono";
import type { Env } from "../types/env";
import { applySchema, manualPaymentSchema, paymentRequestSchema, voidSchema } from "../schemas";
import { parseBody } from "../middleware/validation";
import * as svc from "../services/payments.service";
import * as applications from "../services/payment-applications.service";

export const payments = new Hono<{ Bindings: Env }>();

// Solicitudes de cobro
payments.get("/", async (c) => c.json(await svc.listRequests(c.env.DB)));
payments.post("/", async (c) => c.json(await svc.createRequest(c.env, await parseBody(c, paymentRequestSchema)), 201));

// Dinero recibido (declaradas antes de "/:id" para que no se confundan)
payments.get("/received", async (c) => c.json(await svc.listReceived(c.env.DB)));
payments.post("/manual", async (c) => c.json(await svc.registerManualPayment(c.env, await parseBody(c, manualPaymentSchema)), 201));
payments.post("/received/:id/apply", async (c) => {
  const { budget_id, amount_cents } = await parseBody(c, applySchema);
  await applications.applyPayment(c.env.DB, c.req.param("id"), budget_id, amount_cents);
  return c.json({ ok: true });
});
payments.post("/received/:id/void", async (c) => {
  await svc.voidPayment(c.env, c.req.param("id"), (await parseBody(c, voidSchema)).reason);
  return c.json({ ok: true });
});
payments.post("/applications/:id/void", async (c) => {
  await applications.voidApplication(c.env.DB, c.req.param("id"), (await parseBody(c, voidSchema)).reason);
  return c.json({ ok: true });
});

// Pagos que un proveedor aprobó pero no coinciden con ningún cobro: una persona los revisa
payments.get("/review", async (c) => c.json(await svc.reviewQueue(c.env)));
payments.post("/review/:id/dismiss", async (c) => {
  await svc.dismissReview(c.env, c.req.param("id"), (await parseBody(c, voidSchema)).reason);
  return c.json({ ok: true });
});

payments.get("/:id", async (c) => c.json(await svc.getRequestDetail(c.env.DB, c.req.param("id"))));
payments.post("/:id/cancel", async (c) => c.json(await svc.cancelRequest(c.env, c.req.param("id"))));
