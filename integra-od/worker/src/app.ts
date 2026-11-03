import { Hono } from "hono";
import type { Env } from "./types/env";
import { errorHandler } from "./middleware/error-handler";
import { requireAdmin } from "./middleware/validation";
import { dashboard } from "./routes/dashboard.routes";
import { budgets } from "./routes/budgets.routes";
import { payments } from "./routes/payments.routes";
import { settings } from "./routes/settings.routes";
import { treatments } from "./routes/treatments.routes";
import { mercadopago } from "./routes/mercadopago.routes";
import { mock } from "./routes/mock.routes";
import { patients } from "./routes/patients.routes";
import { reports } from "./routes/reports.routes";
import { activity } from "./routes/activity.routes";
import { internal } from "./routes/internal.routes";
import { publicView } from "./services/payments.service";
import { getSettings } from "./repositories/settings.repository";
import { allow, clientKey } from "./utils/ratelimit";
import { loadTimeZone } from "./middleware/time-zone";

export const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.onError(errorHandler);

// Ninguna respuesta de la API se guarda en caché ni se interpreta como otro tipo de contenido.
app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});

app.use("*", loadTimeZone);

// Rutas públicas
app.route("/mock", mock);
app.route("/internal", internal); // avisos del servicio de pagos: solo con firma válida
app.get("/public/payments/:publicId", async (c) => {
  // Límite por IP: frena a quien prueba links al azar para encontrar uno válido.
  if (!(await allow(c.env.DB, await clientKey("public", c.req.header("CF-Connecting-IP") ?? null), 60, 60))) return c.json({ error: "Demasiados intentos. Esperá un momento." }, 429);
  return c.json(await publicView(c.env.DB, c.req.param("publicId")));
});

// Identidad del negocio para la pantalla de ingreso (nombre y logo; es lo mismo que ve quien paga). Sin esto el login sería anónimo.
app.get("/public/brand", async (c) => {
  if (!(await allow(c.env.DB, await clientKey("public", c.req.header("CF-Connecting-IP") ?? null), 60, 60))) return c.json({ error: "Demasiados intentos. Esperá un momento." }, 429);
  const s = await getSettings(c.env.DB);
  return c.json({ name: s.name, logo_data_url: s.logo_data_url });
});

// Rutas de administración
app.use("/session", requireAdmin);
app.get("/session", (c) => c.json({ ok: true }));
for (const prefix of ["/dashboard", "/budgets", "/payments", "/settings", "/treatments", "/patients", "/reports", "/mercadopago", "/activity"]) app.use(`${prefix}/*`, requireAdmin);
app.route("/dashboard", dashboard);
app.route("/budgets", budgets);
app.route("/payments", payments);
app.route("/settings", settings);
app.route("/treatments", treatments);
app.route("/patients", patients);
app.route("/reports", reports);
app.route("/activity", activity);
app.route("/mercadopago", mercadopago);
