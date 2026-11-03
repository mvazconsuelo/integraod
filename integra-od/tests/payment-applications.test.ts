import { beforeEach, describe, expect, it } from "vitest";
import { makeStack } from "./helpers/stack";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import { manualPaymentSchema, paymentRequestSchema } from "../worker/src/schemas";
import * as paymentsRepo from "../worker/src/repositories/payments.repository";
import * as apps from "../worker/src/services/payment-applications.service";

let stack: ReturnType<typeof makeStack>;
let db: D1Database;
beforeEach(() => { stack = makeStack(); db = stack.core.DB; });

const newBudget = async (total = 15_000_000) => {
  const b = await budgets.createBudget(db, {
    patient_ref: "Ana", issued_on: "2026-11-02", valid_until: null, notes: "",
    items: [{ description: "Tratamiento", quantity: 1, unit_price_cents: total, discount_pct: 0 }],
  });
  return b.id;
};
const pay = (amount: number, budget_id: string, kind: "advance" | "partial" | "final" = "partial") =>
  payments.registerManualPayment(stack.core, { patient_ref: "Ana", concept: "Pago", amount_cents: amount, method: "transfer", kind, budget_id, request_id: null, notes: "" });

/** Dinero recibido sin presupuesto (solo puede existir como sobrante o dato previo): se inserta directo. */
const unassigned = async (amount: number) => {
  const id = crypto.randomUUID();
  await paymentsRepo.upsertPayment(db, { id, intent_id: null, reference: "sin-presupuesto", provider: "manual", provider_payment_id: null, method: "transfer", source: "manual", kind: "partial", amount_cents: amount, currency: "ARS", status: "approved", paid_at: new Date().toISOString(), payer_label: "Ana", concept: "Pago", notes: "", created_at: new Date().toISOString(), voided_at: null, void_reason: null, version: 1 });
  return { id };
};

describe("aplicación de pagos", () => {
  it("cobrar sin elegir presupuesto no está permitido", () => {
    expect(manualPaymentSchema.safeParse({ patient_ref: "Ana", concept: "x", amount_cents: 100, method: "cash" }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ patient_ref: "Ana", concept: "x", amount_cents: 100 }).success).toBe(false);
  });

  it("el dinero sin presupuesto (sobrante) queda pendiente de imputación", async () => {
    const p = await unassigned(3_000_000);
    const [row] = await payments.listReceived(db);
    expect(row.id).toBe(p.id);
    expect(row.available_cents).toBe(3_000_000);
    expect(row.applied_cents).toBe(0);
  });

  it("flujo del ejemplo: anticipo + segundo pago + pago final = saldo 0 y presupuesto completado", async () => {
    const id = await newBudget();
    await pay(3_000_000, id, "advance");
    await pay(5_000_000, id);
    expect((await budgets.getBudgetDetail(db, id)).balance_cents).toBe(7_000_000);
    expect((await budgets.getBudgetDetail(db, id)).status).toBe("in_progress");
    await pay(7_000_000, id, "final");
    const d = await budgets.getBudgetDetail(db, id);
    expect(d.balance_cents).toBe(0);
    expect(d.status).toBe("completed");
  });

  it("aplicación manual parcial y no se puede superar lo disponible", async () => {
    const id = await newBudget();
    const p = await unassigned(3_000_000);
    await apps.applyPayment(db, p.id, id, 1_000_000);
    await apps.applyPayment(db, p.id, id, 2_000_000);
    await expect(apps.applyPayment(db, p.id, id, 1)).rejects.toThrow(/disponible/);
  });

  it("no se puede aplicar dos veces el mismo pago aunque lleguen pedidos simultáneos", async () => {
    const id = await newBudget();
    const p = await unassigned(3_000_000);
    const results = await Promise.allSettled([apps.applyPayment(db, p.id, id, 3_000_000), apps.applyPayment(db, p.id, id, 3_000_000)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await budgets.getBudgetDetail(db, id)).applied_cents).toBe(3_000_000);
  });

  it("un pago manual no puede superar el saldo del presupuesto", async () => {
    const id = await newBudget(1_000_000);
    await expect(pay(1_500_000, id)).rejects.toThrow(/supera lo que falta cobrar/);
    expect(await payments.listReceived(db)).toHaveLength(0);
    await pay(1_000_000, id);
    expect((await budgets.getBudgetDetail(db, id)).balance_cents).toBe(0);
    await expect(pay(10, id)).rejects.toThrow(/ya está pagado por completo/);
    const p = await unassigned(10);
    await expect(apps.applyPayment(db, p.id, id, 10)).rejects.toThrow(/saldo/);
  });

  it("anular una aplicación devuelve el dinero a disponible y reabre el saldo", async () => {
    const id = await newBudget(1_000_000);
    await pay(1_000_000, id);
    const [app] = (await budgets.getBudgetDetail(db, id)).applications as { id: string }[];
    await apps.voidApplication(db, app.id, "Error de imputación");
    const d = await budgets.getBudgetDetail(db, id);
    expect(d.balance_cents).toBe(1_000_000);
    expect(d.status).toBe("sent");
    expect((await payments.listReceived(db))[0].available_cents).toBe(1_000_000);
    await expect(apps.voidApplication(db, app.id, "otra vez")).rejects.toThrow(/ya estaba anulada/);
  });

  it("anular un pago manual conserva el historial y libera el presupuesto", async () => {
    const id = await newBudget(1_000_000);
    const p = (await pay(1_000_000, id))!;
    await payments.voidPayment(stack.core, p.id, "Cargado por error");
    expect((await budgets.getBudgetDetail(db, id)).balance_cents).toBe(1_000_000);
    const [row] = await payments.listReceived(db);
    expect(row.status).toBe("voided");
    expect(row.void_reason).toBe("Cargado por error");
    expect(row.available_cents).toBe(0);
  });

  it("un pago activa el presupuesto aunque todavía no esté marcado como aceptado", async () => {
    const b = await budgets.createBudget(db, { patient_ref: "Ana", issued_on: "2026-11-02", valid_until: null, notes: "", items: [{ description: "T", quantity: 1, unit_price_cents: 1_000_000, discount_pct: 0 }] });
    expect(b.status).toBe("sent");
    await pay(300_000, b.id, "advance");
    expect((await budgets.getBudgetDetail(db, b.id)).status).toBe("in_progress");
  });

  it("no se aplica a presupuestos cancelados", async () => {
    const b = await budgets.createBudget(db, { patient_ref: "x", issued_on: "2026-11-02", valid_until: null, notes: "", items: [{ description: "a", quantity: 1, unit_price_cents: 100, discount_pct: 0 }] });
    await budgets.changeStatus(db, b.id, "cancelled");
    const p = await unassigned(100);
    await expect(apps.applyPayment(db, p.id, b.id, 100)).rejects.toThrow(/cancelado/);
    await expect(pay(100, b.id)).rejects.toThrow(/cancelado/);
  });
});
