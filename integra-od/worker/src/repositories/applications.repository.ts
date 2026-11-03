export interface ApplicationRow {
  id: string;
  payment_id: string;
  budget_id: string;
  amount_cents: number;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

const PAYMENT_APPLIED = `COALESCE((SELECT SUM(amount_cents) FROM payment_applications a WHERE a.payment_id = p.id AND a.voided_at IS NULL), 0)`;
const BUDGET_APPLIED = `COALESCE((SELECT SUM(amount_cents) FROM payment_applications a WHERE a.budget_id = b.id AND a.voided_at IS NULL), 0)`;
export const SQL_PAYMENT_APPLIED = PAYMENT_APPLIED;
export const SQL_BUDGET_APPLIED = BUDGET_APPLIED;

/**
 * Inserta la aplicación en UNA sola sentencia que verifica, en el mismo instante,
 * que el pago tenga disponible y que el presupuesto tenga saldo. Así dos pedidos
 * simultáneos no pueden aplicar dos veces el mismo dinero.
 * Devuelve true si se insertó.
 */
export async function insertApplication(
  db: D1Database,
  a: { id: string; paymentId: string; budgetId: string; amountCents: number; createdAt: string },
): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO payment_applications (id, payment_id, budget_id, amount_cents, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5
       WHERE ?4 > 0
         AND EXISTS (SELECT 1 FROM payments p WHERE p.id = ?2 AND p.status = 'approved'
                     AND p.amount_cents - ${PAYMENT_APPLIED} >= ?4)
         AND EXISTS (SELECT 1 FROM budgets b WHERE b.id = ?3 AND b.status <> 'cancelled'
                     AND b.total_cents - ${BUDGET_APPLIED} >= ?4)`,
    )
    .bind(a.id, a.paymentId, a.budgetId, a.amountCents, a.createdAt)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export const getApplication = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM payment_applications WHERE id = ?").bind(id).first<ApplicationRow>();

export async function voidApplication(db: D1Database, id: string, reason: string, at: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE payment_applications SET voided_at = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL")
    .bind(at, reason, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function voidApplicationsOfPayment(db: D1Database, paymentId: string, reason: string, at: string) {
  await db
    .prepare("UPDATE payment_applications SET voided_at = ?, void_reason = ? WHERE payment_id = ? AND voided_at IS NULL")
    .bind(at, reason, paymentId)
    .run();
}

export async function listByBudget(db: D1Database, budgetId: string) {
  const { results } = await db
    .prepare(
      `SELECT a.*, p.method, p.kind, p.provider, p.paid_at, p.concept FROM payment_applications a
       JOIN payments p ON p.id = a.payment_id WHERE a.budget_id = ? ORDER BY a.created_at`,
    )
    .bind(budgetId)
    .all();
  return results;
}

export async function listByPayment(db: D1Database, paymentId: string) {
  const { results } = await db
    .prepare(
      `SELECT a.*, b.number AS budget_number, b.patient_ref AS budget_patient FROM payment_applications a
       JOIN budgets b ON b.id = a.budget_id WHERE a.payment_id = ? ORDER BY a.created_at`,
    )
    .bind(paymentId)
    .all();
  return results;
}
