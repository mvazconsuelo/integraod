import { SQL_PAYMENT_APPLIED } from "./applications.repository";
import type { IntentSnapshot, PaymentSnapshot } from "../integrations/payments/types";

/**
 * COPIA DE LECTURA de lo que informa el servicio de pagos. Esta app no crea ni modifica dinero por su cuenta:
 * solo escribe aquí lo que el servicio le informa (upsertIntent / upsertPayment). Las operaciones van por PaymentsClient.
 */
export type PaymentKind = "advance" | "partial" | "final";

export interface RequestRow {
  id: string; public_id: string; external_reference: string; patient_ref: string; concept: string; amount_cents: number; currency: string;
  kind: PaymentKind; budget_id: string | null; conditions: string; due_date: string | null;
  status: "pending" | "partially_paid" | "paid" | "cancelled";
  provider: string; provider_ref: string | null; checkout_url: string | null; created_at: string; cancelled_at: string | null; version: number;
  paid_cents: number; last_paid_at: string | null; budget_number: number | null;
}

export interface PaymentRow {
  id: string; request_id: string | null; patient_ref: string; concept: string; method: string; source: "provider" | "manual"; provider: string;
  reference: string | null; kind: PaymentKind; amount_cents: number; currency: string; status: "approved" | "refunded" | "voided";
  paid_at: string; provider_payment_id: string | null; notes: string; created_at: string; voided_at: string | null; void_reason: string | null;
  version: number; applied_cents: number;
  fee_cents: number | null; net_cents: number | null;
}

const REQUEST_SELECT = `SELECT r.*,
  COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.request_id = r.id AND p.status = 'approved'), 0) AS paid_cents,
  (SELECT MAX(p.paid_at) FROM payments p WHERE p.request_id = r.id AND p.status = 'approved') AS last_paid_at,
  (SELECT b.number FROM budgets b WHERE b.id = r.budget_id) AS budget_number
  FROM payment_requests r`;

const PAYMENT_SELECT = `SELECT p.*, ${SQL_PAYMENT_APPLIED} AS applied_cents FROM payments p`;

export async function listRequests(db: D1Database) {
  return (await db.prepare(`${REQUEST_SELECT} ORDER BY r.created_at DESC`).all<RequestRow>()).results;
}
export async function listRequestsByBudget(db: D1Database, budgetId: string) {
  return (await db.prepare(`${REQUEST_SELECT} WHERE r.budget_id = ? ORDER BY r.created_at DESC`).bind(budgetId).all<RequestRow>()).results;
}
export const getRequest = (db: D1Database, id: string) => db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).bind(id).first<RequestRow>();
export const getRequestByPublicId = (db: D1Database, publicId: string) => db.prepare(`${REQUEST_SELECT} WHERE r.public_id = ?`).bind(publicId).first<RequestRow>();

/** Solo avanza: un aviso más viejo que lo que ya se tiene no pisa datos nuevos (por eso la versión). */
export async function upsertIntent(db: D1Database, i: IntentSnapshot) {
  await db
    .prepare(
      `INSERT INTO payment_requests (id, public_id, external_reference, patient_ref, concept, amount_cents, currency, kind, budget_id, due_date, status, provider, provider_ref, checkout_url, created_at, cancelled_at, version)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, provider = excluded.provider, provider_ref = excluded.provider_ref,
         checkout_url = excluded.checkout_url, cancelled_at = excluded.cancelled_at, due_date = excluded.due_date, version = excluded.version
       WHERE excluded.version > payment_requests.version`,
    )
    .bind(i.id, i.public_id, i.external_reference, i.payer_label, i.description, i.amount_cents, i.currency, i.kind, i.reference, i.due_date, i.status, i.provider, i.provider_ref, i.checkout_url, i.created_at, i.cancelled_at, i.version)
    .run();
}

/** Las condiciones del cobro son un dato de la app (texto para el cliente): el servicio de pagos no las conoce. */
export async function setConditions(db: D1Database, id: string, conditions: string) {
  await db.prepare("UPDATE payment_requests SET conditions = ? WHERE id = ?").bind(conditions, id).run();
}

export async function listPayments(db: D1Database) {
  return (await db.prepare(`${PAYMENT_SELECT} ORDER BY p.paid_at DESC`).all<PaymentRow>()).results;
}
export const getPayment = (db: D1Database, id: string) => db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).bind(id).first<PaymentRow>();
export async function listPaymentsOfRequest(db: D1Database, requestId: string) {
  return (await db.prepare(`${PAYMENT_SELECT} WHERE p.request_id = ? ORDER BY p.paid_at`).bind(requestId).all<PaymentRow>()).results;
}

export async function upsertPayment(db: D1Database, p: PaymentSnapshot) {
  await db
    .prepare(
      `INSERT INTO payments (id, request_id, patient_ref, concept, method, source, provider, reference, kind, amount_cents, currency, status, paid_at, provider_payment_id, notes, created_at, voided_at, void_reason, version, fee_cents, net_cents)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, voided_at = excluded.voided_at, void_reason = excluded.void_reason, version = excluded.version
       WHERE excluded.version > payments.version`,
    )
    .bind(p.id, p.intent_id, p.payer_label, p.concept, p.method, p.source, p.provider, p.reference, p.kind, p.amount_cents, p.currency, p.status, p.paid_at, p.provider_payment_id, p.notes, p.created_at, p.voided_at, p.void_reason, p.version, p.fee_cents ?? null, p.net_cents ?? null)
    .run();
}
