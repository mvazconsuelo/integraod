import { SQL_BUDGET_APPLIED } from "./applications.repository";

import { tzOffsetSql } from "../utils/dates";
import type { BudgetStatus } from "../utils/money";
export type { BudgetStatus };

export interface BudgetRow {
  id: string;
  number: number;
  patient_ref: string;
  patient_id: string | null;
  /** Teléfono del cliente (para WhatsApp). */
  patient_phone: string | null;
  issued_on: string;
  valid_until: string | null;
  status: BudgetStatus;
  notes: string;
  total_cents: number;
  created_at: string;
  updated_at: string;
  applied_cents: number;
  /** 1 si el anticipo de este presupuesto ya fue pedido o cobrado. */
  has_advance: number;
  first_item: string | null;
  item_count: number;
  /** Cuándo se compartió por primera vez (null: nunca se usó Compartir) y la respuesta expresa del cliente. */
  shared_at: string | null;
  answer: "accepted" | "declined" | null;
  /** Cómo se acordó cobrar (null: sin definir). No se deduce de los pagos recibidos. */
  payment_mode: "total" | "advance" | "partial" | null;
  /** Medio de cobro elegido (null: sin elegir). Informativo. */
  collect_method: "mercadopago" | "transfer" | "cash" | null;
  /** Pedidos de pago vigentes (sin pagar y sin vencer) y vencidos sin pagar. */
  open_requests: number;
  expired_requests: number;
}

export interface BudgetItemRow {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_pct: number;
  detail: string;
}

/**
 * El anticipo cuenta como pedido si hay un link de anticipo pagado o todavía vigente (los cancelados y
 * vencidos no cuentan), o un pago de tipo anticipo ya aplicado a este presupuesto.
 */
export const hasAdvanceSql = () => `(
  EXISTS (SELECT 1 FROM payment_requests r WHERE r.budget_id = b.id AND r.kind = 'advance'
          AND (r.status = 'paid' OR (r.status IN ('pending','partially_paid') AND (r.due_date IS NULL OR r.due_date >= date('now', '${tzOffsetSql()}')))))
  OR EXISTS (SELECT 1 FROM payment_applications a JOIN payments p ON p.id = a.payment_id
             WHERE a.budget_id = b.id AND a.voided_at IS NULL AND p.kind = 'advance' AND p.status = 'approved')
)`;

// first_item e item_count: para que el concepto de un cobro pueda decir de qué tratamiento es.
const select = () => `SELECT b.*, ${SQL_BUDGET_APPLIED} AS applied_cents, ${hasAdvanceSql()} AS has_advance,
  (SELECT i.description FROM budget_items i WHERE i.budget_id = b.id ORDER BY i.position LIMIT 1) AS first_item,
  (SELECT COUNT(*) FROM budget_items i WHERE i.budget_id = b.id) AS item_count,
  (SELECT MIN(e.at) FROM budget_events e WHERE e.budget_id = b.id AND e.type = 'shared') AS shared_at,
  (SELECT e.type FROM budget_events e WHERE e.budget_id = b.id AND e.type IN ('accepted','declined') AND NOT (e.channel = 'cancel' AND b.status <> 'cancelled') ORDER BY e.seq DESC LIMIT 1) AS answer,
  (SELECT COUNT(*) FROM payment_requests r WHERE r.budget_id = b.id AND r.status IN ('pending','partially_paid') AND (r.due_date IS NULL OR r.due_date >= date('now', '${tzOffsetSql()}'))) AS open_requests,
  (SELECT COUNT(*) FROM payment_requests r WHERE r.budget_id = b.id AND r.status IN ('pending','partially_paid') AND r.due_date < date('now', '${tzOffsetSql()}')) AS expired_requests,
  (SELECT p.phone FROM patients p WHERE p.id = b.patient_id) AS patient_phone FROM budgets b`;

export async function listBudgets(db: D1Database) {
  const { results } = await db.prepare(`${select()} ORDER BY b.number DESC`).all<BudgetRow>();
  return results;
}

export const getBudget = (db: D1Database, id: string) =>
  db.prepare(`${select()} WHERE b.id = ?`).bind(id).first<BudgetRow>();

export async function getItems(db: D1Database, budgetId: string) {
  const { results } = await db
    .prepare("SELECT id, position, description, detail, quantity, unit_price_cents, discount_pct FROM budget_items WHERE budget_id = ? ORDER BY position")
    .bind(budgetId)
    .all<BudgetItemRow>();
  return results;
}

interface BudgetWrite {
  id: string;
  patient_ref: string;
  patient_id: string | null;
  issued_on: string;
  valid_until: string | null;
  notes: string;
  total_cents: number;
  now: string;
  items: { description: string; detail?: string; quantity: number; unit_price_cents: number; discount_pct: number }[];
}

const insertItems = (db: D1Database, w: BudgetWrite) =>
  w.items.map((it, i) =>
    db
      .prepare("INSERT INTO budget_items (id, budget_id, position, description, detail, quantity, unit_price_cents, discount_pct) VALUES (?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), w.id, i, it.description, it.detail ?? "", it.quantity, it.unit_price_cents, it.discount_pct),
  );

export async function createBudget(db: D1Database, w: BudgetWrite) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO budgets (id, number, patient_ref, patient_id, issued_on, valid_until, status, notes, total_cents, created_at, updated_at)
         VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM budgets), ?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
      )
      .bind(w.id, w.patient_ref, w.patient_id, w.issued_on, w.valid_until, w.notes, w.total_cents, w.now, w.now),
    ...insertItems(db, w),
  ]);
}

export async function replaceBudget(db: D1Database, w: BudgetWrite) {
  await db.batch([
    db
      .prepare("UPDATE budgets SET patient_ref=?, patient_id=?, issued_on=?, valid_until=?, notes=?, total_cents=?, updated_at=? WHERE id=?")
      .bind(w.patient_ref, w.patient_id, w.issued_on, w.valid_until, w.notes, w.total_cents, w.now, w.id),
    db.prepare("DELETE FROM budget_items WHERE budget_id = ?").bind(w.id),
    ...insertItems(db, w),
  ]);
}

export async function setBudgetStatus(db: D1Database, id: string, status: BudgetStatus, now: string) {
  await db.prepare("UPDATE budgets SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, id).run();
}

export async function insertEvent(db: D1Database, budgetId: string, type: "shared" | "accepted" | "declined", channel: string, at: string) {
  await db.prepare("INSERT INTO budget_events (budget_id, type, channel, at) VALUES (?, ?, ?, ?)").bind(budgetId, type, channel, at).run();
}

export async function setPaymentMode(db: D1Database, id: string, mode: string | null, at: string) {
  await db.prepare("UPDATE budgets SET payment_mode = ?, updated_at = ? WHERE id = ?").bind(mode, at, id).run();
}

export async function setCollectMethod(db: D1Database, id: string, method: string | null, at: string) {
  await db.prepare("UPDATE budgets SET collect_method = ?, updated_at = ? WHERE id = ?").bind(method, at, id).run();
}
