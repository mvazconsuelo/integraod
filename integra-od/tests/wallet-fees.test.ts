import { beforeEach, describe, expect, it } from "vitest";
import { makeStack, type Stack } from "./helpers/stack";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import { getSummary } from "../worker/src/services/dashboard.service";
import { todayLocal } from "../worker/src/utils/dates";

let s: Stack;
beforeEach(() => { s = makeStack(); });

const askAndPay = async (total: number, amount: number, outcome: "approved" | "rejected" = "approved") => {
  const b = await budgets.createBudget(s.core.DB, { patient_ref: "Ana", issued_on: todayLocal(), valid_until: null, notes: "", items: [{ description: "Blanqueamiento", quantity: 1, unit_price_cents: total, discount_pct: 0 }] });
  const r = await payments.createRequest(s.core, { patient_ref: "Ana", concept: "Anticipo", amount_cents: amount, kind: "advance", budget_id: b.id, conditions: "", due_date: null });
  await payments.simulateCheckout(s.core, r.public_id, outcome);
  return r;
};

describe("comisiones de la billetera", () => {
  it("el pago llega a la app con la comisión y lo que quedó; lo simulado no suma en el Resumen", async () => {
    await askAndPay(10_000_000, 2_000_000);
    const [p] = await payments.listReceived(s.core.DB);
    expect(p).toMatchObject({ amount_cents: 2_000_000, fee_cents: 120_000, net_cents: 1_880_000 }); // 6 % simulado
    const sum = await getSummary(s.core.DB, todayLocal(), todayLocal());
    expect(sum.collected_cents).toBe(0);
    expect(sum.fees_cents).toBe(0);
    expect(sum.simulated).toEqual({ payments_count: 1, total_cents: 2_000_000 });
  });

  it("con Mercado Pago real, el Resumen suma el cobro y la comisión", async () => {
    await askAndPay(10_000_000, 2_000_000);
    await s.core.DB.prepare("UPDATE payments SET provider = 'mercadopago'").run(); // el mismo pago, ahora de un proveedor real
    const sum = await getSummary(s.core.DB, todayLocal(), todayLocal());
    expect(sum.collected_cents).toBe(2_000_000);
    expect(sum.fees_cents).toBe(120_000);
    expect(sum.simulated.total_cents).toBe(0);
  });

  it("un pago rechazado no deja comisión", async () => {
    await askAndPay(10_000_000, 2_000_000, "rejected");
    expect(await payments.listReceived(s.core.DB)).toHaveLength(0);
    expect((await getSummary(s.core.DB, todayLocal(), todayLocal())).fees_cents).toBe(0);
  });

  it("el efectivo no suma comisión", async () => {
    const b = await budgets.createBudget(s.core.DB, { patient_ref: "Ana", issued_on: todayLocal(), valid_until: null, notes: "", items: [{ description: "Limpieza", quantity: 1, unit_price_cents: 5_000_000, discount_pct: 0 }] });
    await payments.registerManualPayment(s.core, { patient_ref: "Ana", concept: "Pago", amount_cents: 1_000_000, method: "cash", kind: "partial", budget_id: b.id, request_id: null, notes: "" });
    const [p] = await payments.listReceived(s.core.DB);
    expect(p.fee_cents).toBeNull();
    expect((await getSummary(s.core.DB, todayLocal(), todayLocal())).fees_cents).toBe(0);
  });
});
