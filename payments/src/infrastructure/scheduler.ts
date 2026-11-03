import { deliverOutbox } from "../application/deliver-outbox";
import type { Env } from "../shared/env";
import { logger } from "../shared/logger";
import { buildDeps, clientRepository } from "./container";

/** Reintenta los avisos pendientes de TODOS los clientes. Cada uno va aparte: una app caída no frena a las demás. */
export async function deliverAllOutboxes(env: Env): Promise<number> {
  let total = 0;
  for (const client of await clientRepository(env).listActive()) {
    try { total += await deliverOutbox(buildDeps(env, client)); } catch (e) { logger.error("outbox_client_failed", { client: client.id, error: e instanceof Error ? e.name : "unknown" }); }
  }
  return total;
}
