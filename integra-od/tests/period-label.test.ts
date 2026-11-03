import { describe, expect, it } from "vitest";
import { previousLabel } from "../frontend/src/lib/period";
import { today } from "../frontend/src/lib/formatters";

const y = Number(today().slice(0, 4));

describe("cómo se nombra el período anterior", () => {
  it("un mes completo se dice por su nombre", () => {
    expect(previousLabel(`${y}-10-01`, `${y}-10-31`)).toBe("en octubre");
    expect(previousLabel(`${y}-04-01`, `${y}-04-30`)).toBe("en abril");
  });
  it("febrero completo, también en año bisiesto", () => {
    expect(previousLabel("2024-02-01", "2024-02-29")).toBe("en febrero de 2024");
    expect(previousLabel("2023-02-01", "2023-02-28")).toBe("en febrero de 2023");
  });
  it("de otro año agrega el año", () => {
    expect(previousLabel(`${y - 1}-10-01`, `${y - 1}-10-31`)).toBe(`en octubre de ${y - 1}`);
  });
  it("un tramo dentro de un mes", () => {
    expect(previousLabel(`${y}-10-01`, `${y}-10-15`)).toBe("en el período anterior (del 01 al 15 de oct)");
    expect(previousLabel(`${y}-10-02`, `${y}-10-31`)).toBe("en el período anterior (del 02 al 31 de oct)");
  });
  it("un tramo que cruza de mes", () => {
    expect(previousLabel(`${y}-10-25`, `${y}-11-02`)).toBe("en el período anterior (del 25 de oct al 02 de nov)");
  });
});

import { describeRange } from "../frontend/src/lib/period";
describe("las fechas de un período en palabras", () => {
  it("mes completo, tramo y un solo día", () => {
    expect(describeRange("2026-10-01", "2026-10-31")).toBe("octubre de 2026");
    expect(describeRange("2026-11-01", "2026-11-02")).toBe("del 01 al 02 de nov");
    expect(describeRange("2026-10-25", "2026-11-02")).toBe("del 25 de oct al 02 de nov");
    expect(describeRange("2026-11-02", "2026-11-02")).toBe("2 de nov");
  });
});
