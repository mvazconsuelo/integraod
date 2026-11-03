import { Hono } from "hono";
import { completeProviderConnection } from "../application/connect-provider";
import { buildDeps, clientRepository, platformLimiter, providerRegistry } from "../infrastructure/container";
import type { Env } from "../shared/env";

/**
 * Vuelta del navegador desde el proveedor al conectar la cuenta. No lleva clave: se protege con un `state` firmado
 * que además dice de qué cliente es la conexión (la dirección de retorno es una sola para todos).
 */
export const oauthController = new Hono<{ Bindings: Env }>();

oauthController.get("/:provider/callback", async (c) => {
  const provider = providerRegistry.get(c.req.param("provider"));
  if (!(await platformLimiter(c.env).allow(`oauth:${provider.id}`, c.req.header("CF-Connecting-IP") ?? null, 20, 60))) return c.text("Demasiados intentos. Probá de nuevo en un minuto.", 429);

  const params = new URL(c.req.url).searchParams;
  const clientId = await provider.oauthClientId?.(c.env, params);
  const client = clientId ? await clientRepository(c.env).byId(clientId) : null;
  if (!client) return c.text("La conexión no es válida o venció. Volvé a la app y probá de nuevo.", 400);

  const back = (result: "ok" | "error") => c.redirect(`${client.appUrl}/configuracion?mp=${result}`);
  try {
    await completeProviderConnection(buildDeps(c.env, client), provider.id, params);
    return back("ok");
  } catch {
    return back("error");
  }
});
