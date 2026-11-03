import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { treatmentSchema } from "../worker/src/schemas";
import * as svc from "../worker/src/services/treatments.service";

let db: D1Database;
beforeEach(() => { db = createTestDb(); });

describe("listado de servicios", () => {
  it("arranca vacío: no trae ejemplos de ningún rubro", async () => {
    expect(await svc.listTreatments(db)).toEqual([]);
  });
  it("sugiere los trabajos ya presupuestados, el más reciente primero y con su último precio, sin repetir", async () => {
    expect(await svc.listRecentWork(db)).toEqual([]);
    const { createBudget } = await import("../worker/src/services/budgets.service");
    const item = (description: string, unit_price_cents: number) => ({ description, quantity: 1, unit_price_cents, discount_pct: 0 });
    const base = { patient_ref: "Ana Pérez", issued_on: "2026-11-03", valid_until: null, notes: "" };
    await createBudget(db, { ...base, items: [item("Instalación de cocina", 25_000_000), item("Pintura", 8_000_000)] });
    await createBudget(db, { ...base, items: [item("instalación de cocina ", 30_000_000)] });
    const recent = await svc.listRecentWork(db);
    expect(recent.map((r) => r.name)).toEqual(["instalación de cocina", "Pintura"]); // sin repetir, el más nuevo primero
    expect(recent[0].price_cents).toBe(30_000_000); // el último precio usado
  });
  it("permite agregar, cambiar el precio y eliminar", async () => {
    const t = (await svc.createTreatment(db, { name: "Carilla de prueba", category: "Otros", price_cents: 12_000_000 }))!;
    expect((await svc.updateTreatment(db, t.id, { name: t.name, category: t.category, price_cents: 15_000_000 }))!.price_cents).toBe(15_000_000);
    await svc.deleteTreatment(db, t.id);
    expect((await svc.listTreatments(db)).find((x) => x.id === t.id)).toBeUndefined();
    await expect(svc.updateTreatment(db, "no-existe", { name: "x", category: "y", price_cents: 0 })).rejects.toThrow(/No encontramos/);
  });
  it("renombra una categoría completa y la elimina con sus servicios", async () => {
    await svc.createTreatment(db, { name: "Pintura", category: "Obra", price_cents: 0 });
    await svc.createTreatment(db, { name: "Albañilería", category: "Obra", price_cents: 0 });
    await svc.renameCategory(db, "Obra", "Obras");
    expect((await svc.listTreatments(db)).filter((t) => t.category === "Obras")).toHaveLength(2);
    await expect(svc.renameCategory(db, "Obra", "X")).rejects.toThrow(/No encontramos/);
    await svc.deleteCategory(db, "Obras");
    expect(await svc.listTreatments(db)).toEqual([]);
  });

  it("valida nombre, categoría y precio", () => {
    expect(treatmentSchema.safeParse({ name: "", category: "Otros", price_cents: 0 }).success).toBe(false);
    expect(treatmentSchema.safeParse({ name: "x", category: "Otros", price_cents: -1 }).success).toBe(false);
  });
});
