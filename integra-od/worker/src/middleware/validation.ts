import type { Context, MiddlewareHandler } from "hono";
import type { ZodTypeAny, z } from "zod";
import { AppError } from "../utils/errors";
import { timingSafeEqual } from "../utils/crypto";
import type { Env } from "../types/env";
import { allow, clientKey, isBlocked } from "../utils/ratelimit";

/** Claves incorrectas toleradas por IP en la ventana. Pasado el límite, se bloquea todo (incluso la clave correcta) hasta que venza. */
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_WINDOW_SECONDS = 600;

export async function parseBody<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new AppError(400, "No pudimos leer los datos enviados.");
  }
  return schema.parse(json);
}

/**
 * Protege la API de administración con una clave (ADMIN_TOKEN). Frena a quien prueba claves a ciegas:
 * tras varias claves incorrectas desde la misma conexión se bloquea un rato, incluso para la clave correcta.
 * (Un pedido sin clave no cuenta: es solo alguien que todavía no ingresó.)
 */
export const requireAdmin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = await clientKey("authfail", c.req.header("CF-Connecting-IP") ?? null);

  if (await isBlocked(c.env.DB, key, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS)) {
    throw new AppError(429, "Demasiados intentos con una clave incorrecta. Esperá unos minutos y volvé a probar.", "too_many_attempts");
  }
  if (!c.env.ADMIN_TOKEN || !timingSafeEqual(token, c.env.ADMIN_TOKEN)) {
    if (token) await allow(c.env.DB, key, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS);
    throw new AppError(401, "Ingresá tu clave de acceso para continuar.", "unauthorized");
  }
  await next();
};
