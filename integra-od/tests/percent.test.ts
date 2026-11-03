import { describe, expect, it } from "vitest";
import { percentOfCents } from "../frontend/src/lib/percent";

describe("porcentaje de un presupuesto", () => {
  it("30 % de $ 300.000 son $ 90.000", () => {
    expect(percentOfCents(30_000_000, 30)).toBe(9_000_000);
    expect(percentOfCents(30_000_000, 20)).toBe(6_000_000);
    expect(percentOfCents(30_000_000, 50)).toBe(15_000_000);
  });
  it("se redondea a pesos enteros", () => {
    expect(percentOfCents(10_000_033, 30)).toBe(3_000_000); // $ 100.000,33 al 30 % -> $ 30.000
    expect(percentOfCents(1_000_050, 33)).toBe(330_000); // $ 10.000,50 al 33 % = $ 3.300,16 -> $ 3.300
  });
  it("100 % es el total y 0 % es cero", () => {
    expect(percentOfCents(4_500_000, 100)).toBe(4_500_000);
    expect(percentOfCents(4_500_000, 0)).toBe(0);
  });
});
