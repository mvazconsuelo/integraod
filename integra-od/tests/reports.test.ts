import { beforeEach, describe, expect, it } from "vitest";
import { makeStack } from "./helpers/stack";
import { csvMoney, toCsv } from "../worker/src/utils/csv";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import { budgetsCsv, paymentsCsv } from "../worker/src/services/reports.service";

let stack: ReturnType<typeof makeStack>;
let db: D1Database;
beforeEach(() => { stack = makeStack(); db = stack.core.DB; });

const lines = (csv: string) => csv.replace("\uFEFF", "").trim().split("\r\n");

describe("CSV para Excel", () => {
  it("usa ; como separador, coma decimal y BOM para las tildes", () => {
    const csv = toCsv([["Cliente", "Importe"], ["Pérez, Ana", csvMoney(150050)]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(lines(csv)).toEqual(["Cliente;Importe", "Pérez, Ana;1500,50"]);
  });
  it("escapa comillas, saltos de línea y separadores dentro del texto", () => {
    expect(lines(toCsv([['dijo "hola"; adiós', "línea 1\nlínea 2"]]))[0]).toBe('"dijo ""hola""; adiós";"línea 1\nlínea 2"');
  });
  it("neutraliza fórmulas escritas por una persona", () => {
    expect(lines(toCsv([["=HYPERLINK(\"http://x\")"]]))[0]).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(lines(toCsv([["@cmd", "+1"]]))[0]).toBe("'@cmd;'+1");
  });
});

describe("reportes del período", () => {
  const setup = async () => {
    const b = await budgets.createBudget(db, { patient_ref: "Ana Pérez", issued_on: "2026-11-05", valid_until: null, notes: "", items: [{ description: "T", quantity: 1, unit_price_cents: 10_000_000, discount_pct: 0 }] });
    await payments.registerManualPayment(stack.core, { patient_ref: "Ana Pérez", concept: "Anticipo", amount_cents: 3_000_000, method: "cash", kind: "advance", budget_id: b.id, request_id: null, paid_on: "2026-11-06", notes: "" });
    await payments.registerManualPayment(stack.core, { patient_ref: "Ana Pérez", concept: "Pago parcial", amount_cents: 1_000_000, method: "cash", kind: "partial", budget_id: b.id, request_id: null, paid_on: "2026-12-10", notes: "" });
    return b;
  };

  it("cobros: solo los del rango, con el presupuesto y el total", async () => {
    await setup();
    const rows = lines(await paymentsCsv(db, "2026-11-01", "2026-11-30"));
    expect(rows[0]).toBe("Fecha;Cliente;Concepto;Medio;Importe;Comisión;Te quedó;Estado;Origen;Presupuesto N°;Sin usar");
    expect(rows[1]).toBe("2026-11-06;Ana Pérez;Anticipo · T;Efectivo;30000,00;0,00;30000,00;Cobrado;Carga manual;0001;0,00"); // efectivo: sin comisión, te quedó todo
    expect(rows).toHaveLength(3);
    expect(rows[2]).toContain("TOTAL COBRADO;;30000,00;0,00;30000,00");
  });
  it("cobros: con billetera muestra la comisión y lo que quedó; si no se sabe, queda vacío y no suma", async () => {
    await setup();
    const ins = (id: string, fee: number | null, net: number | null) => db.prepare(
      "INSERT INTO payments (id, patient_ref, concept, method, source, provider, kind, amount_cents, currency, status, paid_at, notes, created_at, version, fee_cents, net_cents) VALUES (?, 'Beto', 'Anticipo', 'mercadopago', 'provider', 'mercadopago', 'advance', 2000000, 'ARS', 'approved', '2026-11-07T15:00:00.000Z', '', '2026-11-07T15:00:00.000Z', 1, ?, ?)",
    ).bind(id, fee, net).run();
    await ins("p-fee", 125_800, 1_874_200);
    await ins("p-unknown", null, null);
    const rows = lines(await paymentsCsv(db, "2026-11-01", "2026-11-30"));
    expect(rows.find((r) => r.includes("Beto") && r.includes("1258,00"))).toContain("20000,00;1258,00;18742,00;Cobrado");
    expect(rows.find((r) => r.includes("Beto") && !r.includes("1258,00"))).toContain("20000,00;;;Cobrado"); // la billetera todavía no informó la comisión
    expect(rows[rows.length - 1]).toBe(";;TOTAL COBRADO;;70000,00;1258,00;48742,00;;;;"); // 30.000 en mano + 18.742 de la billetera; el desconocido no suma al neto
  });
  it("cobros: los pagos anulados se muestran como anulados y no suman", async () => {
    await setup();
    const [first] = await payments.listReceived(db);
    await payments.voidPayment(stack.core, first.id, "error");
    const rows = lines(await paymentsCsv(db, "2026-11-01", "2026-12-31"));
    expect(rows.some((r) => r.includes("Anulado"))).toBe(true);
    expect(rows[rows.length - 1]).toContain("TOTAL COBRADO;;");
  });
  it("presupuestos: los emitidos en el período, con lo pagado y lo que falta", async () => {
    await setup();
    const rows = lines(await budgetsCsv(db, "2026-11-01", "2026-11-30"));
    expect(rows[1]).toBe("0001;Ana Pérez;2026-11-05;;En curso;100000,00;40000,00;60000,00");
    expect(lines(await budgetsCsv(db, "2026-10-01", "2026-10-31"))).toHaveLength(1);
  });
});

describe("rutas de reportes (HTTP)", () => {
  const call = async (path: string, token = "clave") => {
    const { app } = await import("../worker/src/app");
    return app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, { DB: db, ADMIN_TOKEN: "clave" } as never);
  };

  it("pide la clave de acceso", async () => {
    expect((await call("/api/reports/cobros?from=2026-11-01&to=2026-11-30", "")).status).toBe(401);
  });
  it("devuelve un archivo CSV descargable con nombre claro", async () => {
    const res = await call("/api/reports/cobros?from=2026-11-01&to=2026-11-30");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cobros_2026-11-01_a_2026-11-30.csv"');
    expect((await res.text()).replace("﻿", "")).toContain("Fecha;Cliente;Concepto");
  });
  it("las tres rutas responden y un rango inválido da un error claro, no un 500", async () => {
    for (const name of ["cobros", "presupuestos"]) expect((await call(`/api/reports/${name}?from=2026-11-01&to=2026-11-30`)).status).toBe(200);
    const bad = await call("/api/reports/cobros?from=hoy&to=mañana");
    expect(bad.status).toBe(400);
    expect((await bad.json() as { error: string }).error).toMatch(/Fecha inválida/);
  });
});
