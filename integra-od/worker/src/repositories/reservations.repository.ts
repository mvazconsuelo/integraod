import { SQL_BUDGET_APPLIED } from "./applications.repository";
import { hasAdvanceSql } from "./budgets.repository";

/** Una reserva dura lo que tarda en crearse el cobro; si algo falla y no se suelta, vence sola. */
export const RESERVATION_TTL_MS = 120_000;

/**
 * Reserva, en UNA sola sentencia, el importe de un cobro nuevo: solo se inserta si todavía entra en lo que falta cobrar
 * (saldo − cobros vigentes − otras reservas) y, para un anticipo, si no hay otro pedido ni en marcha.
 * Así dos pedidos simultáneos no pueden sumar más que el saldo ni pedir dos anticipos.
 */
export async function reserve(db: D1Database, r: { id: string; budgetId: string; amountCents: number; kind: string; today: string; now: Date }): Promise<boolean> {
  const cutoff = new Date(r.now.getTime() - RESERVATION_TTL_MS).toISOString();
  const res = await db
    .prepare(
      `INSERT INTO request_reservations (id, budget_id, amount_cents, kind, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5
       WHERE ?3 > 0
         AND EXISTS (
           SELECT 1 FROM budgets b WHERE b.id = ?2 AND b.status <> 'cancelled'
             AND b.total_cents - ${SQL_BUDGET_APPLIED}
               - COALESCE((SELECT SUM(MAX(0, q.amount_cents - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.request_id = q.id AND p.status = 'approved'), 0)))
                           FROM payment_requests q WHERE q.budget_id = b.id AND q.status IN ('pending','partially_paid') AND (q.due_date IS NULL OR q.due_date >= ?6)), 0)
               - COALESCE((SELECT SUM(x.amount_cents) FROM request_reservations x WHERE x.budget_id = b.id AND x.created_at > ?7), 0) >= ?3
             AND (?4 <> 'advance' OR (NOT ${hasAdvanceSql()}
                  AND NOT EXISTS (SELECT 1 FROM request_reservations x WHERE x.budget_id = b.id AND x.kind = 'advance' AND x.created_at > ?7)))
         )`,
    )
    .bind(r.id, r.budgetId, r.amountCents, r.kind, r.now.toISOString(), r.today, cutoff)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export const release = (db: D1Database, id: string) => db.prepare("DELETE FROM request_reservations WHERE id = ?").bind(id).run();
