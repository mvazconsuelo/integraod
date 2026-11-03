import { beforeEach, describe, expect, it } from "vitest";
import { makeStack } from "./helpers/stack";
import { budgetSchema } from "../worker/src/schemas";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";

let stack: ReturnType<typeof makeStack>;
let db: D1Database;
beforeEach(() => { stack = makeStack(); db = stack.core.DB; });

const input = (qty = 1, price = 15_000_000) => ({
  patient_ref: "M. Pérez", issued_on: "2026-11-02", valid_until: null, notes: "",
  items: [{ description: "Implante", quantity: qty, unit_price_cents: price, discount_pct: 0 }],
});

describe("los presupuestos no se eliminan, se cancelan", () => {
  it("no existe forma de eliminar uno: el pedido se rechaza y el presupuesto sigue ahí", async () => {
    const b = await budgets.createBudget(db, input());
    const res = await stack.api("DELETE", `/api/budgets/${b.id}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await budgets.listBudgets(db)).toHaveLength(1);
    expect((await budgets.getBudgetDetail(db, b.id)).id).toBe(b.id);
  });
  it("cancelar conserva el presupuesto en el historial y cierra sus links de pago sin pagar", async () => {
    const b = await budgets.createBudget(db, input());
    const req = await payments.createRequest(stack.core, { patient_ref: "M. Pérez", concept: "Anticipo", amount_cents: 1_000_000, kind: "advance", budget_id: b.id, conditions: "", due_date: null });
    await budgets.changeStatus(db, b.id, "cancelled", { cancelLinks: (id) => payments.cancelOpenRequestsOfBudget(stack.core, id) });
    const detail = await budgets.getBudgetDetail(db, b.id);
    expect(detail.status).toBe("cancelled");
    expect(await budgets.listBudgets(db)).toHaveLength(1); // sigue en el historial
    expect((await payments.publicView(db, req.public_id)).checkout_url).toBeNull();
    // y el link queda cerrado en el servicio de pagos: no puede quedar un link vivo de un presupuesto cancelado
    expect((await stack.pay.db.prepare("SELECT status FROM intents WHERE id = ?").bind(req.id).first<{ status: string }>())!.status).toBe("cancelled");
  });
  it("con pagos no se puede cancelar hasta anular las aplicaciones (se conserva todo el dinero registrado)", async () => {
    const b = await budgets.createBudget(db, input());
    await payments.registerManualPayment(stack.core, { patient_ref: "M. Pérez", concept: "Seña", amount_cents: 100, method: "cash", kind: "advance", budget_id: b.id, request_id: null, notes: "" });
    await expect(budgets.changeStatus(db, b.id, "cancelled")).rejects.toThrow(/aplicados/);
    expect(await budgets.listBudgets(db)).toHaveLength(1);
  });
});

describe("estados del presupuesto", () => {
  it("un presupuesto nuevo nace Enviado (ya no hay borradores) y no tiene paso manual de aceptación", async () => {
    const b = await budgets.createBudget(db, input());
    expect(b.status).toBe("sent");
    await expect(budgets.changeStatus(db, b.id, "accepted" as never)).rejects.toThrow();
  });
  it("permite reabrir uno cancelado como Enviado", async () => {
    const b = await budgets.createBudget(db, input());
    expect((await budgets.changeStatus(db, b.id, "cancelled")).status).toBe("cancelled");
    expect((await budgets.changeStatus(db, b.id, "sent")).status).toBe("sent");
  });
  it("rechaza saltos sin sentido, como pasar de Cancelado a En curso", async () => {
    const b = await budgets.createBudget(db, input());
    await budgets.changeStatus(db, b.id, "cancelled");
    await expect(budgets.changeStatus(db, b.id, "in_progress")).rejects.toThrow(/cambia solo/);
  });
  it("repetir el estado actual no hace nada", async () => {
    const b = await budgets.createBudget(db, input());
    expect((await budgets.changeStatus(db, b.id, "sent")).status).toBe("sent");
  });
});

describe("presupuestos", () => {
  it("crea con total automático y numeración consecutiva", async () => {
    const a = await budgets.createBudget(db, input());
    const b = await budgets.createBudget(db, input(2, 1_000_000));
    expect(a.total_cents).toBe(15_000_000);
    expect(a.balance_cents).toBe(15_000_000);
    expect(b.total_cents).toBe(2_000_000);
    expect([a.number, b.number]).toEqual([1, 2]);
  });
  it("valida entradas con mensajes en lenguaje cotidiano", () => {
    const r = budgetSchema.safeParse({ ...input(), items: [] });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe("Agregá al menos un concepto.");
    expect(budgetSchema.safeParse({ ...input(), items: [{ description: "x", quantity: 0, unit_price_cents: 1, discount_pct: 0 }] }).success).toBe(false);
  });
  it("no permite bajar el total por debajo de lo ya aplicado", async () => {
    const b = await budgets.createBudget(db, input());
    await payments.registerManualPayment(stack.core, { patient_ref: "M. Pérez", concept: "Seña", amount_cents: 5_000_000, method: "cash", kind: "advance", budget_id: b.id, request_id: null, notes: "" });
    await expect(budgets.updateBudget(db, b.id, input(1, 1_000_000))).rejects.toThrow(/por debajo/);
  });
  it("no permite cancelar con pagos aplicados ni completar con saldo", async () => {
    const b = await budgets.createBudget(db, input());
    await expect(budgets.changeStatus(db, b.id, "completed")).rejects.toThrow(/cambia solo/);
    await expect(budgets.changeStatus(db, b.id, "in_progress")).rejects.toThrow(/cambia solo/);
    await payments.registerManualPayment(stack.core, { patient_ref: "x", concept: "Seña", amount_cents: 100, method: "cash", kind: "advance", budget_id: b.id, request_id: null, notes: "" });
    await expect(budgets.changeStatus(db, b.id, "cancelled")).rejects.toThrow(/aplicados/);
  });
});
