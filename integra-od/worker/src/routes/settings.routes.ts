import { Hono } from "hono";
import type { Env } from "../types/env";
import { settingsSchema } from "../schemas";
import { parseBody } from "../middleware/validation";
import { getSettings, updateProfile } from "../repositories/settings.repository";
import { providersStatus } from "../services/payments.service";
import { audit } from "../services/audit.service";
import { setTimeZone } from "../utils/dates";
import { resetTimeZoneCache } from "../middleware/time-zone";

export const settings = new Hono<{ Bindings: Env }>();

/** Estado de Mercado Pago y del modo piloto: lo informa el servicio de pagos (acá no hay credenciales). */
async function view(env: Env) {
  const [s, providers] = await Promise.all([getSettings(env.DB), providersStatus(env)]);
  return {
    ...s,
    payments_online: providers !== null,
    mp_connected: providers?.some((p) => p.id === "mercadopago" && p.connected) ?? false,
    mp_mock: providers?.some((p) => p.id === "mock" && p.connected) ?? false,
  };
}

settings.get("/", async (c) => c.json(await view(c.env)));
settings.put("/", async (c) => {
  const before = await getSettings(c.env.DB);
  const next = await parseBody(c, settingsSchema);
  await updateProfile(c.env.DB, next);
  setTimeZone(next.time_zone);
  resetTimeZoneCache(c.env.DB);
  await audit(c.env.DB, { action: "settings.updated", entity: "settings", entityId: "1", detail: { time_zone: next.time_zone, ...(before.time_zone !== next.time_zone ? { time_zone_before: before.time_zone } : {}), name_changed: before.name !== next.name } });
  return c.json(await view(c.env));
});
