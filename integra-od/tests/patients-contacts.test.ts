import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeStack, type Stack } from "./helpers/stack";
import { normalizePhone, formatPhone } from "../worker/src/utils/phone";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import { deletePatient, listPatients } from "../worker/src/services/patients.service";
import { todayLocal } from "../worker/src/utils/dates";

describe("teléfono en formato WhatsApp", () => {
  it.each([
    ["+54 9 351 555 0123", "5493515550123"],
    ["0351 15 555-0123", "5493515550123"],
    ["351 5550123", "5493515550123"],
    ["(011) 15 5555-1234", "5491155551234"],
    ["11 5555 1234", "5491155551234"],
    ["+54 11 5555 1234", "5491155551234"],
    ["5491155551234", "5491155551234"],
    ["+54 9 11 5555-1234", "5491155551234"],
    ["+1 415 555 2671", "14155552671"],
    ["00 34 612 345 678", "34612345678"],
  ])("%s -> %s", (raw, expected) => expect(normalizePhone(raw)).toBe(expected));

  it("lo que no es un teléfono se rechaza", () => {
    for (const bad of ["", "   ", "abc", "123", "351 555", "llamar a Ana"]) expect(normalizePhone(bad)).toBeNull();
  });

  it("se muestra legible", () => {
    expect(formatPhone("5493515550123")).toBe("+54 9 351 555 0123");
    expect(formatPhone("5491155551234")).toBe("+54 9 11 5555 1234");
    expect(formatPhone("14155552671")).toBe("+14155552671");
  });
});

let s: Stack;
beforeEach(() => { s = makeStack(); });
const db = () => s.core.DB;
const post = (body: unknown) => s.api("POST", "/api/patients", body);
const json = async (r: Response) => (await r.json()) as any;
const budgetFor = (patient: { patient_ref: string; patient_id?: string | null }) =>
  budgets.createBudget(db(), { ...patient, issued_on: todayLocal(), valid_until: null, notes: "", items: [{ description: "Limpieza", quantity: 1, unit_price_cents: 3_000_000, discount_pct: 0 }] });

describe("contactos: alta y reglas", () => {
  it("se crea con nombre completo y teléfono (obligatorio), guardado en formato WhatsApp", async () => {
    const res = await post({ name: "  Ana   Pérez ", phone: "0351 15 555-0123" });
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ name: "Ana Pérez", phone: "5493515550123", phone_display: "+54 9 351 555 0123" });
  });

  it("sin teléfono o con un teléfono inválido no se crea", async () => {
    expect((await post({ name: "Ana Pérez" })).status).toBe(400);
    expect((await post({ name: "Ana Pérez", phone: "" })).status).toBe(400);
    const bad = await post({ name: "Ana Pérez", phone: "llamar a Ana" });
    expect(bad.status).toBe(422);
    expect((await json(bad)).code).toBe("bad_phone");
    expect(await json(await s.api("GET", "/api/patients/contacts"))).toEqual([]);
  });

  it("dos contactos no pueden tener el mismo nombre (sin importar mayúsculas)", async () => {
    await post({ name: "Ana Pérez", phone: "351 555 0123" });
    const dup = await post({ name: "ana pérez", phone: "351 555 9999" });
    expect(dup.status).toBe(409);
    expect((await json(dup)).code).toBe("name_exists");
  });

  it("un teléfono repetido avisa, y se puede guardar igual (una familia comparte el número)", async () => {
    await post({ name: "Ana Pérez", phone: "351 555 0123" });
    const warn = await post({ name: "Luis Pérez", phone: "0351 15 555 0123" });
    expect(warn.status).toBe(409);
    const body = await json(warn);
    expect(body.code).toBe("phone_in_use");
    expect(body.error).toContain("Ana Pérez");
    expect((await post({ name: "Luis Pérez", phone: "0351 15 555 0123", allow_duplicate_phone: true })).status).toBe(201);
  });

  it("la lista para el buscador trae nombre y teléfono", async () => {
    await post({ name: "Beto Gómez", phone: "11 5555 1234" });
    await post({ name: "Ana Pérez", phone: "351 555 0123" });
    const list = await json(await s.api("GET", "/api/patients/contacts"));
    expect(list.map((p: any) => p.name)).toEqual(["Ana Pérez", "Beto Gómez"]); // por orden alfabético
    expect(list[1]).toMatchObject({ phone: "5491155551234", phone_display: "+54 9 11 5555 1234" });
  });

  it("se puede cambiar el teléfono", async () => {
    const p = await json(await post({ name: "Ana Pérez", phone: "351 555 0123" }));
    const res = await s.api("PUT", `/api/patients/${p.id}`, { phone: "351 555 0000" });
    expect(await json(res)).toMatchObject({ phone: "5493515550000" });
  });
});

