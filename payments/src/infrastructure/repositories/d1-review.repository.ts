import type { ReviewRepository } from "../../application/ports";
import type { ReviewItem } from "../../domain/payment.types";

export class D1ReviewRepository implements ReviewRepository {
  constructor(private db: D1Database, private clientId: string) {}

  async flag(i: { provider: string; providerPaymentId: string; reason: string; amountCents: number; currency: string; externalReference: string | null }, at: string) {
    await this.db
      .prepare("INSERT OR IGNORE INTO review_items (client_id, id, provider, provider_payment_id, reason, amount_cents, currency, external_reference, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(this.clientId, crypto.randomUUID(), i.provider, i.providerPaymentId, i.reason, i.amountCents, i.currency, i.externalReference, at)
      .run();
  }

  async listOpen() {
    return (await this.db.prepare("SELECT * FROM review_items WHERE client_id = ? AND resolved_at IS NULL ORDER BY created_at DESC").bind(this.clientId).all<ReviewItem>()).results;
  }

  async dismiss(id: string, reason: string, at: string) {
    const res = await this.db.prepare("UPDATE review_items SET resolved_at = ?, resolution = ? WHERE client_id = ? AND id = ? AND resolved_at IS NULL").bind(at, reason, this.clientId, id).run();
    return (res.meta.changes ?? 0) > 0;
  }
}
