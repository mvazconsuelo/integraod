import { SQL_PAYMENT_APPLIED, SQL_BUDGET_APPLIED } from "../repositories/applications.repository";
import { addDays, previousRange, todayLocal, tzOffsetSql } from "../utils/dates";

// Los pagos del checkout simulado (piloto) no son dinero: no entran en ningún total, se informan aparte.
const REAL = "p.provider <> 'mock'";

/**
 * Las definiciones del Resumen y de Control (una sola vez, acá). Todo en centavos enteros; nada simulado cuenta.
 *  - Recibido: pagos aprobados y reales, por día de cobro dentro del período.
 *  - Por cobrar (saldo de hoy): lo que falta de los presupuestos En curso. No es la suma de pedidos abiertos.
 *  - Presupuestos emitidos: los creados en el período, por su fecha de emisión (compartirlos ocurre fuera del sistema: no se registra el envío).
 *  - Trabajos concretados: presupuestos cuyo PRIMER pago real confirmado cayó en el período (un presupuesto se acepta pagando).
 *  - Importe promedio: promedio del total de esos presupuestos concretados.
 *  - Tasa de aceptación: de los emitidos en el período con respuesta EXPRESA: aceptados ÷ (aceptados + rechazados).
 *    Cancelar un presupuesto cuenta como rechazo del cliente (regla de negocio); los que esperan respuesta no entran. Sin respuestas todavía: no hay tasa (null).
 *  - Saldo real: las aplicaciones de pagos simulados no lo reducen (ver SQL_BUDGET_APPLIED).
 *  - Trabajos con saldo (de hoy): presupuestos En curso.
 *  - Pagos recibidos: cantidad de pagos aprobados y reales del período (cada pago cuenta una vez).
 *  - Anticipos recibidos: presupuestos con un anticipo real confirmado en el período.
 *  - Saldos más viejos: hasta 5 presupuestos En curso con saldo, ordenados por la fecha de su último pago real (días desde ese pago).
 *  - Sin presupuesto: pagos aprobados y reales que todavía no se aplicaron a ningún presupuesto.
 */
// Cada presupuesto con su fecha de aceptación: el primer pago real confirmado que se le aplicó (sin anulaciones ni cancelados).
const ACCEPTED = `accepted AS (
  SELECT b.id AS id, b.total_cents AS total_cents, MIN(p.paid_at) AS accepted_at
  FROM budgets b
  JOIN payment_applications a ON a.budget_id = b.id AND a.voided_at IS NULL
  JOIN payments p ON p.id = a.payment_id AND p.status = 'approved' AND p.provider <> 'mock'
  WHERE b.status <> 'cancelled'
  GROUP BY b.id
)`;

