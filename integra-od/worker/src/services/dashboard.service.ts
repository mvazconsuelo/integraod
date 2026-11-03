import { SQL_PAYMENT_APPLIED, SQL_BUDGET_APPLIED } from "../repositories/applications.repository";
import { addDays, previousRange, todayLocal, tzOffsetSql } from "../utils/dates";

// Los pagos del checkout simulado (piloto) no son dinero: no entran en ningún total, se informan aparte.
const REAL = "p.provider <> 'mock'";

/**
 * Las definiciones del Resumen (una sola vez, acá):
 *  - Cobrado: pagos aprobados y reales, por día de cobro dentro del período.
 *  - Por cobrar: saldo de los presupuestos En curso.
 *  - Anticipos pedidos / cobrados: cobros de tipo anticipo creados / pagos de tipo anticipo recibidos en el período.
 *  - Sin presupuesto: pagos aprobados y reales que todavía no se aplicaron a ningún presupuesto.
 *  - Pagos parciales: pagos aprobados y reales de tipo parcial recibidos en el período (el anticipo y el pago final se cuentan aparte).
 *  - Presupuestado: total de los presupuestos emitidos en el período, sin los cancelados.
 *  - Ticket promedio: presupuestado ÷ cantidad de presupuestos emitidos.
 *  - Tasa de aceptación: de los presupuestos emitidos en el período, cuántos ya recibieron al menos un pago (un presupuesto se acepta pagando).
 */

