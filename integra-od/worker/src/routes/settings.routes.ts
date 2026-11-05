import { Hono } from "hono";
import type { Env } from "../types/env";
import { settingsSchema } from "../schemas";
import { parseBody } from "../middleware/validation";
import { getSettings, updateProfile } from "../repositories/settings.repository";
import { providersStatus } from "../services/payments.service";
import { audit } from "../services/audit.service";
import { setTimeZone } from "../utils/dates";
import { ensureLogoMigrated, logoUrl, removeLogo, saveLogo } from "../services/logo.service";
import { resetTimeZoneCache } from "../middleware/time-zone";

export const settings = new Hono<{ Bindings: Env }>();

/** Estado de Mercado Pago y del modo piloto: lo informa el servicio de pagos (acá no hay credenciales). */
async function view(env: Env) {
  await ensureLogoMigrated(env);
  const [s, providers] = await Promise.all([getSettings(env.DB), providersStatus(env)]);
  const { logo_data_url: _legacy, logo_version, ...rest } = s;
  return {
    ...rest,
    logo_url: logoUrl(logo_version),
    payments_online: providers !== null,
    mp_connected: providers?.some((p) => p.id === "mercadopago" && p.connected) ?? false,
    mp_mock: providers?.some((p) => p.id === "mock" && p.connected) ?? false,
  };
}

settings.get("/", async (c) => c.json(await view(c.env)));
settings.put("/", async (c) => {
  const before = await getSettings(c.env.DB);
  const parsed = await parseBody(c, settingsSchema);
  // Los datos bancarios son opcionales en el cuerpo: si no vienen, se conservan los guardados.
  const next = { ...parsed, bank_holder: parsed.bank_holder ?? before.bank_holder, bank_cbu: parsed.bank_cbu ?? before.bank_cbu, bank_alias: parsed.bank_alias ?? before.bank_alias };
  await updateProfile(c.env.DB, next);
  setTimeZone(next.time_zone);
  resetTimeZoneCache(c.env.DB);
  await audit(c.env.DB, { action: "settings.updated", entity: "settings", entityId: "1", detail: { time_zone: next.time_zone, ...(before.time_zone !== next.time_zone ? { time_zone_before: before.time_zone } : {}), name_changed: before.name !== next.name } });
  return c.json(await view(c.env));
});

// El logo es un archivo: se sube y se quita aparte (no viaja dentro de "Guardar cambios"). Cuerpo = la imagen tal cual.
settings.put("/logo", async (c) => {
  const type = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  await saveLogo(c.env, bytes, type);
  await audit(c.env.DB, { action: "settings.logo", entity: "settings", entityId: "1", detail: { bytes: bytes.length, type } });
  return c.json(await view(c.env));
});
settings.delete("/logo", async (c) => {
  await removeLogo(c.env);
  await audit(c.env.DB, { action: "settings.logo_removed", entity: "settings", entityId: "1" });
  return c.json(await view(c.env));
});