describe("contactos y presupuestos", () => {
  it("un presupuesto con contacto elegido guarda su nombre y trae su teléfono", async () => {
    const p = await json(await post({ name: "Ana Pérez", phone: "351 555 0123" }));
    const b = await budgetFor({ patient_ref: "como lo escribió el formulario", patient_id: p.id });
    expect(b).toMatchObject({ patient_ref: "Ana Pérez", patient_id: p.id, patient_phone: "5493515550123" });
    expect((await budgets.listBudgets(db())).find((x) => x.id === b.id)).toMatchObject({ patient_phone: "5493515550123" });
  });

  it("no se puede armar un presupuesto para un contacto elegido que no tiene teléfono", async () => {
    const legacy = await budgetFor({ patient_ref: "Carla" }); // solo con el nombre: queda sin teléfono
    await expect(budgetFor({ patient_ref: "Carla", patient_id: legacy.patient_id })).rejects.toThrow(/Falta el teléfono de Carla/);
  });

  it("solo con el nombre (como antes) usa al contacto que ya existe o lo crea, y no duplica", async () => {
    const a = await budgetFor({ patient_ref: "Dana Ruiz" });
    const b = await budgetFor({ patient_ref: "  dana ruiz " });
    expect(b.patient_id).toBe(a.patient_id);
    expect((await json(await s.api("GET", "/api/patients/contacts"))).filter((p: any) => p.name === "Dana Ruiz")).toHaveLength(1);
  });

  it("editar un presupuesto sin cambiar al contacto anda aunque todavía no tenga teléfono", async () => {
    const b = await budgetFor({ patient_ref: "Eva Soto" });
    const updated = await budgets.updateBudget(db(), b.id, { patient_ref: "Eva Soto", issued_on: todayLocal(), valid_until: null, notes: "x", items: [{ description: "Control", quantity: 1, unit_price_cents: 1_000_000, discount_pct: 0 }] });
    expect(updated).toMatchObject({ notes: "x", patient_id: b.patient_id, patient_phone: null });
  });

  it("cambiar a otro contacto en un presupuesto exige que tenga teléfono", async () => {
    const b = await budgetFor({ patient_ref: "Eva Soto" });
    const other = await json(await post({ name: "Fabián Luna", phone: "11 5555 0000" }));
    const moved = await budgets.updateBudget(db(), b.id, { patient_ref: "Fabián Luna", patient_id: other.id, issued_on: todayLocal(), valid_until: null, notes: "", items: [{ description: "Control", quantity: 1, unit_price_cents: 1_000_000, discount_pct: 0 }] });
    expect(moved).toMatchObject({ patient_ref: "Fabián Luna", patient_id: other.id });
  });

  it("la lista de Contactos trae el id y el teléfono de cada uno", async () => {
    const p = await json(await post({ name: "Ana Pérez", phone: "351 555 0123" }));
    await budgetFor({ patient_ref: "x", patient_id: p.id });
    const list = await listPatients(db());
    expect(list.find((x) => x.name === "Ana Pérez")).toMatchObject({ id: p.id, phone: "5493515550123", phone_display: "+54 9 351 555 0123" });
  });

  it("cambiar el nombre lo cambia en todos lados: sigue siendo una sola persona", async () => {
    const p = await json(await post({ name: "Ana Perez", phone: "351 555 0123" }));
    const b = await budgetFor({ patient_ref: "Ana Perez", patient_id: p.id });
    await payments.registerManualPayment(s.core, { patient_ref: "Ana Perez", concept: "Seña", amount_cents: 500_000, method: "cash", kind: "advance", budget_id: b.id, request_id: null, notes: "" });
    const res = await s.api("PUT", `/api/patients/${p.id}`, { name: "Ana Pérez" }); // se corrige la tilde
    expect(res.status).toBe(200);
    expect((await budgets.getBudgetDetail(db(), b.id)).patient_ref).toBe("Ana Pérez");
    expect((await payments.listReceived(db()))[0].patient_ref).toBe("Ana Pérez");
    const names = (await listPatients(db())).map((x) => x.name);
    expect(names).toEqual(["Ana Pérez"]); // una sola, no dos
  });

  it("no se puede renombrar a un nombre que ya tiene otro contacto", async () => {
    await post({ name: "Ana Pérez", phone: "351 555 0123" });
    const other = await json(await post({ name: "Beto Gómez", phone: "351 555 0000" }));
    expect((await s.api("PUT", `/api/patients/${other.id}`, { name: "ana pérez" })).status).toBe(409);
  });
});

