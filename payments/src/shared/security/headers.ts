import type { MiddlewareHandler } from "hono";

/** Cabeceras de seguridad en todas las respuestas: esta API no tiene por qué abrirse en una página, cargar scripts ni guardarse en caché. */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
  c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
};
