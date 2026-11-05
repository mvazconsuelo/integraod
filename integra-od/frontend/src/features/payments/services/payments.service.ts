import { api } from "@/lib/api";

import type { PaymentRequest, RequestDetail } from "@/types";

/** El tipo (anticipo, parcial, final) y el texto del cobro los decide el servidor. */
export interface RequestInput { method: "online" | "cash"; patient_ref: string; amount_cents: number; budget_id: string; conditions: string; due_date: string | null }
export interface ManualInput { patient_ref: string; amount_cents: number; method: "cash" | "transfer"; budget_id: string; request_id: string | null; paid_on: string; notes: string; idempotency_key?: string }

export const createRequest = (b: RequestInput) => api<RequestDetail>("/payments", { body: b });
export const cancelRequest = (id: string) => api<PaymentRequest>(`/payments/${id}/cancel`, { method: "POST", body: {} });
export const registerManual = (b: ManualInput) => api("/payments/manual", { body: b });
export const voidAt = (path: string, reason: string) => api(path, { body: { reason } });

export const publicLink = (publicId: string) => `${window.location.origin}/pay/${publicId}`;
