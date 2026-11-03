import * as apps from "../repositories/applications.repository";
import * as budgetsRepo from "../repositories/budgets.repository";
import * as paymentsRepo from "../repositories/payments.repository";
import { AppError } from "../utils/errors";
import { newId } from "../utils/ids";
import { nowIso } from "../utils/dates";
import { applicableAmount, budgetBalance, deriveBudgetStatus, paymentAvailable } from "../utils/money";
import { audit } from "./audit.service";
import { insertEvent } from "../repositories/budgets.repository";

/** Mantiene el estado del presupuesto coherente con sus pagos aplicados (la regla vive en utils/money). */
export async function syncBudgetStatus(db: D1Database, budgetId: string) {
  const b = await budgetsRepo.getBudget(db, budgetId);
  if (!b) return;
  const next = deriveBudgetStatus(b.status, b.total_cents, b.applied_cents);
  if (next === b.status) return;
  await budgetsRepo.setBudgetStatus(db, budgetId, next, nowIso());
  // El primer pago real aplicado es la aceptación del cliente (evidencia, no inferencia).
  if ((next === "in_progress" || next === "completed") && b.answer !== "accepted") await insertEvent(db, budgetId, "accepted", "payment", nowIso());
  await audit(db, { action: "budget.status", entity: "budget", entityId: budgetId, detail: { from: b.status, to: next, by: "system" } });
}

export async function applyPayment(db: D1Database, paymentId: string, budgetId: string, amountCents: number) {
  const ok = await apps.insertApplication(db, { id: newId(), paymentId, budgetId, amountCents, createdAt: nowIso() });
  if (!ok) {
    // Diagnóstico solo para dar un mensaje claro; la decisión ya fue atómica.
    const payment = await paymentsRepo.getPayment(db, paymentId);
    const budget = await budgetsRepo.getBudget(db, budgetId);
    if (!payment) throw new AppError(404, "No encontramos ese pago.");
    if (!budget) throw new AppError(404, "No encontramos ese presupuesto.");
    if (payment.provider === "mock") throw new AppError(409, "Ese pago es simulado (piloto): no es dinero y no se aplica a ningún presupuesto.", "simulated_payment");
    if (payment.status !== "approved") throw new AppError(409, "Ese pago está anulado y no se puede aplicar.");
    if (budget.status === "cancelled") throw new AppError(409, "Ese presupuesto está cancelado.");
    if (amountCents > paymentAvailable(payment.amount_cents, payment.applied_cents)) {
      throw new AppError(409, "El importe supera lo que queda disponible en este pago.", "exceeds_available");
    }
    throw new AppError(409, "El importe supera el saldo pendiente del presupuesto.", "exceeds_balance");
  }
  await audit(db, { action: "payment.applied", entity: "payment", entityId: paymentId, detail: { budget_id: budgetId, amount_cents: amountCents } });
  await syncBudgetStatus(db, budgetId);
}

/** Aplica automáticamente lo que corresponda cuando el cobro ya estaba asociado a un presupuesto. */
export async function autoApply(db: D1Database, paymentId: string, budgetId: string) {
  const payment = await paymentsRepo.getPayment(db, paymentId);
  const budget = await budgetsRepo.getBudget(db, budgetId);
  if (!payment || !budget || budget.status === "cancelled" || payment.provider === "mock") return;
  const amount = applicableAmount(
    paymentAvailable(payment.amount_cents, payment.applied_cents),
    budgetBalance(budget.total_cents, budget.applied_cents),
  );
  if (amount > 0) await applyPayment(db, paymentId, budgetId, amount);
}

export async function voidApplication(db: D1Database, id: string, reason: string) {
  const app = await apps.getApplication(db, id);
  if (!app) throw new AppError(404, "No encontramos esa aplicación.");
  if (!(await apps.voidApplication(db, id, reason, nowIso()))) throw new AppError(409, "Esa aplicación ya estaba anulada.");
  await audit(db, { action: "application.voided", entity: "payment", entityId: app.payment_id, detail: { budget_id: app.budget_id, amount_cents: app.amount_cents, reason } });
  await syncBudgetStatus(db, app.budget_id);
}
