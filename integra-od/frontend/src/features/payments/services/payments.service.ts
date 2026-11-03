import { api } from "@/lib/api";
import { today } from "@/lib/formatters";

import type { PaymentRequest, RequestDetail } from "@/types";

/** El tipo (anticipo, parcial, final) y el texto del cobro los decide el servidor. */
export interface RequestInput { method: "online" | "cash"; patient_ref: string; amount_cents: number; budget_id: string; conditions: string; due_date: string | null }
export interface ManualInput { patient_ref: string; amount_cents: number; method: "cash" | "transfer"; budget_id: string; request_id: string | null; paid_on: string; notes: string; idempotency_key?: string }

export const createRequest = (b: RequestInput) => api<RequestDetail>("/payments", { body: b });
export const cancelRequest = (id: string) => api<PaymentRequest>(`/payments/${id}/cancel`, { method: "POST", body: {} });
export const registerManual = (b: ManualInput) => api("/payments/manual", { body: b });
export const applyPayment = (paymentId: string, budget_id: string, amount_cents: number) => api(`/payments/received/${paymentId}/apply`, { body: { budget_id, amount_cents } });
export const voidAt = (path: string, reason: string) => api(path, { body: { reason } });

export const publicLink = (publicId: string) => `${window.location.origin}/pay/${publicId}`;

/** Si se eligió "presupuesto nuevo", lo crea (con un solo concepto) y devuelve su id. */
export async function resolveBudgetId(v: { budget_id: string; patient_id: string; patient_ref: string; new_treatment: string; new_total_cents: number }): Promise<string> {
  if (v.budget_id !== "new") return v.budget_id;
  const budget = await api<{ id: string }>("/budgets", {
    body: { patient_ref: v.patient_ref, patient_id: v.patient_id, issued_on: today(), valid_until: null, notes: "", items: [{ description: v.new_treatment.trim(), quantity: 1, unit_price_cents: v.new_total_cents, discount_pct: 0 }] },
  });
  return budget.id;
}
