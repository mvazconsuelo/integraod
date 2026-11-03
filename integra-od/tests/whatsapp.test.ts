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
  const base = { patient: "Ana Pérez", number: 7, clinic: "ÍntegraOD" };
  it("con anticipo: presentación y link para reservar", () => {
    const msg = budgetMessage({ ...base, advance: { amountCents: 1_350_000, link: "https://x.test/pay/abc" } });
    expect(msg).toBe("Hola Ana Pérez, te paso tu presupuesto N° 0007 de ÍntegraOD:\nPara reservar, podés abonar el anticipo de $ 13.500 acá: https://x.test/pay/abc");
  });
  it("un pago por el total o parcial se pide como pago, no como anticipo", () => {
    const msg = budgetMessage({ ...base, advance: { amountCents: 3_000_000, link: "https://x.test/pay/abc", kind: "final" } });
    expect(msg).toBe("Hola Ana Pérez, te paso tu presupuesto N° 0007 de ÍntegraOD:\nPara pagar, podés abonar $ 30.000 acá: https://x.test/pay/abc");
  });
  it("sin anticipo: una sola línea", () => {
    expect(budgetMessage(base)).toBe("Hola Ana Pérez, te paso tu presupuesto N° 0007 de ÍntegraOD.");
  });
  it("abre el chat de la persona, o el selector si no hay teléfono", () => {
    expect(whatsappUrl("5493515550123", "Hola & chau")).toBe("https://wa.me/5493515550123?text=Hola%20%26%20chau");
    expect(whatsappUrl(null, "Hola")).toBe("https://wa.me/?text=Hola");
  });
});
