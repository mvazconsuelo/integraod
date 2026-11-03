import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeStack, type Stack } from "./helpers/stack";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import * as apps from "../worker/src/services/payment-applications.service";
import * as paymentsRepo from "../worker/src/repositories/payments.repository";
import { getSummary } from "../worker/src/services/dashboard.service";
import { DEFAULT_TIME_ZONE, setTimeZone, todayLocal } from "../worker/src/utils/dates";

// Fases 1 a 3 del pedido: dinero real vs. simulado, respuestas expresas, situaciones del Inicio y ciclo de vida de los pagos.
// Importes en centavos: $100.000 = 10_000_000.
const PESOS = (n: number) => n * 100;

let s: Stack;
let db: D1Database;
beforeEach(() => { s = makeStack(); db = s.core.DB; });
afterEach(() => setTimeZone(DEFAULT_TIME_ZONE));

const newBudget = async (total = PESOS(100_000), issued_on = todayLocal()) =>
  (await budgets.createBudget(db, { patient_ref: "Ana Pérez", issued_on, valid_until: null, notes: "", items: [{ description: "Tratamiento", quantity: 1, unit_price_cents: total, discount_pct: 0 }] })).id;
const ask = (budgetId: string, amount: number, method: "online" | "cash" = "online") =>
  payments.createRequest(s.core, { method, patient_ref: "Ana Pérez", amount_cents: amount, budget_id: budgetId, conditions: "", due_date: null });
const cashPay = (budgetId: string | null, amount: number, extra: Record<string, unknown> = {}) =>
  payments.registerManualPayment(s.core, { patient_ref: "Ana Pérez", amount_cents: amount, method: "cash", budget_id: budgetId, request_id: null, notes: "", ...extra });
const mockPay = async (budgetId: string, amount: number, outcome: "approved" | "rejected" | "pending" = "approved") => {
  const r = await ask(budgetId, amount);
  await payments.simulateCheckout(s.core, r.public_id, outcome);
  return r;
};
// Dinero recibido que todavía no está asociado a ningún presupuesto.
const loosePayment = async (amount: number) => {
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await paymentsRepo.upsertPayment(db, { id, intent_id: null, reference: "sin-presupuesto", provider: "manual", provider_payment_id: null, method: "transfer", source: "manual", kind: "partial", amount_cents: amount, currency: "ARS", status: "approved", paid_at: now, payer_label: "Ana", concept: "Pago", notes: "", created_at: now, voided_at: null, void_reason: null, version: 1 });
  return id;
};
const detail = (id: string) => budgets.getBudgetDetail(db, id);
const summary = () => getSummary(db, "2020-01-01", "2099-12-31");
const situationOf = async (id: string) => (await budgets.listBudgets(db)).find((b) => b.id === id)!.situation;

