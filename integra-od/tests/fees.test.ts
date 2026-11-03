import { describe, expect, it } from "vitest";
import { feeLine } from "../frontend/src/lib/fees";
import { MP_FEE_REFERENCE } from "../frontend/src/config/wallet-fees";

describe("comisiones: textos", () => {
  it("la frase de un pago dice comisión y lo que te llega, o nada si no se sabe", () => {
    expect(feeLine({ fee_cents: 125_800, net_cents: 1_874_200 })).toMatch(/Comisión \$\s?1\.258 · te llegan \$\s?18\.742/);
    expect(feeLine({ fee_cents: null, net_cents: null })).toBeNull();
  });
  it("la referencia de Mercado Pago baja a medida que se espera más para recibir el dinero", () => {
    const n = MP_FEE_REFERENCE.terms.map((t) => Number(t.percent.replace(",", ".").replace(" %", "")));
    expect(n).toEqual([...n].sort((a, b) => b - a));
    expect(MP_FEE_REFERENCE.source).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\//);
  });
});