describe("migración: los contactos que ya existían pasan a la lista", () => {
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  const dir = join(__dirname, "../worker/migrations");

  it("crea un contacto por cada nombre (sin importar mayúsculas), enlaza los presupuestos y no pierde nada", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    const files = readdirSync(dir).sort();
    const run = (f: string) => { sqlite.exec("BEGIN"); sqlite.exec(readFileSync(join(dir, f), "utf8")); sqlite.exec("COMMIT"); };
    for (const f of files.filter((x) => x < "0009")) run(f); // la base como estaba antes

    const now = "2026-11-01T10:00:00.000Z";
    const ins = sqlite.prepare("INSERT INTO budgets (id, number, patient_ref, issued_on, status, notes, total_cents, created_at, updated_at) VALUES (?,?,?,?, 'sent', '', 100, ?, ?)");
    ins.run("b1", 1, "Ana Pérez", "2026-11-01", now, now);
    ins.run("b2", 2, "ana pérez ", "2026-11-02", now, now); // la misma persona, escrita distinto
    ins.run("b3", 3, "Beto Gómez", "2026-11-03", now, now);
    sqlite.prepare("INSERT INTO payments (id, patient_ref, concept, method, source, amount_cents, paid_at, created_at) VALUES ('p1','Carla Díaz','Seña','cash','manual',100,?,?)").run(now, now); // solo aparece en un pago

    run(files.find((x) => x.startsWith("0009"))!);

    const patients = sqlite.prepare("SELECT name, name_key, phone FROM patients ORDER BY name_key").all() as { name: string; name_key: string; phone: string | null }[];
    expect(patients.map((p) => p.name_key)).toEqual(["ana pérez", "beto gómez", "carla díaz"]);
    expect(patients.every((p) => p.phone === null)).toBe(true); // el teléfono se completa después
    const linked = sqlite.prepare("SELECT b.id, p.name_key FROM budgets b JOIN patients p ON p.id = b.patient_id ORDER BY b.number").all() as { id: string; name_key: string }[];
    expect(linked).toEqual([{ id: "b1", name_key: "ana pérez" }, { id: "b2", name_key: "ana pérez" }, { id: "b3", name_key: "beto gómez" }]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM budgets").get()).toEqual({ n: 3 });
    expect(sqlite.prepare("SELECT patient_ref FROM budgets WHERE id = 'b2'").get()).toEqual({ patient_ref: "ana pérez " }); // el texto original no se toca
  });
});

describe("contactos: borrar", () => {
  it("se borra uno que nunca tuvo presupuestos; con historial no", async () => {
    const free = await json(await post({ name: "Sin Historia", phone: "351 555 0101" }));
    expect((await s.api("DELETE", `/api/patients/${free.id}`)).status).toBe(204);
    expect(await json(await s.api("GET", "/api/patients/contacts"))).toEqual([]);

    const used = await json(await post({ name: "Con Historia", phone: "351 555 0102" }));
    await budgetFor({ patient_ref: "Con Historia", patient_id: used.id });
    const res = await s.api("DELETE", `/api/patients/${used.id}`);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("patient_in_use");
    await expect(deletePatient(db(), "no-existe")).rejects.toThrow(/No encontramos/);
  });
});

describe("agenda", () => {
  it("un contacto recién cargado, sin presupuestos, aparece en la lista", async () => {
    await post({ name: "Nuevo Contacto", phone: "351 555 0111" });
    const list = await listPatients(db());
    expect(list.map((p) => p.name)).toContain("Nuevo Contacto");
    expect(list.find((p) => p.name === "Nuevo Contacto")).toMatchObject({ budgets_count: 0, phone_display: "+54 9 351 555 0111" });
  });
});
