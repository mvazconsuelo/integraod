import type { Env } from "../types/env";
import * as repo from "../repositories/payments.repository";
import * as budgetsRepo from "../repositories/budgets.repository";
import * as apps from "../repositories/applications.repository";
import { getSettings } from "../repositories/settings.repository";
import { PaymentsClient } from "../integrations/payments/client";
import type { IntentSnapshot, PaymentEvent, PaymentSnapshot } from "../integrations/payments/types";
import { isSafeCheckoutUrl } from "../config/checkout-hosts";
import { autoApply, syncBudgetStatus } from "./payment-applications.service";
import { AppError } from "../utils/errors";
import { localNoon, todayLocal } from "../utils/dates";
import { newId } from "../utils/ids";
import { release as releaseReservation, reserve } from "../repositories/reservations.repository";
import { audit } from "./audit.service";
import { budgetBalance, describePayment, displayStatus, formatArs, paymentAvailable, requestableCents } from "../utils/money";

/**
 * Esta app NO mueve dinero: valida las reglas del presupuesto (límites, anticipo único…) y le pide el movimiento
 * al servicio de pagos, que es la fuente de verdad. Lo que ese servicio informa se guarda como copia de lectura.
 */
const client = (env: Env) => new PaymentsClient(env);

const withDerived = (r: repo.RequestRow, today = todayLocal()) => ({
  ...r,
  display_status: displayStatus(r.status, r.due_date, today),
  pending_cents: Math.max(0, r.amount_cents - r.paid_cents),
});

/** Todo cobro nace de un presupuesto: es lo que mantiene el saldo y el historial consistentes. */
async function requireOpenBudget(db: D1Database, budgetId: string) {
  const budget = await budgetsRepo.getBudget(db, budgetId);
  if (!budget) throw new AppError(404, "No encontramos el presupuesto elegido.");
  if (budget.status === "cancelled") throw new AppError(409, "Ese presupuesto está cancelado.");
  return budget;
}

// ------------------------------------------------------------------------------------------------ copia de lectura

/** Libera lo aplicado a presupuestos cuando un pago se anula o se reembolsa. */
async function releaseApplications(db: D1Database, paymentId: string, reason: string) {
  const affected = ((await apps.listByPayment(db, paymentId)) as { budget_id: string; voided_at: string | null }[]).filter((a) => !a.voided_at);
  await apps.voidApplicationsOfPayment(db, paymentId, reason, new Date().toISOString());
  for (const budgetId of new Set(affected.map((a) => a.budget_id))) await syncBudgetStatus(db, budgetId);
}

/**
 * Incorpora lo que informa el servicio de pagos. Es idempotente y solo avanza (por versión), así que da igual
 * si llega por la respuesta de una operación, por un aviso, repetido o fuera de orden.
 */
export async function applyRemote(env: Env, snap: { intent?: IntentSnapshot | null; payment?: PaymentSnapshot | null }) {
  const db = env.DB;
  if (snap.intent && (await budgetsRepo.getBudget(db, snap.intent.reference))) await repo.upsertIntent(db, snap.intent);

  const p = snap.payment;
  if (!p) return;
  if (p.intent_id && !(await repo.getRequest(db, p.intent_id))) return; // el cobro ya no existe acá (presupuesto eliminado)
  const before = await repo.getPayment(db, p.id);
  await repo.upsertPayment(db, p);

  if (p.status === "approved" && !before && (await budgetsRepo.getBudget(db, p.reference))) await autoApply(db, p.id, p.reference);
  if (p.status !== "approved" && before?.status === "approved") await releaseApplications(db, p.id, p.void_reason ?? "Pago anulado");
}

/** Aviso del servicio de pagos: se consulta el estado actual y se incorpora (no se confía en el contenido del aviso). */
export async function handlePaymentEvent(env: Env, ev: PaymentEvent) {
  if (ev.entity === "payment") return applyRemote(env, await client(env).getPayment(ev.entityId));
  const { intent, payments } = await client(env).getIntent(ev.entityId);
  await applyRemote(env, { intent });
  for (const payment of payments) await applyRemote(env, { intent, payment });
}

// ------------------------------------------------------------------------------------------------ consultas

export async function listRequests(db: D1Database) {
  return (await repo.listRequests(db)).map((r) => withDerived(r));
}

export async function listRequestsOfBudget(db: D1Database, budgetId: string) {
  return (await repo.listRequestsByBudget(db, budgetId)).map((r) => withDerived(r));
}

