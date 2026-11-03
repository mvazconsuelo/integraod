import { beforeEach, describe, expect, it } from "vitest";
import { makeStack } from "./helpers/stack";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import { getPatientDetail, listPatients } from "../worker/src/services/patients.service";

let stack: ReturnType<typeof makeStack>;
let db: D1Database;
beforeEach(() => { stack = makeStack(); db = stack.core.DB; });

const budget = async (patient: string, total: number) => {
  const b = await budgets.createBudget(db, { patient_ref: patient, issued_on: "2026-11-02", valid_until: null, notes: "", items: [{ description: "T", quantity: 1, unit_price_cents: total, discount_pct: 0 }] });
  return b.id;
};
const pay = (patient: string, budgetId: string, amount: number) =>
  payments.registerManualPayment(stack.core, { patient_ref: patient, concept: "Pago", amount_cents: amount, method: "cash", kind: "advance", budget_id: budgetId, request_id: null, notes: "" });

describe("ficha de cliente", () => {
  it("reúne presupuestos y pagos de un mismo cliente sin distinguir mayúsculas ni espacios", async () => {
    const a = await budget("Ana Pérez", 10_000_000);
    const b = await budget("  ana pérez ", 5_000_000);
    await pay("Ana Pérez", a, 3_000_000);
    await budget("Luis", 1_000_000);

    const d = await getPatientDetail(db, "ana pérez");
    expect(d.budgets).toHaveLength(2);
    expect(d.payments).toHaveLength(1);
    expect(d.totals).toMatchObject({ budgeted_cents: 15_000_000, applied_cents: 3_000_000, balance_cents: 12_000_000, received_cents: 3_000_000 });
    expect(b).toBeTruthy();
  });

  it("el listado resume por cliente y no mezcla a otros", async () => {
    const a = await budget("Ana", 10_000_000);
    await pay("Ana", a, 4_000_000);
    await budget("Luis", 2_000_000);
    const list = await listPatients(db);
    expect(list.map((p) => p.name).sort()).toEqual(["Ana", "Luis"]);
    const ana = list.find((p) => p.name === "Ana")!;
    expect(ana).toMatchObject({ budgets_count: 1, budgeted_cents: 10_000_000, applied_cents: 4_000_000, balance_cents: 6_000_000 });
  });

  it("los presupuestos cancelados no suman y un cliente inexistente da error claro", async () => {
    const id = await budget("Ana", 1_000_000);
    await budgets.changeStatus(db, id, "cancelled");
    expect((await getPatientDetail(db, "Ana")).totals.budgeted_cents).toBe(0);
    await expect(getPatientDetail(db, "Nadie")).rejects.toThrow(/No encontramos/);
    await expect(getPatientDetail(db, "  ")).rejects.toThrow(/No encontramos/);
  });
});
