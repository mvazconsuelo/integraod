import type { MiddlewareHandler } from "hono";
import { DEFAULT_TIME_ZONE, setTimeZone } from "../utils/dates";

// La zona horaria vive en la configuración del consultorio. Se lee con un breve respiro para no consultar en cada pedido.
const CACHE_MS = 30_000;
const cache = new WeakMap<object, { at: number; tz: string }>();

export const resetTimeZoneCache = (db: D1Database) => { cache.delete(db); };

export const loadTimeZone: MiddlewareHandler<{ Bindings: { DB: D1Database } }> = async (c, next) => {
  const hit = cache.get(c.env.DB);
  if (hit && Date.now() - hit.at < CACHE_MS) setTimeZone(hit.tz);
  else {
    const row = await c.env.DB.prepare("SELECT time_zone FROM clinic_settings WHERE id = 1").first<{ time_zone: string }>().catch(() => null);
    const tz = row?.time_zone ?? DEFAULT_TIME_ZONE;
    cache.set(c.env.DB, { at: Date.now(), tz });
    setTimeZone(tz);
  }
  await next();
};
