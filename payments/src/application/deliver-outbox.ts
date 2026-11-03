import type { Deps } from "./ports";

/** Entrega los avisos pendientes a la app, firmados. Si falla, reintenta con espera creciente (hasta 1 hora). */
export async function deliverOutbox(deps: Deps, limit = 25): Promise<number> {
  let delivered = 0;
  for (const e of await deps.outbox.due(deps.clock.now(), limit)) {
    try {
      const res = await deps.publisher.publish({ id: e.id, type: e.type, entity: e.entity, entityId: e.entity_id });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await deps.outbox.markDelivered(e.id, deps.clock.now());
      delivered++;
    } catch (err) {
      const attempts = e.attempts + 1;
      const waitSeconds = Math.min(3600, 5 * 2 ** attempts);
      await deps.outbox.markFailed(e.id, attempts, new Date(Date.now() + waitSeconds * 1000).toISOString(), err instanceof Error ? err.message : "error");
    }
  }
  return delivered;
}
