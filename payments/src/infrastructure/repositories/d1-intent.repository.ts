import type { IntentRepository, Write } from "../../application/ports";
import type { IntentRow, NewIntent } from "../../domain/payment.types";

export class D1IntentRepository implements IntentRepository {
  constructor(private db: D1Database, private clientId: string) {}

  byId = (id: string) => this.db.prepare("SELECT * FROM intents WHERE client_id = ? AND id = ?").bind(this.clientId, id).first<IntentRow>();
  byPublicId = (publicId: string) => this.db.prepare("SELECT * FROM intents WHERE client_id = ? AND public_id = ?").bind(this.clientId, publicId).first<IntentRow>();
  byExternalReference = (ref: string) => this.db.prepare("SELECT * FROM intents WHERE client_id = ? AND external_reference = ?").bind(this.clientId, ref).first<IntentRow>();

  async countApprovedPayments(intentId: string) {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM payments WHERE client_id = ? AND intent_id = ? AND status = 'approved'").bind(this.clientId, intentId).first<{ n: number }>();
    return r!.n;
  }

  insert(i: NewIntent): Write {
    return this.db
      .prepare(
        `INSERT INTO intents (client_id, id, public_id, reference, external_reference, provider, provider_ref, checkout_url, description, payer_label, amount_cents, currency, kind, due_date, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(this.clientId, i.id, i.public_id, i.reference, i.external_reference, i.provider, i.provider_ref, i.checkout_url, i.description, i.payer_label, i.amount_cents, i.currency, i.kind, i.due_date, i.created_at) as unknown as Write;
  }

  cancel(id: string, at: string): Write {
    return this.db
      .prepare("UPDATE intents SET status = 'cancelled', cancelled_at = ?, version = version + 1 WHERE client_id = ? AND id = ? AND status IN ('pending','partially_paid')")
      .bind(at, this.clientId, id) as unknown as Write;
  }

  /** El estado del cobro se deriva de lo cobrado realmente (en SQL, dentro de la misma operación). */
  syncStatus(id: string): Write {
    return this.db
      .prepare(
        `UPDATE intents SET version = version + 1, status = CASE
           WHEN status = 'cancelled' THEN 'cancelled'
           WHEN COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.client_id = intents.client_id AND p.intent_id = intents.id AND p.status = 'approved'), 0) <= 0 THEN 'pending'
           WHEN COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.client_id = intents.client_id AND p.intent_id = intents.id AND p.status = 'approved'), 0) >= amount_cents THEN 'paid'
           ELSE 'partially_paid' END
         WHERE client_id = ? AND id = ?`,
      )
      .bind(this.clientId, id) as unknown as Write;
  }
}