describe("Fase 1 · dinero real y dinero simulado", () => {
  it("un pago simulado aprobado no suma a Recibido ni baja el saldo ni cambia el estado; se informa aparte", async () => {
    const b = await newBudget();
    await mockPay(b, PESOS(30_000));
    const d = await detail(b);
    expect(d).toMatchObject({ applied_cents: 0, balance_cents: PESOS(100_000), status: "sent", paid_percent: 0 });
    const sum = await summary();
    expect(sum).toMatchObject({ collected_cents: 0, payments_count: 0, advances_collected_cents: 0, advances_received_count: 0, budgets_balance_cents: 0, money_unapplied_cents: 0, open_jobs_count: 0 });
    expect(sum.simulated).toEqual({ payments_count: 1, total_cents: PESOS(30_000) });
    expect(sum.jobs_concreted.count).toBe(0);
  });

  it("un pago simulado nunca se puede aplicar a un presupuesto", async () => {
    const b = await newBudget();
    await mockPay(b, PESOS(30_000));
    const p = (await payments.listReceived(db)).find((x) => x.provider === "mock")!;
    await expect(apps.applyPayment(db, p.id, b, PESOS(30_000))).rejects.toMatchObject({ code: "simulated_payment" });
  });

  it("presupuesto con pagos reales y simulados: el saldo solo descuenta lo real", async () => {
    const b = await newBudget();
    await cashPay(b, PESOS(30_000));
    await mockPay(b, PESOS(20_000));
    expect(await detail(b)).toMatchObject({ applied_cents: PESOS(30_000), balance_cents: PESOS(70_000), status: "in_progress" });
    const sum = await summary();
    expect(sum).toMatchObject({ collected_cents: PESOS(30_000), budgets_balance_cents: PESOS(70_000), payments_count: 1 });
    expect(sum.simulated.total_cents).toBe(PESOS(20_000));
  });

  it("un pago simulado ya aplicado en datos viejos tampoco reduce el saldo real", async () => {
    const b = await newBudget();
    await mockPay(b, PESOS(30_000));
    const p = (await payments.listReceived(db)).find((x) => x.provider === "mock")!;
    // Dato histórico (antes de esta regla): se inserta a mano, sin pasar por el servicio.
    await db.prepare("INSERT INTO payment_applications (id, payment_id, budget_id, amount_cents, created_at) VALUES ('legacy', ?, ?, ?, '2026-11-01T00:00:00Z')").bind(p.id, b, PESOS(30_000)).run();
    expect((await detail(b)).balance_cents).toBe(PESOS(100_000));
  });

  it("pendiente y rechazado no son dinero; solicitar un link tampoco", async () => {
    const b = await newBudget();
    await ask(b, PESOS(80_000)); // solicitud de $80.000
    expect(await summary()).toMatchObject({ collected_cents: 0 });
    expect((await detail(b)).balance_cents).toBe(PESOS(100_000));
    await mockPay(b, PESOS(10_000), "rejected");
    await mockPay(b, PESOS(10_000), "pending");
    expect(await payments.listReceived(db)).toHaveLength(0);
  });

  it("un pago real anulado libera su aplicación y deja de contar como recibido", async () => {
    const b = await newBudget();
    const p = (await cashPay(b, PESOS(30_000)))!;
    expect((await summary()).collected_cents).toBe(PESOS(30_000));
    await payments.voidPayment(s.core, p.id, "Error de carga");
    expect(await summary()).toMatchObject({ collected_cents: 0, budgets_balance_cents: 0 });
    expect(await detail(b)).toMatchObject({ applied_cents: 0, status: "sent" });
  });
});

describe("Fase 1 · respuestas del cliente y tasa de aceptación", () => {
  const rate = async () => (await summary()).acceptance;

  it("creado y nunca compartido: no está compartido ni cuenta en la tasa", async () => {
    await newBudget();
    expect(await rate()).toEqual({ emitted: 1, shared: 0, accepted: 0, declined: 0, waiting: 1, rate_pct: null });
  });
  it("compartido sin respuesta: queda esperando y no hay tasa", async () => {
    const b = await newBudget();
    await budgets.recordShared(db, b, "whatsapp");
    expect(await rate()).toEqual({ emitted: 1, shared: 1, accepted: 0, declined: 0, waiting: 1, rate_pct: null });
  });
  it("aceptado y rechazado de forma expresa", async () => {
    const yes = await newBudget(); const no = await newBudget();
    await budgets.recordAnswer(db, yes, "accepted");
    await budgets.recordAnswer(db, no, "declined");
    expect(await rate()).toMatchObject({ accepted: 1, declined: 1, waiting: 0, rate_pct: 50 });
  });
  it("cancelar no es rechazar: un cancelado sin respuesta no entra en la tasa", async () => {
    const b = await newBudget();
    await budgets.changeStatus(db, b, "cancelled");
    expect(await rate()).toMatchObject({ declined: 0, waiting: 0, rate_pct: null });
  });
  it("el primer pago real es la aceptación; un pago simulado no", async () => {
    const real = await newBudget(); const sim = await newBudget();
    await cashPay(real, PESOS(1_000));
    await mockPay(sim, PESOS(1_000));
    expect(await rate()).toMatchObject({ accepted: 1, declined: 0, rate_pct: 100 });
  });
  it("los eventos no se editan ni se borran", async () => {
    const b = await newBudget();
    await budgets.recordShared(db, b, "whatsapp");
    await expect(db.prepare("DELETE FROM budget_events").run()).rejects.toThrow(/no se borran/);
    await expect(db.prepare("UPDATE budget_events SET type = 'declined'").run()).rejects.toThrow(/no se modifican/);
  });
});

