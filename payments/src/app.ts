import { Hono } from "hono";
import { ZodError } from "zod";
import { AppError } from "./shared/errors";
import { logger } from "./shared/logger";
import { securityHeaders } from "./shared/security/headers";
import { oauthController } from "./controller/oauth.controller";
import { paymentsController } from "./controller/payments.controller";
import { webhookController } from "./webhooks/webhook.controller";
import type { Env } from "./shared/env";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);
app.get("/health", (c) => c.json({ ok: true }));
app.route("/v1", paymentsController());   // solo apps registradas, con pedidos firmados con su clave
app.route("/webhooks", webhookController); // proveedores (autenticados por su firma)
app.route("/oauth", oauthController);      // vuelta de la conexión de la cuenta

app.notFound((c) => c.json({ error: "No encontrado." }, 404));
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message, code: err.code }, err.status);
  if (err instanceof ZodError) return c.json({ error: err.issues[0]?.message ?? "Revisá los datos enviados.", code: "validation" }, 400);
  logger.error("unhandled", { error: err instanceof Error ? err.name : "unknown" }); // sin datos sensibles
  return c.json({ error: "Error interno.", code: "internal" }, 500);
});
