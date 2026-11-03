import { describe, expect, it } from "vitest";
import { describePayment } from "../worker/src/utils/money";
import { createTestDb } from "./helpers/d1";
import * as budgets from "../worker/src/services/budgets.service";

const budget = (over = {}) => ({ applied_cents: 0, balance_cents: 3_000_000, has_advance: false, first_item: "Blanqueamiento", item_count: 1, ...over });

describe("el concepto del cobro nombra el tratamiento", () => {
  it("un anticipo dice de qué es", () => {
    expect(describePayment(1_000_000, budget())).toEqual({ kind: "advance", concept: "Anticipo · Blanqueamiento" });
  });
  it("con varios conceptos lo aclara", () => {
    expect(describePayment(1_000_000, budget({ item_count: 3 })).concept).toBe("Anticipo · Blanqueamiento y 2 más");
  });
  it("pago total, parcial y final siguen sus reglas y también nombran el tratamiento", () => {
    expect(describePayment(3_000_000, budget()).concept).toBe("Pago total · Blanqueamiento");
    expect(describePayment(1_000_000, budget({ has_advance: true })).concept).toBe("Pago parcial · Blanqueamiento");
    expect(describePayment(2_000_000, budget({ applied_cents: 1_000_000, balance_cents: 2_000_000, has_advance: true })).concept).toBe("Pago final · Blanqueamiento");
  });
  it("sin tratamiento (dato viejo o vacío) queda el texto de siempre, sin un punto suelto", () => {
    expect(describePayment(1_000_000, budget({ first_item: null })).concept).toBe("Anticipo");
    expect(describePayment(1_000_000, budget({ first_item: "  " })).concept).toBe("Anticipo");
  });
  it("un nombre larguísimo se recorta para no romper el límite del concepto", () => {
    const { concept } = describePayment(1_000_000, budget({ first_item: "x".repeat(300) }));
    expect(concept.length).toBeLessThanOrEqual(80);
  });
});

describe("la lista de presupuestos informa su primer concepto y cuántos tiene", () => {
  it("first_item e item_count salen del presupuesto", async () => {
    const db = createTestDb("worker");
    const b = await budgets.createBudget(db, { patient_ref: "Ana", issued_on: "2026-11-02", valid_until: null, notes: "", items: [
      { description: "Blanqueamiento", quantity: 1, unit_price_cents: 100, discount_pct: 0 },
      { description: "Limpieza", quantity: 1, unit_price_cents: 100, discount_pct: 0 },
    ] });
    const row = (await budgets.listBudgets(db)).find((x) => x.id === b.id)!;
    expect(row).toMatchObject({ first_item: "Blanqueamiento", item_count: 2 });
    expect(await budgets.getBudgetDetail(db, b.id)).toMatchObject({ first_item: "Blanqueamiento", item_count: 2 });
  });
});
