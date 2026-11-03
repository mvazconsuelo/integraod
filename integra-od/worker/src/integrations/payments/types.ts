export type Kind = "advance" | "partial" | "final";

/** Cobro tal como lo informa el servicio de pagos. */
export interface IntentSnapshot {
  id: string; public_id: string; reference: string; external_reference: string; provider: string; provider_ref: string | null;
  checkout_url: string | null; description: string; payer_label: string; amount_cents: number; currency: string; kind: Kind;
  due_date: string | null; status: "pending" | "partially_paid" | "paid" | "cancelled"; created_at: string; cancelled_at: string | null; version: number;
}

/** Pago (dinero recibido) tal como lo informa el servicio de pagos. */
export interface PaymentSnapshot {
  id: string; intent_id: string | null; reference: string; provider: string; provider_payment_id: string | null; method: string;
  source: "provider" | "manual"; kind: Kind; amount_cents: number; currency: string; status: "approved" | "refunded" | "voided";
  paid_at: string; payer_label: string; concept: string; notes: string; created_at: string; voided_at: string | null; void_reason: string | null; version: number;
  /** Comisión de la billetera y lo que le queda al negocio. null: no se sabe o no aplica (efectivo). */
  fee_cents: number | null; net_cents: number | null;
}

export interface ProviderStatus { id: string; label: string; kind: "online" | "test"; connected: boolean }
export interface ReviewItem { id: string; provider: string; provider_payment_id: string; reason: string; amount_cents: number | null; currency: string | null; created_at: string }
export interface PaymentEvent { id: string; type: string; entity: "intent" | "payment"; entityId: string }