export async function getRequestDetail(db: D1Database, id: string) {
  const r = await repo.getRequest(db, id);
  if (!r) throw new AppError(404, "No encontramos ese cobro.");
  const payments = await repo.listPaymentsOfRequest(db, id);
  const withApps = await Promise.all(
    payments.map(async (p) => ({ ...p, available_cents: paymentAvailable(p.amount_cents, p.applied_cents), applications: await apps.listByPayment(db, p.id) })),
  );
  return { ...withDerived(r), payments: withApps };
}

export async function listReceived(db: D1Database) {
  return (await repo.listPayments(db)).map((p) => ({ ...p, available_cents: p.status === "approved" ? paymentAvailable(p.amount_cents, p.applied_cents) : 0 }));
}

// ------------------------------------------------------------------------------------------------ operaciones

export async function createRequest(
  env: Env,
  input: { method?: "online" | "cash"; patient_ref: string; amount_cents: number; budget_id: string; conditions: string; due_date: string | null; /** Solo para rechazar un segundo anticipo pedido a propósito; el tipo lo decide el sistema. */ kind?: repo.PaymentKind; concept?: string },
) {
  const budget = await requireOpenBudget(env.DB, input.budget_id);

  // El anticipo se pide una sola vez, y no se puede pedir más de lo que falta cobrar ni pedir dos veces el mismo dinero.
  if (input.kind === "advance" && budget.has_advance) {
    throw new AppError(422, "El anticipo de este presupuesto ya fue pedido. Para cobrar algo más, pedí un pago.", "advance_exists");
  }
  const balance = budgetBalance(budget.total_cents, budget.applied_cents);
  const requestable = requestableCents(balance, await listRequestsOfBudget(env.DB, input.budget_id));
  if (input.amount_cents > requestable) {
    throw new AppError(422, requestable === 0
      ? "Ya pediste todo lo que falta cobrar de este presupuesto."
      : `Lo máximo que podés pedir ahora es ${formatArs(requestable)} (al presupuesto le faltan ${formatArs(balance)}${requestable < balance ? ", y el resto ya lo pediste" : ""}).`, "exceeds_requestable");
  }
  // El tipo y el texto del cobro los decide el sistema, igual para todos.
  const { kind, concept } = describePayment(input.amount_cents, { applied_cents: budget.applied_cents, balance_cents: balance, has_advance: Boolean(budget.has_advance), first_item: budget.first_item, item_count: budget.item_count });

  // Reserva atómica: dos pedidos a la vez no pueden pasarse del saldo ni duplicar el anticipo.
  const reservationId = newId();
  if (!(await reserve(env.DB, { id: reservationId, budgetId: input.budget_id, amountCents: input.amount_cents, kind, today: todayLocal(), now: new Date() }))) {
    throw new AppError(409, "Se está preparando otro cobro de este presupuesto, o ya no queda saldo para pedir. Esperá unos segundos y revisá el detalle.", "request_in_progress");
  }
  try {
    const { intent } = await client(env).createIntent({
      method: input.method ?? "online",
      reference: input.budget_id,
      description: concept,
      payerLabel: input.patient_ref,
      amountCents: input.amount_cents,
      kind,
      dueDate: input.due_date,
    });
    await applyRemote(env, { intent });
    if (input.conditions) await repo.setConditions(env.DB, intent.id, input.conditions);
    await audit(env.DB, { action: "request.created", entity: "request", entityId: intent.id, detail: { budget_id: input.budget_id, amount_cents: input.amount_cents, kind, method: input.method ?? "online" } });
    return getRequestDetail(env.DB, intent.id);
  } finally {
    await releaseReservation(env.DB, reservationId);
  }
}

export async function cancelRequest(env: Env, id: string) {
  if (!(await repo.getRequest(env.DB, id))) throw new AppError(404, "No encontramos ese cobro.");
  const { intent } = await client(env).cancelIntent(id);
  await applyRemote(env, { intent });
  await audit(env.DB, { action: "request.cancelled", entity: "request", entityId: id });
  return getRequestDetail(env.DB, id);
}

/** Al cancelar un presupuesto, sus links de pago sin pagos se cierran: ya no se puede pagar algo cancelado. */
export async function cancelOpenRequestsOfBudget(env: Env, budgetId: string) {
  for (const r of await repo.listRequestsByBudget(env.DB, budgetId)) {
    if (r.status === "pending" && r.paid_cents === 0) await cancelRequest(env, r.id);
  }
}