export async function getSummary(db: D1Database, from: string, to: string) {
  const today = todayLocal();
  const LOCAL_DAY = `date(p.paid_at, '${tzOffsetSql()}')`;

  const collected = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS total,
              COALESCE(SUM(CASE WHEN kind='advance' THEN amount_cents END),0) AS advances,
              COUNT(*) AS payments_count,
              COALESCE(SUM(fee_cents),0) AS fees
       FROM payments p WHERE status='approved' AND ${REAL} AND ${LOCAL_DAY} BETWEEN ? AND ?`,
    )
    .bind(from, to)
    .first<{ total: number; advances: number; payments_count: number; fees: number }>();

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

  // Los saldos que más tiempo llevan sin movimiento: de los presupuestos En curso, ordenados por su último pago real (el más viejo primero).
  const { results: oldest } = await db
    .prepare(
      `SELECT b.id AS id, b.number AS number, b.patient_ref AS patient_ref, (b.total_cents - ${SQL_BUDGET_APPLIED}) AS balance_cents,
              (SELECT MAX(p.paid_at) FROM payment_applications a JOIN payments p ON p.id = a.payment_id
               WHERE a.budget_id = b.id AND a.voided_at IS NULL AND p.status = 'approved' AND p.provider <> 'mock') AS last_paid_at
       FROM budgets b WHERE b.status = 'in_progress' AND (b.total_cents - ${SQL_BUDGET_APPLIED}) > 0
       ORDER BY last_paid_at IS NULL, last_paid_at ASC, b.number ASC LIMIT 5`,
    )
    .all<{ id: string; number: number; patient_ref: string; balance_cents: number; last_paid_at: string | null }>();
  const oldestBalances = oldest.map((o) => ({ ...o, days_since_payment: o.last_paid_at ? Math.max(0, Math.round((Date.parse(today) - Date.parse(o.last_paid_at.slice(0, 10))) / 86_400_000)) : null }));

  const issued = await db
    .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_cents END),0) AS total, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN 1 END),0) AS live FROM budgets WHERE issued_on BETWEEN ? AND ?`)
    .bind(from, to)
    .first<{ count: number; total: number; live: number }>();

  const concreted = await db
    .prepare(`WITH ${ACCEPTED} SELECT COUNT(*) AS count, COALESCE(SUM(total_cents),0) AS total FROM accepted WHERE date(accepted_at, '${tzOffsetSql()}') BETWEEN ? AND ?`)
    .bind(from, to)
    .first<{ count: number; total: number }>();

  // Respuesta de los emitidos en el período: solo cuentan las respuestas EXPRESAS (aceptó o rechazó).
  // Cancelar un presupuesto no es rechazo; un presupuesto sin respuesta no entra en la tasa.
  const answered = await db
    .prepare(
      `SELECT COUNT(*) AS emitted,
              COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM budget_events e WHERE e.budget_id = b.id AND e.type = 'shared') THEN 1 END),0) AS shared,
              COALESCE(SUM(CASE WHEN ans = 'accepted' THEN 1 END),0) AS accepted,
              COALESCE(SUM(CASE WHEN ans = 'declined' THEN 1 END),0) AS declined,
              COALESCE(SUM(CASE WHEN ans IS NULL AND st <> 'cancelled' THEN 1 END),0) AS waiting
       FROM (SELECT b.id AS id, b.status AS st, (SELECT e.type FROM budget_events e WHERE e.budget_id = b.id AND e.type IN ('accepted','declined') AND NOT (e.channel = 'cancel' AND b.status <> 'cancelled') ORDER BY e.seq DESC LIMIT 1) AS ans
             FROM budgets b WHERE b.issued_on BETWEEN ? AND ?) b`,
    )
    .bind(from, to)
    .first<{ emitted: number; shared: number; accepted: number; declined: number; waiting: number }>();

  const advancesReceived = await db
    .prepare(
      `SELECT COUNT(DISTINCT a.budget_id) AS count
       FROM payment_applications a JOIN payments p ON p.id = a.payment_id
       WHERE a.voided_at IS NULL AND p.status = 'approved' AND p.kind = 'advance' AND ${REAL} AND ${LOCAL_DAY} BETWEEN ? AND ?`,
    )
    .bind(from, to)
    .first<{ count: number }>();

  const openJobs = await db.prepare("SELECT COUNT(*) AS count FROM budgets WHERE status = 'in_progress'").first<{ count: number }>();

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
    oldest_balances: oldestBalances,
    budgets_issued: { count: issued!.live, total: issued!.total },
    budgets_emitted_count: issued!.count,
    jobs_concreted: { count: concreted!.count, total_cents: concreted!.total },
    average_job_cents: concreted!.count > 0 ? Math.round(concreted!.total / concreted!.count) : null,
    acceptance: {
      emitted: answered!.emitted,
      shared: answered!.shared,
      accepted: answered!.accepted,
      declined: answered!.declined,
      waiting: answered!.waiting, // sin respuesta y todavía vigentes (los cancelados no esperan nada)
      rate_pct: answered!.accepted + answered!.declined > 0 ? Math.round((answered!.accepted * 100) / (answered!.accepted + answered!.declined)) : null,
    },
    open_jobs_count: openJobs!.count,
    payments_count: collected!.payments_count,
    advances_received_count: advancesReceived!.count,
    by_method: byMethod,
    monthly,
  };
}
