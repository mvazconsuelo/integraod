export type Kind = "advance" | "partial" | "final";

export interface IntentRow {
  id: string; public_id: string; reference: string; external_reference: string; provider: string; provider_ref: string | null;
  checkout_url: string | null; description: string; payer_label: string; amount_cents: number; currency: string; kind: Kind;
  due_date: string | null; status: "pending" | "partially_paid" | "paid" | "cancelled"; created_at: string; cancelled_at: string | null; version: number;
}

export interface PaymentRow {
  id: string; intent_id: string | null; reference: string; provider: string; provider_payment_id: string | null; idempotency_key: string | null;
  method: string; source: "provider" | "manual"; kind: Kind; amount_cents: number; currency: string; status: "approved" | "refunded" | "voided";
  paid_at: string; payer_label: string; concept: string; notes: string; created_at: string; voided_at: string | null; void_reason: string | null; version: number;
  /** Comisión del proveedor y lo que queda al negocio, en centavos. null: no se sabe o no aplica (efectivo). */
  fee_cents: number | null; net_cents: number | null;
}

export type NewIntent = Omit<IntentRow, "status" | "cancelled_at" | "version">;
export type NewPayment = Omit<PaymentRow, "status" | "voided_at" | "void_reason" | "version">;

/** Algo que la app tiene que enterarse (se guarda junto al cambio y se entrega firmado). */
export interface DomainEvent { type: string; entity: "intent" | "payment"; id: string }

export type Outcome = "registered" | "duplicate" | "ignored" | "rejected" | "refunded";

/** "online": con link de pago del proveedor. "cash": se cobra en mano; no tiene proveedor ni link. */
export type CollectMethod = "online" | "cash";

export interface CreateIntentInput { method?: CollectMethod; reference: string; description: string; payerLabel: string; amountCents: number; currency?: string; kind: Kind; dueDate: string | null }

export interface ManualPaymentInput {
  idempotencyKey: string; intentId: string | null; reference: string; payerLabel: string; concept: string;
  amountCents: number; method: "cash" | "transfer"; kind: Kind; paidAt?: string; notes: string;
}

export interface ReviewItem {
  id: string; provider: string; provider_payment_id: string; reason: string; amount_cents: number | null; currency: string | null;
  external_reference: string | null; created_at: string; resolved_at: string | null; resolution: string | null;
}
