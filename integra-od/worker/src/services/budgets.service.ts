import * as repo from "../repositories/budgets.repository";
import * as apps from "../repositories/applications.repository";
import { listRequestsOfBudget } from "./payments.service";
import { AppError } from "../utils/errors";
import { newId } from "../utils/ids";
import { nowIso } from "../utils/dates";
import { BUDGET_STATUS_NAME, deriveSituation, MANUAL_TRANSITIONS, budgetBalance, budgetTotal, itemTotal, paidPercent, requestableCents } from "../utils/money";
import { audit, auditOf } from "./audit.service";
import { syncBudgetStatus } from "./payment-applications.service";
import { formatArs } from "../utils/money";
import type { BudgetRow, BudgetStatus } from "../repositories/budgets.repository";
import { resolvePatientForBudget } from "./patients.service";

interface BudgetInput {
  patient_ref: string;
  patient_id?: string | null;
  issued_on: string;
  valid_until: string | null;
  notes: string;
  items: { description: string; quantity: number; unit_price_cents: number; discount_pct: number }[];
}

const withBalance = (b: BudgetRow) => ({
  ...b,
  has_advance: Boolean(b.has_advance),
  balance_cents: budgetBalance(b.total_cents, b.applied_cents),
  paid_percent: paidPercent(b.total_cents, b.applied_cents),
  situation: deriveSituation(b),
});

export async function listBudgets(db: D1Database) {
  return (await repo.listBudgets(db)).map(withBalance);
}

export async function getBudgetDetail(db: D1Database, id: string) {
  const budget = await repo.getBudget(db, id);
  if (!budget) throw new AppError(404, "No encontramos ese presupuesto.");
  const items = (await repo.getItems(db, id)).map((it) => ({ ...it, total_cents: itemTotal(it) }));
  const requests = await listRequestsOfBudget(db, id);
  const detail = withBalance(budget);
  return {
    ...detail,
    items,
    applications: await apps.listByBudget(db, id),
    requests,
    timeline: await buildTimeline(db, id, detail.created_at, requests),
    /** Lo que todavía se puede pedir: saldo menos lo ya pedido y sin pagar. */
    requestable_cents: budget.status === "cancelled" ? 0 : requestableCents(detail.balance_cents, requests),
  };
}

export async function createBudget(db: D1Database, input: BudgetInput) {
  const id = newId();
  const patient = await resolvePatientForBudget(db, input);
  const total = budgetTotal(input.items);
  await repo.createBudget(db, { ...input, patient_ref: patient.name, patient_id: patient.id, id, total_cents: total, now: nowIso() });
  await audit(db, { action: "budget.created", entity: "budget", entityId: id, detail: { total_cents: total } });
  return getBudgetDetail(db, id);
}

export async function updateBudget(db: D1Database, id: string, input: BudgetInput) {
  const current = await repo.getBudget(db, id);
  if (!current) throw new AppError(404, "No encontramos ese presupuesto.");
  const total = budgetTotal(input.items);
  if (total < current.applied_cents) {
    throw new AppError(409, "El nuevo total quedaría por debajo de lo que ya se aplicó a este presupuesto.");
  }
  // Si el cliente no cambia, sigue el que tenía (aunque todavía no tenga teléfono: eso se pide al compartir por WhatsApp).
  const unchanged = (!input.patient_id || input.patient_id === current.patient_id) && input.patient_ref.trim() === current.patient_ref.trim();
  const patient = unchanged && current.patient_id ? { id: current.patient_id, name: current.patient_ref } : await resolvePatientForBudget(db, input);
  await repo.replaceBudget(db, { ...input, patient_ref: patient.name, patient_id: patient.id, id, total_cents: total, now: nowIso() });
  await audit(db, { action: "budget.updated", entity: "budget", entityId: id, detail: { total_before_cents: current.total_cents, total_after_cents: total } });
  await syncBudgetStatus(db, id); // un total nuevo puede completar el presupuesto o reabrirlo
  return getBudgetDetail(db, id);
}

/** Acciones que dependen del servicio de pagos (cerrar links de pago); las inyecta quien llama. */
export interface BudgetHooks { cancelLinks?: (budgetId: string) => Promise<void> }