describe("Fase 1 · cambio de mes y zona horaria", () => {
  it("un pago del último día del mes cuenta en ese mes y el del día siguiente en el otro", async () => {
    const b = await newBudget();
    await cashPay(b, PESOS(10_000), { paid_on: "2026-11-30" });
    await cashPay(b, PESOS(20_000), { paid_on: "2026-12-01" });
    expect((await getSummary(db, "2026-11-01", "2026-11-30")).collected_cents).toBe(PESOS(10_000));
    expect((await getSummary(db, "2026-12-01", "2026-12-31")).collected_cents).toBe(PESOS(20_000));
    const months = (await getSummary(db, "2026-11-01", "2026-12-31")).monthly;
    expect(months.find((m) => m.month === "2026-11")?.total_cents).toBe(PESOS(10_000));
  });
});

describe("Fase 2 · situación comercial: cada presupuesto está en un solo grupo", () => {
  it("creado sin compartir, compartido, rechazado y aceptado", async () => {
    const created = await newBudget(); const shared = await newBudget(); const declined = await newBudget(); const accepted = await newBudget();
    await budgets.recordShared(db, shared, "whatsapp");
    await budgets.recordShared(db, declined, "whatsapp"); await budgets.recordAnswer(db, declined, "declined");
    await budgets.recordAnswer(db, accepted, "accepted");
    expect(await situationOf(created)).toBe("not_shared");
    expect(await situationOf(shared)).toBe("to_answer");
    expect(await situationOf(declined)).toBe("declined");
    expect(await situationOf(accepted)).toBe("awaiting_payment");
  });
  it("descargar o crear no cuenta como compartir; solo el evento de compartir", async () => {
    const b = await newBudget();
    expect((await budgets.getBudgetDetail(db, b)).shared_at).toBeNull();
    await budgets.recordShared(db, b, "whatsapp");
    expect((await budgets.getBudgetDetail(db, b)).shared_at).not.toBeNull();
  });
  it("con un pedido de pago vigente espera pago; con varios pedidos sigue siendo uno solo", async () => {
    const b = await newBudget();
    await budgets.recordShared(db, b, "whatsapp");
    await ask(b, PESOS(10_000));
    await ask(b, PESOS(20_000));
    expect(await situationOf(b)).toBe("awaiting_payment");
    expect((await budgets.listBudgets(db)).filter((x) => x.id === b)).toHaveLength(1);
  });
  it("con el pedido vencido necesita atención", async () => {
    const b = await newBudget();
    const r = await ask(b, PESOS(10_000));
    await db.prepare("UPDATE payment_requests SET due_date = '2020-01-01' WHERE id = ?").bind(r.id).run();
    expect(await situationOf(b)).toBe("attention");
  });
  it("anticipo recibido y pago parcial: en curso; saldo cero: completado; cancelado: cancelado", async () => {
    const inProgress = await newBudget(); const done = await newBudget(PESOS(10_000)); const cancelled = await newBudget();
    await cashPay(inProgress, PESOS(30_000));
    expect(await situationOf(inProgress)).toBe("in_progress");
    await cashPay(inProgress, PESOS(10_000));
    expect(await situationOf(inProgress)).toBe("in_progress");
    await cashPay(done, PESOS(10_000));
    expect(await situationOf(done)).toBe("completed");
    await budgets.changeStatus(db, cancelled, "cancelled");
    expect(await situationOf(cancelled)).toBe("cancelled");
  });
  it("un pago simulado no pasa el presupuesto a en curso", async () => {
    const b = await newBudget();
    await budgets.recordShared(db, b, "whatsapp");
    await mockPay(b, PESOS(30_000));
    expect(await situationOf(b)).toBe("to_answer");
  });
  it("un pedido abierto tiene prioridad sobre en curso (no se cuenta dos veces)", async () => {
    const b = await newBudget();
    await cashPay(b, PESOS(30_000));
    await ask(b, PESOS(20_000));
    expect(await situationOf(b)).toBe("awaiting_payment");
  });
});

