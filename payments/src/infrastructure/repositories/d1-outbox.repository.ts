import type { OutboxEntry, OutboxRepository } from "../../application/ports";

export class D1OutboxRepository implements OutboxRepository {
  constructor(private db: D1Database, private clientId: string) {}

  async due(now: string, limit: number) {
    return (await this.db.prepare("SELECT id, type, entity, entity_id, attempts FROM outbox WHERE client_id = ? AND delivered_at IS NULL AND next_attempt_at <= ? ORDER BY created_at LIMIT ?").bind(this.clientId, now, limit).all<OutboxEntry>()).results;
  }
  async markDelivered(id: string, at: string) {
    await this.db.prepare("UPDATE outbox SET delivered_at = ?, last_error = NULL WHERE client_id = ? AND id = ?").bind(at, this.clientId, id).run();
  }
  async markFailed(id: string, attempts: number, nextAttemptAt: string, error: string) {
    await this.db.prepare("UPDATE outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE client_id = ? AND id = ?").bind(attempts, nextAttemptAt, error.slice(0, 200), this.clientId, id).run();
  }
}
