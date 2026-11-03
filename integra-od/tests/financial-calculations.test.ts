import { describe, expect, it } from "vitest";
import { applicableAmount, budgetBalance, budgetTotal, displayStatus, itemTotal, paymentAvailable, pesosToCents, requestStatusFor } from "../worker/src/utils/money";
import { monthRange, previousRange, todayLocal } from "../worker/src/utils/dates";

describe("cálculos financieros", () => {
  it("calcula el total de un concepto con descuento", () => {
    expect(itemTotal({ quantity: 2, unit_price_cents: 5_000_000, discount_pct: 10 })).toBe(9_000_000);
  });
  it("suma varios conceptos", () => {
    expect(budgetTotal([
      { quantity: 1, unit_price_cents: 10_000_000, discount_pct: 0 },
      { quantity: 3, unit_price_cents: 1_666_667, discount_pct: 0 },
    ])).toBe(15_000_001);
  });
  it("saldo = total - aplicado (ejemplo $150.000)", () => {
    const total = 15_000_000;
    expect(budgetBalance(total, 3_000_000)).toBe(12_000_000);
    expect(budgetBalance(total, 3_000_000 + 5_000_000 + 7_000_000)).toBe(0);
  });
  it("disponible y monto aplicable respetan ambos límites", () => {
    expect(paymentAvailable(3_000_000, 1_000_000)).toBe(2_000_000);
    expect(applicableAmount(2_000_000, 500_000)).toBe(500_000);
    expect(applicableAmount(2_000_000, 0)).toBe(0);
  });
  it("estado del cobro según lo realmente pagado", () => {
    expect(requestStatusFor(100, 0)).toBe("pending");
    expect(requestStatusFor(100, 40)).toBe("partially_paid");
    expect(requestStatusFor(100, 100)).toBe("paid");
  });
  it("vencido se deriva de la fecha y no afecta cobros pagados", () => {
    expect(displayStatus("pending", "2026-01-01", "2026-01-02")).toBe("expired");
    expect(displayStatus("pending", "2026-01-02", "2026-01-02")).toBe("pending");
    expect(displayStatus("paid", "2026-01-01", "2026-02-01")).toBe("paid");
  });
  it("convierte pesos a centavos sin errores de coma flotante", () => {
    expect(pesosToCents(30000)).toBe(3_000_000);
    expect(pesosToCents(0.1 + 0.2)).toBe(30);
    expect(pesosToCents(19.99)).toBe(1999);
  });
  it("período anterior: meses completos hacia atrás, o igual cantidad de días", () => {
    expect(previousRange("2026-11-01", "2026-11-30")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(previousRange("2026-01-01", "2026-01-31")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previousRange("2026-09-01", "2026-11-30")).toEqual({ from: "2026-06-01", to: "2026-08-31" });
    expect(previousRange("2026-11-10", "2026-11-19")).toEqual({ from: "2026-10-31", to: "2026-11-09" });
  });
  it("rango del mes y fecha local de Argentina", () => {
    expect(monthRange("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(todayLocal(new Date("2026-03-01T01:00:00Z"))).toBe("2026-02-28");
  });
});

import { describePayment } from "../worker/src/utils/money";

describe("tipo de pago deducido (lo decide el backend)", () => {
  const b = (applied: number, balance: number, has_advance = false) => ({ applied_cents: applied, balance_cents: balance, has_advance, first_item: null, item_count: 1 });
  it("primer pago que no cubre todo es anticipo", () => expect(describePayment(3_000_000, b(0, 15_000_000)).kind).toBe("advance"));
  it("si el anticipo ya se pidió, el siguiente es un pago parcial aunque aún no haya pagos aplicados", () => expect(describePayment(2_000_000, b(0, 15_000_000, true)).kind).toBe("partial"));
  it("pagos siguientes son parciales", () => expect(describePayment(5_000_000, b(3_000_000, 12_000_000)).kind).toBe("partial"));
  it("el que cubre todo el saldo es el pago final", () => expect(describePayment(7_000_000, b(8_000_000, 7_000_000)).kind).toBe("final"));
  it("cobrar todo el presupuesto de una vez se llama Pago total; el resto de los casos usa el tipo", () => {
    expect(describePayment(15_000_000, b(0, 15_000_000))).toEqual({ kind: "final", concept: "Pago total" });
    expect(describePayment(3_000_000, b(0, 15_000_000))).toEqual({ kind: "advance", concept: "Anticipo" });
    expect(describePayment(12_000_000, b(3_000_000, 12_000_000))).toEqual({ kind: "final", concept: "Pago final" });
  });
});