export async function getSummary(db: D1Database, from: string, to: string) {
  const today = todayLocal();
  const LOCAL_DAY = `date(p.paid_at, '${tzOffsetSql()}')`;

  const collected = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS total,
              COALESCE(SUM(CASE WHEN kind='advance' THEN amount_cents END),0) AS advances,
              COALESCE(SUM(CASE WHEN kind='partial' THEN amount_cents END),0) AS partials,
              COALESCE(SUM(fee_cents),0) AS fees
       FROM payments p WHERE status='approved' AND ${REAL} AND ${LOCAL_DAY} BETWEEN ? AND ?`,
    )
    .bind(from, to)
    .first<{ total: number; advances: number; partials: number; fees: number }>();

  const clinic = await db.prepare("SELECT name FROM clinic_settings WHERE id = 1").first<{ name: string }>();
  const counts = await db
    .prepare("SELECT (SELECT COUNT(*) FROM budgets) AS budgets, (SELECT COUNT(*) FROM payment_requests) + (SELECT COUNT(*) FROM payments) AS collections")
    .first<{ budgets: number; collections: number }>();

  const prev = previousRange(from, to);
  const previous = await db
    .prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM payments p WHERE status='approved' AND ${REAL} AND ${LOCAL_DAY} BETWEEN ? AND ?`)
    .bind(prev.from, prev.to)
    .first<{ total: number }>();

  // Presupuestos con movimiento pendiente, por estado. "Sin respuesta": enviados hace más de 7 días.
  const { results: pipeline } = await db
    .prepare(
      `SELECT b.status, COUNT(*) AS count, COALESCE(SUM(b.total_cents),0) AS total_cents, COALESCE(SUM(b.total_cents - ${SQL_BUDGET_APPLIED}),0) AS balance_cents
       FROM budgets b WHERE b.status IN ('sent','in_progress') GROUP BY b.status`,
    )
    .all<{ status: string; count: number; total_cents: number; balance_cents: number }>();
  const stale = await db
    .prepare("SELECT COUNT(*) AS count FROM budgets WHERE status = 'sent' AND issued_on <= ?")
    .bind(addDays(today, -7))
    .first<{ count: number }>();

  const unapplied = await db
    .prepare(
      `SELECT COALESCE(SUM(p.amount_cents - ${SQL_PAYMENT_APPLIED}),0) AS total,
              COALESCE(SUM(CASE WHEN p.kind='advance' THEN p.amount_cents - ${SQL_PAYMENT_APPLIED} END),0) AS advances
       FROM payments p WHERE p.status='approved' AND ${REAL}`,
    )
    .first<{ total: number; advances: number }>();

  const requests = await db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(pending),0) AS pending_cents,
              COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < ? THEN pending END),0) AS expired_cents,
              COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < ? THEN 1 END),0) AS expired_count
       FROM (SELECT r.due_date, r.amount_cents - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.request_id=r.id AND p.status='approved'),0) AS pending
             FROM payment_requests r WHERE r.status IN ('pending','partially_paid') AND r.provider <> 'mock') q WHERE pending > 0`,
    )
    .bind(today, today)
    .first<{ count: number; pending_cents: number; expired_cents: number; expired_count: number }>();

  const requested = await db
    .prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM payment_requests WHERE kind='advance' AND status <> 'cancelled' AND provider <> 'mock' AND date(created_at,'${tzOffsetSql()}') BETWEEN ? AND ?`)
    .bind(from, to)
    .first<{ total: number }>();

  const budgetsOpen = await db
    .prepare(
      `SELECT COALESCE(SUM(b.total_cents - ${SQL_BUDGET_APPLIED}),0) AS balance FROM budgets b WHERE b.status IN ('in_progress')`,
    )
    .first<{ balance: number }>();

  const issued = await db
    .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_cents),0) AS total, COALESCE(SUM(CASE WHEN status IN ('in_progress','completed') THEN 1 END),0) AS accepted FROM budgets WHERE status <> 'cancelled' AND issued_on BETWEEN ? AND ?`)
    .bind(from, to)
    .first<{ count: number; total: number; accepted: number }>();

  const { results: byMethod } = await db
    .prepare(`SELECT method, SUM(amount_cents) AS total_cents FROM payments p WHERE status='approved' AND ${REAL} AND ${LOCAL_DAY} BETWEEN ? AND ? GROUP BY method ORDER BY total_cents DESC`)
    .bind(from, to)
    .all<{ method: string; total_cents: number }>();

  const sixMonthsAgo = `${addDays(today, -183).slice(0, 7)}-01`;
  const { results: monthly } = await db
    .prepare(`SELECT strftime('%Y-%m', p.paid_at, '${tzOffsetSql()}') AS month, SUM(amount_cents) AS total_cents FROM payments p WHERE status='approved' AND ${REAL} AND ${LOCAL_DAY} >= ? GROUP BY month ORDER BY month`)
    .bind(sixMonthsAgo)
    .all<{ month: string; total_cents: number }>();

  // Lo simulado del piloto, aparte: sirve para probar, no es dinero.
  const simulated = await db
    .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents),0) AS total FROM payments p WHERE status='approved' AND p.provider = 'mock' AND ${LOCAL_DAY} BETWEEN ? AND ?`)
    .bind(from, to)
    .first<{ count: number; total: number }>();

  return {
    range: { from, to },
    simulated: { payments_count: simulated!.count, total_cents: simulated!.total },
    // Para la guía de primeros pasos del Resumen
    onboarding: { clinic_configured: Boolean(clinic?.name.trim()), budgets: counts!.budgets, collections: counts!.collections },
    collected_cents: collected!.total,
    previous_collected_cents: previous!.total,
    previous_range: prev,
    // Comisiones de la billetera en el período (solo de los pagos donde se sabe cuánto fue).
    fees_cents: collected!.fees,
    pipeline,
    stale_sent_count: stale!.count,
    advances_requested_cents: requested!.total,
    advances_collected_cents: collected!.advances,
    advances_unapplied_cents: unapplied!.advances,
    money_unapplied_cents: unapplied!.total,
    pending_requests: requests!,
    budgets_balance_cents: budgetsOpen!.balance,
    budgets_issued: { count: issued!.count, total: issued!.total },
    average_ticket_cents: issued!.count > 0 ? Math.round(issued!.total / issued!.count) : null,
    acceptance: { issued: issued!.count, accepted: issued!.accepted, rate_pct: issued!.count > 0 ? Math.round((issued!.accepted * 100) / issued!.count) : null },
    partials_collected_cents: collected!.partials,
    by_method: byMethod,
    monthly,
  };
}