describe("Fase 3 · ciclo de vida del dinero", () => {
  it("matriz: pedir $100.000 → recibido $0; pago $30.000 → saldo $70.000; final $70.000 → saldo $0", async () => {
    const b = await newBudget();
    await ask(b, PESOS(100_000));
    expect((await summary()).collected_cents).toBe(0);
    expect((await detail(b)).balance_cents).toBe(PESOS(100_000));
    await payments.cancelOpenRequestsOfBudget(s.core, b);
    await cashPay(b, PESOS(30_000));
    expect(await summary()).toMatchObject({ collected_cents: PESOS(30_000) });
    expect((await detail(b)).balance_cents).toBe(PESOS(70_000));
    await cashPay(b, PESOS(70_000));
    expect(await detail(b)).toMatchObject({ balance_cents: 0, status: "completed" });
  });
  it("no se puede pagar por encima del saldo ni pedir más de lo disponible", async () => {
    const b = await newBudget();
    await expect(cashPay(b, PESOS(100_001))).rejects.toBeTruthy();
    await ask(b, PESOS(80_000));
    await expect(ask(b, PESOS(30_000))).rejects.toBeTruthy();
  });
  it("dos solicitudes simultáneas no superan el saldo", async () => {
    const b = await newBudget();
    const out = await Promise.allSettled([ask(b, PESOS(100_000)), ask(b, PESOS(100_000))]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  });
  it("dos aplicaciones simultáneas del mismo pago no sobreaplican dinero", async () => {
    const a = await newBudget(PESOS(60_000)); const c = await newBudget(PESOS(60_000));
    const pid = await loosePayment(PESOS(100_000)); // sin asignar
    const out = await Promise.allSettled([apps.applyPayment(db, pid, a, PESOS(60_000)), apps.applyPayment(db, pid, c, PESOS(60_000))]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const applied = (await detail(a)).applied_cents + (await detail(c)).applied_cents;
    expect(applied).toBeLessThanOrEqual(PESOS(100_000));
  });
  it("un pago repartido en dos presupuestos actualiza cada saldo; anular cada aplicación libera el saldo y conserva el historial", async () => {
    const a = await newBudget(PESOS(60_000)); const c = await newBudget(PESOS(60_000));
    const pid = await loosePayment(PESOS(100_000));
    expect((await summary()).money_unapplied_cents).toBe(PESOS(100_000));
    await apps.applyPayment(db, pid, a, PESOS(60_000));
    await apps.applyPayment(db, pid, c, PESOS(40_000));
    expect(await detail(a)).toMatchObject({ balance_cents: 0, status: "completed" });
    expect(await detail(c)).toMatchObject({ balance_cents: PESOS(20_000), status: "in_progress" });
    expect((await summary()).money_unapplied_cents).toBe(0); // el mismo dinero no está sin asignar y aplicado a la vez
    const rows = (await db.prepare("SELECT id FROM payment_applications").all<{ id: string }>()).results;
    for (const r of rows) await apps.voidApplication(db, r.id, "Error de asignación");
    expect(await detail(a)).toMatchObject({ balance_cents: PESOS(60_000), status: "sent" });
    expect(await detail(c)).toMatchObject({ balance_cents: PESOS(60_000), status: "sent" });
    expect((await summary()).money_unapplied_cents).toBe(PESOS(100_000)); // vuelve a estar disponible, una sola vez
    const kept = (await db.prepare("SELECT voided_at, void_reason FROM payment_applications").all<any>()).results;
    expect(kept).toHaveLength(2); // nada se borra
    expect(kept.every((r) => r.voided_at && r.void_reason)).toBe(true);
  });
  it("el tipo de pago lo decide el servidor, no el cliente", async () => {
    const b = await newBudget();
    const p = (await cashPay(b, PESOS(10_000), { kind: "final" }))!; // el cliente dice "final": se ignora
    expect(p.kind).toBe("advance");
  });
});