export async function registerManualPayment(
  env: Env,
  input: { patient_ref: string; amount_cents: number; method: "cash" | "transfer"; budget_id: string; request_id: string | null; paid_on?: string; notes: string; idempotency_key?: string; /** Lo decide el sistema; se acepta por compatibilidad y se ignora. */ concept?: string; kind?: repo.PaymentKind },
) {
  const db = env.DB;
  const request = input.request_id ? await repo.getRequest(db, input.request_id) : null;
  if (input.request_id && !request) throw new AppError(404, "No encontramos el cobro elegido.");
  if (request && request.budget_id !== input.budget_id) throw new AppError(422, "Ese cobro pertenece a otro presupuesto.");
  if (request?.status === "cancelled") throw new AppError(409, "Ese cobro está cancelado.");
  const budget = await requireOpenBudget(db, input.budget_id);
  const balance = budgetBalance(budget.total_cents, budget.applied_cents);
  if (input.amount_cents > balance) {
    throw new AppError(422, balance === 0 ? "Este presupuesto ya está pagado por completo." : `El importe supera lo que falta cobrar del presupuesto (${formatArs(balance)}).`, "exceeds_balance");
  }

  // Si paga un cobro ya pedido, el pago es de ese tipo; si no, el sistema lo deduce igual que para un cobro.
  const { kind, concept } = request
    ? { kind: request.kind, concept: request.concept }
    : describePayment(input.amount_cents, { applied_cents: budget.applied_cents, balance_cents: balance, has_advance: Boolean(budget.has_advance), first_item: budget.first_item, item_count: budget.item_count });

  const { payment, intent } = await client(env).recordManualPayment({
    // La clave evita duplicar el pago si el pedido se repite (doble clic, reintento de red).
    idempotencyKey: input.idempotency_key ?? crypto.randomUUID(),
    intentId: input.request_id,
    reference: input.budget_id,
    payerLabel: input.patient_ref,
    concept,
    amountCents: input.amount_cents,
    method: input.method,
    kind,
    paidAt: input.paid_on ? localNoon(input.paid_on) : undefined,
    notes: input.notes,
  });
  await applyRemote(env, { intent, payment });
  await audit(db, { action: "payment.manual", entity: "payment", entityId: payment.id, detail: { budget_id: input.budget_id, amount_cents: input.amount_cents, method: input.method, kind } });
  return repo.getPayment(db, payment.id);
}

/** Anula un pago manual. Los de un proveedor se anulan desde el proveedor (reembolso) y llegan solos. */
export async function voidPayment(env: Env, id: string, reason: string) {
  if (!(await repo.getPayment(env.DB, id))) throw new AppError(404, "No encontramos ese pago.");
  const { payment, intent } = await client(env).voidPayment(id, reason);
  await applyRemote(env, { intent, payment });
  await audit(env.DB, { action: "payment.voided", entity: "payment", entityId: id, detail: { reason } });
}

// ------------------------------------------------------------------------------------------------ página pública y piloto

export async function publicView(db: D1Database, publicId: string) {
  const r = await repo.getRequestByPublicId(db, publicId);
  if (!r) throw new AppError(404, "Este link de pago no existe o ya no está disponible.");
  const s = await getSettings(db);
  const d = withDerived(r);
  const open = d.display_status === "pending" || d.display_status === "partially_paid";
  return {
    // Datos de cliente del negocio: quien paga tiene que poder saber con quién habla y cómo consultar. Nada del presupuesto.
    clinic: { name: s.name, logo_data_url: s.logo_data_url, primary_color: s.primary_color, phone: s.phone, email: s.email, address: s.address, professional_info: s.professional_info },
    patient_ref: r.patient_ref,
    concept: r.concept,
    amount_cents: r.amount_cents,
    currency: r.currency,
    conditions: r.conditions,
    // Solo el número, como referencia: el presupuesto en sí no se le muestra a quien paga.
    budget_number: r.budget_number,
    // Un cobro en efectivo no tiene link: la página dice que se paga en mano.
    pay_in_cash: r.provider === "cash",
    due_date: r.due_date,
    created_at: r.created_at,
    status: d.display_status,
    // Nunca se ofrece un destino de pago fuera de los permitidos.
    checkout_url: open && isSafeCheckoutUrl(r.checkout_url) ? r.checkout_url : null,
  };
}

/** Checkout simulado (piloto): lo procesa el servicio de pagos por el mismo camino que un aviso real. */
export async function simulateCheckout(env: Env, publicId: string, outcome: "approved" | "rejected" | "pending") {
  const r = await client(env).mockPay(publicId, outcome);
  await applyRemote(env, { intent: r.intent, payment: r.payment });
  return { outcome: r.outcome, result: r.result };
}

// ------------------------------------------------------------------------------------------------ estado del servicio

export async function providersStatus(env: Env) {
  try { return await client(env).providers(); } catch { return null; } // null: servicio no disponible
}
export const reviewQueue = (env: Env) => client(env).review();
export const dismissReview = (env: Env, id: string, reason: string) => client(env).dismissReview(id, reason);
export const connectProvider = (env: Env, id: string) => client(env).connect(id);
export const disconnectProvider = (env: Env, id: string) => client(env).disconnect(id);
