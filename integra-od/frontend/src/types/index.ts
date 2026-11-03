export type Kind = "advance" | "partial" | "final";
export type Method = "mercadopago" | "cash" | "transfer" | (string & {});
export type BudgetStatus = "draft" | "sent" | "in_progress" | "completed" | "cancelled";
export type RequestStatus = "pending" | "partially_paid" | "paid" | "cancelled" | "expired";

export interface Budget {
  id: string; number: number; patient_ref: string; patient_id: string | null; /** Teléfono del cliente, para WhatsApp. */ patient_phone: string | null; issued_on: string; valid_until: string | null;
  /** Porcentaje ya pagado (0 a 100). */ paid_percent: number;
  status: BudgetStatus; notes: string; total_cents: number; applied_cents: number; balance_cents: number;
  /** El anticipo ya se pidió o se cobró: solo se pueden pedir pagos que siguen. */
  has_advance: boolean;
  /** Primer concepto del presupuesto y cuántos tiene: para nombrar el tratamiento en los cobros. */
  first_item: string | null; item_count: number;
}
export interface BudgetItem { id: string; description: string; quantity: number; unit_price_cents: number; discount_pct: number; total_cents: number }
export interface BudgetApplication {
  id: string; payment_id: string; amount_cents: number; created_at: string; voided_at: string | null; void_reason: string | null;
  method: Method; provider: string; kind: Kind; paid_at: string; concept: string;
}
export interface ActivityEvent { id: string; at: string; type: "budget" | "request" | "payment" | "adjustment"; text: string; detail?: string; to: string; simulated?: boolean }
export interface TimelineEvent { at: string; type: "budget" | "request" | "payment" | "adjustment"; title: string; detail?: string; amount_cents?: number }
export interface BudgetDetail extends Budget { items: BudgetItem[]; applications: BudgetApplication[]; requests: PaymentRequest[]; requestable_cents: number; timeline: TimelineEvent[] }

export interface PaymentRequest {
  id: string; public_id: string; patient_ref: string; concept: string; amount_cents: number; kind: Kind;
  /** "cash": se cobra en mano, sin link de pago. */
  provider: string;
  budget_id: string | null; conditions: string; due_date: string | null; status: string; display_status: RequestStatus;
  checkout_url: string | null; created_at: string; paid_cents: number; pending_cents: number; last_paid_at: string | null; budget_number: number | null;
}
export interface Received {
  id: string; request_id: string | null; patient_ref: string; concept: string; method: Method; source: "provider" | "manual";
  kind: Kind; amount_cents: number; status: "approved" | "refunded" | "voided"; paid_at: string; notes: string;
  applied_cents: number; available_cents: number; void_reason: string | null; provider: string; provider_payment_id: string | null;
  /** Comisión de la billetera y lo que quedó al negocio. null: no se sabe o no aplica (efectivo). */
  fee_cents: number | null; net_cents: number | null;
}
export interface RequestDetail extends PaymentRequest { payments: (Received & { applications: { id: string; budget_number: number; amount_cents: number; voided_at: string | null }[] })[] }

export interface Summary {
  range: { from: string; to: string };
  review_count: number;
  onboarding: { clinic_configured: boolean; budgets: number; collections: number };
  /** Pagos del checkout simulado (piloto): no suman en ningún total. */ simulated: { payments_count: number; total_cents: number };
  collected_cents: number; /** Comisiones de la billetera dentro de lo cobrado (solo de los pagos donde se sabe). */ fees_cents: number; previous_collected_cents: number; previous_range: { from: string; to: string };
  pipeline: { status: string; count: number; total_cents: number; balance_cents: number }[]; stale_sent_count: number;
  advances_requested_cents: number; advances_collected_cents: number; advances_unapplied_cents: number;
  money_unapplied_cents: number; budgets_balance_cents: number;
  pending_requests: { count: number; pending_cents: number; expired_cents: number; expired_count: number };
  budgets_issued: { count: number; total: number };
  /** Presupuestos creados en el período (todos, aunque se hayan cancelado). */ budgets_emitted_count: number;
  /** Presupuestos cuyo primer pago real confirmado cayó en el período (se aceptan pagando). */ jobs_concreted: { count: number; total_cents: number };
  /** Promedio del total de los concretados (null si no hubo). */ average_job_cents: number | null;
  /** De los emitidos en el período: aceptados, cancelados y los que todavía esperan. La tasa deja afuera a los que esperan. */ acceptance: { emitted: number; accepted: number; declined: number; waiting: number; rate_pct: number | null };
  /** Saldo de hoy: presupuestos con pagos y saldo pendiente. */ open_jobs_count: number;
  /** Pagos reales confirmados en el período, cada uno una vez. */ payments_count: number;
  /** Presupuestos con un anticipo real confirmado en el período. */ advances_received_count: number;
  by_method: { method: Method; total_cents: number }[];
  monthly: { month: string; total_cents: number }[];
}

/** Un cliente de la lista: nombre y teléfono (WhatsApp). */
export interface Contact { id: string; name: string; phone: string | null; phone_display: string | null }
export interface PatientSummary { id: string | null; phone: string | null; phone_display: string | null; name: string; budgets_count: number; budgeted_cents: number; applied_cents: number; balance_cents: number; last_activity: string }
export interface PatientDetail {
  contact: Contact | null;
  name: string;
  totals: { budgeted_cents: number; applied_cents: number; balance_cents: number; received_cents: number; unassigned_cents: number };
  budgets: Budget[]; requests: PaymentRequest[]; payments: Received[];
}

export interface Treatment { id: string; name: string; category: string; price_cents: number; position: number }

export interface Settings {
  name: string; logo_data_url: string | null; phone: string; email: string; address: string; professional_info: string;
  primary_color: string; accent_color: string; terms: string; default_validity_days: number; /** Zona horaria del consultorio (IANA). */ time_zone: string; payments_online: boolean; mp_connected: boolean; mp_mock: boolean;
}

export interface ReviewItem { id: string; provider: string; provider_payment_id: string; reason: string; amount_cents: number | null; currency: string | null; created_at: string }
