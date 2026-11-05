import { describe, expect, it } from "vitest";
import { normalizePhone as serverNormalize, formatPhone as serverFormat } from "../worker/src/utils/phone";
import { normalizePhone, formatPhone, whatsappUrl } from "../frontend/src/lib/phone";
import { budgetMessage } from "../frontend/src/lib/whatsapp";

const SAMPLES = ["+54 9 351 555 0123", "0351 15 555-0123", "351 5550123", "(011) 15 5555-1234", "11 5555 1234", "+54 11 5555 1234", "5491155551234", "+54 9 11 5555-1234", "+1 415 555 2671", "00 34 612 345 678", "", "abc", "123", "351 555", "llamar a Ana"];

describe("teléfono: el celular y el servidor calculan lo mismo", () => {
  it.each(SAMPLES)("%j", (raw) => expect(normalizePhone(raw)).toBe(serverNormalize(raw)));
  it("se muestra igual", () => {
    for (const d of ["5493515550123", "5491155551234", "14155552671"]) expect(formatPhone(d)).toBe(serverFormat(d));
  });
});

describe("mensaje de WhatsApp", () => {
  const base = { patient: "Ana Pérez", number: 7, clinic: "ÍntegraOD", totalCents: 4_500_000 };
  it("transferencia con anticipo pedido: dice cuánto y a dónde", () => {
    const bank = { holder: "Ana Pérez", cbu: "", alias: "ana.perez.od" };
    expect(budgetMessage({ ...base, bank, manualAsk: { amountCents: 1_350_000, kind: "advance" } }))
      .toBe("Hola Ana Pérez, te escribo por tu presupuesto N° 0007 de ÍntegraOD, por un total de $ 45.000.\nPara reservar, podés abonar el anticipo de $ 13.500, transfiriendo a:\nTitular: Ana Pérez\nAlias: ana.perez.od");
    expect(budgetMessage({ ...base, manualAsk: { amountCents: 1_350_000 } })).toBe("Hola Ana Pérez, te escribo por tu presupuesto N° 0007 de ÍntegraOD, por un total de $ 45.000.\nPara reservar, podés abonar el anticipo de $ 13.500.");
  });
  it("con transferencia: van los datos bancarios cargados", () => {
    const msg = budgetMessage({ ...base, bank: { holder: "Ana Pérez", cbu: "0000003100012345678901", alias: "ana.perez.od" } });
    expect(msg).toBe("Hola Ana Pérez, te escribo por tu presupuesto N° 0007 de ÍntegraOD, por un total de $ 45.000.\nPodés transferir a:\nTitular: Ana Pérez\nCBU/CVU: 0000003100012345678901\nAlias: ana.perez.od");
    expect(budgetMessage({ ...base, bank: { holder: "", cbu: "", alias: "ana.perez.od" } })).toContain("Podés transferir a:\nAlias: ana.perez.od");
  });
  it("con anticipo: presentación y link para reservar", () => {
    const msg = budgetMessage({ ...base, advance: { amountCents: 1_350_000, link: "https://x.test/pay/abc" } });
    expect(msg).toBe("Hola Ana Pérez, te escribo por tu presupuesto N° 0007 de ÍntegraOD, por un total de $ 45.000:\nPara reservar, podés abonar el anticipo de $ 13.500 acá: https://x.test/pay/abc");
  });
  it("un pago por el total o parcial se pide como pago, no como anticipo", () => {
    const msg = budgetMessage({ ...base, advance: { amountCents: 3_000_000, link: "https://x.test/pay/abc", kind: "final" } });
    expect(msg).toBe("Hola Ana Pérez, te escribo por tu presupuesto N° 0007 de ÍntegraOD, por un total de $ 45.000:\nPara pagar, podés abonar $ 30.000 acá: https://x.test/pay/abc");
  });
  it("sin anticipo: una sola línea", () => {
    expect(budgetMessage(base)).toBe("Hola Ana Pérez, te escribo por tu presupuesto N° 0007 de ÍntegraOD, por un total de $ 45.000.");
  });
  it("abre el chat de la persona, o el selector si no hay teléfono", () => {
    expect(whatsappUrl("5493515550123", "Hola & chau")).toBe("https://wa.me/5493515550123?text=Hola%20%26%20chau");
    expect(whatsappUrl(null, "Hola")).toBe("https://wa.me/?text=Hola");
  });
});

import { phoneError } from "../frontend/src/lib/phone";

describe("mensajes de teléfono", () => {
  it("dice cuántos números faltan o sobran", () => {
    expect(phoneError("+54 261334477")).toMatch(/Faltan números.*escribiste 9/);
    expect(phoneError("261 334 44777")).toMatch(/Sobran números.*escribiste 11/);
    expect(phoneError("261 abc")).toMatch(/solo números/);
  });
  it("un teléfono bueno no da error", () => {
    expect(phoneError("+54 261 334 4477")).toBeNull();
    expect(phoneError("0261 15 334-4477")).toBeNull();
  });
});