export async function changeStatus(db: D1Database, id: string, status: BudgetStatus, hooks: BudgetHooks = {}) {
  const b = await repo.getBudget(db, id);
  if (!b) throw new AppError(404, "No encontramos ese presupuesto.");
  if (status === b.status) return getBudgetDetail(db, id);
  if (!MANUAL_TRANSITIONS[b.status].includes(status)) {
    throw new AppError(409, status === "in_progress" || status === "completed"
      ? "Ese estado cambia solo: pasa a En curso con el primer pago y a Completado cuando el saldo llega a cero."
      : `No se puede pasar de ${BUDGET_STATUS_NAME[b.status]} a ${BUDGET_STATUS_NAME[status]}.`, "invalid_transition");
  }
  if (status === "cancelled" && b.applied_cents > 0) {
    // No se cancela con dinero aplicado: se muestran los pagos y qué hay que resolver. Nada se desasocia solo.
    const paid = (await apps.listByBudget(db, id) as { id: string; payment_id: string; amount_cents: number; method: string; paid_at: string; voided_at: string | null }[]).filter((a) => !a.voided_at);
    throw new AppError(409, `Este presupuesto tiene ${formatArs(b.applied_cents)} en pagos aplicados. Para cancelarlo, primero anulá o devolvé esos pagos desde el detalle: el historial se conserva.`, "has_payments", { applied_cents: b.applied_cents, payments: paid.map((a) => ({ application_id: a.id, payment_id: a.payment_id, amount_cents: a.amount_cents, method: a.method, paid_at: a.paid_at })) });
  }
  if (status === "completed" && budgetBalance(b.total_cents, b.applied_cents) > 0) {
    throw new AppError(409, "Todavía queda saldo por cobrar en este presupuesto.");
  }
  await repo.setBudgetStatus(db, id, status, nowIso());
  await audit(db, { action: "budget.status", entity: "budget", entityId: id, detail: { from: b.status, to: status, by: "admin" } });
  if (status === "cancelled") await hooks.cancelLinks?.(id);
  return getBudgetDetail(db, id);
}

export interface TimelineEvent {
  at: string;
  /** budget | request | payment | note: para el ícono y el orden en pantalla. */
  type: "budget" | "request" | "payment" | "adjustment";
  title: string;
  detail?: string;
  amount_cents?: number;
}

const METHOD_NAME: Record<string, string> = { mercadopago: "Mercado Pago", cash: "Efectivo", transfer: "Transferencia", mock: "Simulado (piloto)" };

/**
 * Todos los movimientos de un presupuesto, del más nuevo al más viejo: lo que se pidió, lo que se pagó
 * y lo que se anuló. Nada se oculta cuando se pide un cobro nuevo.
 */
async function buildTimeline(db: D1Database, id: string, createdAt: string, requests: Awaited<ReturnType<typeof listRequestsOfBudget>>): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  for (const a of await auditOf(db, "budget", id)) {
    const d = JSON.parse(a.detail || "{}") as Record<string, unknown>;
    if (a.action === "budget.created") events.push({ at: a.at, type: "budget", title: "Presupuesto creado", amount_cents: Number(d.total_cents ?? 0) });
    else if (a.action === "budget.updated") events.push({ at: a.at, type: "budget", title: "Presupuesto editado", detail: d.total_before_cents !== d.total_after_cents ? `Total: ${formatArs(Number(d.total_before_cents))} → ${formatArs(Number(d.total_after_cents))}` : undefined });
    else if (a.action === "budget.status") events.push({ at: a.at, type: "budget", title: `Pasó a ${BUDGET_STATUS_NAME[d.to as keyof typeof BUDGET_STATUS_NAME] ?? String(d.to)}`, detail: d.by === "system" ? "Cambió solo según los pagos" : undefined });
  }
  if (!events.some((e) => e.title === "Presupuesto creado")) events.push({ at: createdAt, type: "budget", title: "Presupuesto creado" }); // anteriores a la bitácora
  for (const r of requests) {
    const method = r.provider === "cash" ? "en efectivo" : "con link de pago";
    events.push({ at: r.created_at, type: "request", title: `Cobro pedido ${method}`, detail: r.concept, amount_cents: r.amount_cents });
    if (r.status === "cancelled") events.push({ at: r.cancelled_at ?? r.created_at, type: "request", title: "Cobro cancelado", detail: r.concept, amount_cents: r.amount_cents });
  }
  for (const a of (await apps.listByBudget(db, id)) as { amount_cents: number; method: string; provider: string; kind: string; paid_at: string; created_at: string; voided_at: string | null; void_reason: string | null; concept: string }[]) {
    events.push({ at: a.paid_at, type: "payment", title: `Pago recibido · ${a.provider === "mock" ? METHOD_NAME.mock : METHOD_NAME[a.method] ?? a.method}`, detail: a.concept, amount_cents: a.amount_cents });
    if (a.voided_at) events.push({ at: a.voided_at, type: "adjustment", title: "Pago anulado", detail: a.void_reason ?? undefined, amount_cents: a.amount_cents });
  }
  return events.sort((x, y) => y.at.localeCompare(x.at));
}

/** La persona usó "Compartir". Se guarda el hecho (y el canal), no que el cliente lo haya recibido. */
export async function recordShared(db: D1Database, id: string, channel: string) {
  const b = await repo.getBudget(db, id);
  if (!b) throw new AppError(404, "No encontramos ese presupuesto.");
  await repo.insertEvent(db, id, "shared", channel, nowIso());
  await audit(db, { action: "budget.shared", entity: "budget", entityId: id, detail: { channel } });
  return { ok: true };
}

/** Respuesta expresa del cliente. Cancelar no es rechazar: esto se registra aparte y a propósito. */
export async function recordAnswer(db: D1Database, id: string, answer: "accepted" | "declined") {
  const b = await repo.getBudget(db, id);
  if (!b) throw new AppError(404, "No encontramos ese presupuesto.");
  if (b.answer === answer) return { ok: true };
  await repo.insertEvent(db, id, answer, "manual", nowIso());
  await audit(db, { action: `budget.${answer}`, entity: "budget", entityId: id, detail: {} });
  return { ok: true };
}
