import type { PaymentRepository, Write } from "../../application/ports";
import type { NewPayment, PaymentRow } from "../../domain/payment.types";

export class D1PaymentRepository implements PaymentRepository {
  constructor(private db: D1Database, private clientId: string) {}

  byId = (id: string) => this.db.prepare("SELECT * FROM payments WHERE client_id = ? AND id = ?").bind(this.clientId, id).first<PaymentRow>();
  byIdempotencyKey = (key: string) => this.db.prepare("SELECT * FROM payments WHERE client_id = ? AND idempotency_key = ?").bind(this.clientId, key).first<PaymentRow>();
  byProviderPayment = (provider: string, id: string) => this.db.prepare("SELECT * FROM payments WHERE client_id = ? AND provider = ? AND provider_payment_id = ?").bind(this.clientId, provider, id).first<PaymentRow>();
  async ofIntent(intentId: string) {
    return (await this.db.prepare("SELECT * FROM payments WHERE client_id = ? AND intent_id = ? ORDER BY paid_at").bind(this.clientId, intentId).all<PaymentRow>()).results;
  }

  /** INSERT OR IGNORE: repetir el mismo pago de un proveedor no lo duplica (clave única por cliente + proveedor + id del pago). */
  insert(p: NewPayment): Write {
    return this.db
      .prepare(
        `INSERT OR IGNORE INTO payments (client_id, id, intent_id, reference, provider, provider_payment_id, idempotency_key, method, source, kind, amount_cents, currency, paid_at, payer_label, concept, notes, created_at, fee_cents, net_cents)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(this.clientId, p.id, p.intent_id, p.reference, p.provider, p.provider_payment_id, p.idempotency_key, p.method, p.source, p.kind, p.amount_cents, p.currency, p.paid_at, p.payer_label, p.concept, p.notes, p.created_at, p.fee_cents, p.net_cents) as unknown as Write;
  }

  reverse(id: string, status: "refunded" | "voided", reason: string, at: string): Write {
    return this.db
      .prepare("UPDATE payments SET status = ?, void_reason = ?, voided_at = ?, version = version + 1 WHERE client_id = ? AND id = ? AND status = 'approved'")
      .bind(status, reason, at, this.clientId, id) as unknown as Write;
  }
}
