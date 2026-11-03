import type { MiddlewareHandler } from "hono";
import { logger } from "../logger";
import { verifyRequest } from "./signing";

/** Dónde se recuerdan los nonces ya usados (puerto: la infraestructura decide cómo). */
export interface NonceStore { seen(nonce: string, expiresAt: number): Promise<boolean> }

/**
 * Exige que el pedido venga firmado por una app conocida. `authenticate` devuelve las claves vigentes de esa app
 * y lo que se le deja ver al resto del pedido (el cliente); null si no existe o está suspendida.
 * Siempre responde lo mismo ante cualquier falla: no se le dice a un atacante si falló el cliente, la firma, la hora o el nonce.
 */
export const requireSignedRequest = <P>(opts: {
  authenticate: (env: any, clientId: string) => Promise<{ secrets: string[]; principal: P } | null>;
  nonces: (env: any) => NonceStore;
}): MiddlewareHandler =>
  async (c, next) => {
    const raw = c.req.method === "GET" || c.req.method === "HEAD" ? "" : await c.req.text();
    const url = new URL(c.req.url);
    const clientId = c.req.header("x-svc-client") ?? "";
    const auth = clientId.length <= 64 ? await opts.authenticate(c.env, clientId) : null;
    const v = await verifyRequest({
      clientId, secrets: auth?.secrets ?? [], method: c.req.method, path: url.pathname + url.search, body: raw, headers: c.req.raw.headers,
      seen: (n, exp) => opts.nonces(c.env).seen(`${clientId}:${n}`, exp),
    });
    if (!v.ok || !auth) {
      logger.warn("svc_auth_rejected", { reason: v.ok ? "client" : v.reason });
      return c.json({ error: "No autorizado.", code: "unauthorized" }, 401);
    }
    c.set("rawBody", raw);
    c.set("client", auth.principal);
    await next();
  };
