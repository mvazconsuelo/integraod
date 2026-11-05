import { ensureLogoMigrated, logoUrl, readLogo } from "./services/logo.service";
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

// Ninguna respuesta de la API se guarda en caché ni se interpreta como otro tipo de contenido
// (la única excepción es el archivo del logo, que fija su propia caché larga: su dirección lleva la versión).
app.use("*", async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});

app.use("*", loadTimeZone);

// Rutas públicas
app.route("/mock", mock);
app.route("/internal", internal); // avisos del servicio de pagos: solo con firma válida
app.get("/public/payments/:publicId", async (c) => {
  await ensureLogoMigrated(c.env);
  // Límite por IP: frena a quien prueba links al azar para encontrar uno válido.
  if (!(await allow(c.env.DB, await clientKey("public", c.req.header("CF-Connecting-IP") ?? null), 60, 60))) return c.json({ error: "Demasiados intentos. Esperá un momento." }, 429);
  return c.json(await publicView(c.env.DB, c.req.param("publicId")));
});

// Identidad del negocio para la pantalla de ingreso (nombre y logo; es lo mismo que ve quien paga). Sin esto el login sería anónimo.
app.get("/public/brand", async (c) => {
  if (!(await allow(c.env.DB, await clientKey("public", c.req.header("CF-Connecting-IP") ?? null), 60, 60))) return c.json({ error: "Demasiados intentos. Esperá un momento." }, 429);
  await ensureLogoMigrated(c.env);
  const s = await getSettings(c.env.DB);
  return c.json({ name: s.name, logo_url: logoUrl(s.logo_version) });
});

// El archivo del logo (público: lo ven el ingreso y quien paga). La dirección lleva la versión: se puede guardar para siempre en el navegador.
app.get("/public/logo", async (c) => {
  if (!(await allow(c.env.DB, await clientKey("public", c.req.header("CF-Connecting-IP") ?? null), 120, 60))) return c.json({ error: "Demasiados intentos. Esperá un momento." }, 429);
  await ensureLogoMigrated(c.env);
  const file = await readLogo(c.env);
  if (!file) return c.json({ error: "Sin logo." }, 404);
  return new Response(file.body, { headers: {
    "content-type": file.httpMetadata?.contentType ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", // un SVG abierto directo no puede ejecutar nada
  } });
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
