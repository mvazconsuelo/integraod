import { beforeEach, describe, expect, it } from "vitest";
import { makeStack, type Stack } from "./helpers/stack";

// Medio de cobro elegido (Mercado Pago, transferencia o efectivo) y datos bancarios para transferir.
let s: Stack;
beforeEach(() => { s = makeStack(); });

const newBudget = async () => {
  const res = await s.api("POST", "/api/budgets", { patient_ref: "Ana Pérez", issued_on: "2026-11-03", valid_until: null, notes: "", items: [{ description: "Servicio", quantity: 1, unit_price_cents: 1_000_000, discount_pct: 0 }] });
  return ((await res.json()) as { id: string }).id;
};
const budget = async (id: string) => (await (await s.api("GET", `/api/budgets/${id}`)).json()) as { collect_method: string | null };
const profile = async () => {
  const { logo_url: _l, payments_online: _a, mp_connected: _b, mp_mock: _c, ...rest } = (await (await s.api("GET", "/api/settings")).json()) as Record<string, unknown>;
  return rest;
};

describe("medio de cobro del presupuesto", () => {
  it("empieza sin elegir, se elige y se puede cambiar o quitar", async () => {
    const id = await newBudget();
    expect((await budget(id)).collect_method).toBeNull();
    for (const method of ["transfer", "cash", "mercadopago", null]) {
      expect((await s.api("POST", `/api/budgets/${id}/collect-method`, { method })).status).toBe(200);
      expect((await budget(id)).collect_method).toBe(method);
    }
  });
  it("rechaza un medio desconocido", async () => {
    const id = await newBudget();
    expect((await s.api("POST", `/api/budgets/${id}/collect-method`, { method: "cheque" })).status).toBe(400);
  });
  it("elegirlo no mueve el dinero", async () => {
    const id = await newBudget();
    await s.api("POST", `/api/budgets/${id}/collect-method`, { method: "transfer" });
    const b = (await (await s.api("GET", `/api/budgets/${id}`)).json()) as { applied_cents: number; balance_cents: number };
    expect([b.applied_cents, b.balance_cents]).toEqual([0, 1_000_000]);
  });
  it("un presupuesto cancelado no cambia de medio", async () => {
    const id = await newBudget();
    await s.api("POST", `/api/budgets/${id}/status`, { status: "cancelled" });
    expect((await s.api("POST", `/api/budgets/${id}/collect-method`, { method: "cash" })).status).toBe(409);
  });
});

describe("datos para transferir", () => {
  it("se guardan; el CBU queda sin espacios ni guiones", async () => {
    const res = await s.api("PUT", "/api/settings", { ...(await profile()), bank_holder: "Ana Pérez", bank_cbu: "0000 0031-0001 2345 6789 01", bank_alias: "ana.perez.od" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bank_holder: "Ana Pérez", bank_cbu: "0000003100012345678901", bank_alias: "ana.perez.od" });
  });
  it("un CBU o un alias inválido se rechaza con un mensaje claro", async () => {
    const bad = await s.api("PUT", "/api/settings", { ...(await profile()), bank_cbu: "123" });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).toContain("22 números");
    expect((await s.api("PUT", "/api/settings", { ...(await profile()), bank_alias: "a b" })).status).toBe(400);
  });
  it("se pueden vaciar, y guardar sin mandarlos conserva los que había", async () => {
    await s.api("PUT", "/api/settings", { ...(await profile()), bank_cbu: "0000003100012345678901", bank_alias: "ana.perez.od" });
    const { bank_holder: _h, bank_cbu: _c, bank_alias: _a, ...withoutBank } = (await profile()) as Record<string, unknown>;
    await s.api("PUT", "/api/settings", { ...withoutBank, name: "Otro" });
    expect(await profile()).toMatchObject({ name: "Otro", bank_cbu: "0000003100012345678901", bank_alias: "ana.perez.od" });
    await s.api("PUT", "/api/settings", { ...(await profile()), bank_cbu: "", bank_alias: "" });
    expect(await profile()).toMatchObject({ bank_cbu: "", bank_alias: "" });
  });
});
