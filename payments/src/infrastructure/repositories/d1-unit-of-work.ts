import type { Clock, UnitOfWork, Write } from "../../application/ports";
import type { DomainEvent } from "../../domain/payment.types";

/**
 * Escribe el cambio y sus avisos pendientes (outbox) en UNA operación (batch de D1: todo o nada).
 * Si el cambio existe, el aviso existe: no hay forma de que la app no se entere de un movimiento de dinero.
 */
export class D1UnitOfWork implements UnitOfWork {
  constructor(private db: D1Database, private clock: Clock, private clientId: string) {}

  async commit(writes: Write[], events: DomainEvent[]) {
    const now = this.clock.now();
    const outbox = events.map((e) =>
      this.db.prepare("INSERT INTO outbox (client_id, id, type, entity, entity_id, created_at, next_attempt_at) VALUES (?,?,?,?,?,?,?)").bind(this.clientId, crypto.randomUUID(), e.type, e.entity, e.id, now, now),
    );
    const results = await this.db.batch([...(writes as unknown as D1PreparedStatement[]), ...outbox]);
    return results.slice(0, writes.length).map((r) => ({ changes: r.meta.changes ?? 0 }));
  }
}
