import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { treatmentSchema } from "../worker/src/schemas";
import * as svc from "../worker/src/services/treatments.service";

let db: D1Database;
beforeEach(() => { db = createTestDb(); });

describe("listado de tratamientos", () => {
  it("viene con tratamientos odontológicos habituales, sin precios inventados", async () => {
    const list = await svc.listTreatments(db);
    expect(list.length).toBeGreaterThan(30);
    expect(new Set(list.map((t) => t.category)).size).toBeGreaterThanOrEqual(6);
    expect(list.every((t) => t.price_cents === 0)).toBe(true);
    expect(list.map((t) => t.name)).toContain("Limpieza dental (profilaxis)");
    expect(list[0].category).toBe("Diagnóstico");
    expect(list.every((t) => t.category.length <= 16)).toBe(true);
  });
  it("permite agregar, cambiar el precio y eliminar", async () => {
    const t = (await svc.createTreatment(db, { name: "Carilla de prueba", category: "Otros", price_cents: 12_000_000 }))!;
    expect((await svc.updateTreatment(db, t.id, { name: t.name, category: t.category, price_cents: 15_000_000 }))!.price_cents).toBe(15_000_000);
    await svc.deleteTreatment(db, t.id);
    expect((await svc.listTreatments(db)).find((x) => x.id === t.id)).toBeUndefined();
    await expect(svc.updateTreatment(db, "no-existe", { name: "x", category: "y", price_cents: 0 })).rejects.toThrow(/No encontramos/);
  });
  it("renombra una categoría completa y la elimina con sus tratamientos", async () => {
    const before = (await svc.listTreatments(db)).filter((t) => t.category === "Ortodoncia").length;
    expect(before).toBeGreaterThan(0);
    await svc.renameCategory(db, "Ortodoncia", "Ortodoncia y ortopedia");
    const renamed = (await svc.listTreatments(db)).filter((t) => t.category === "Ortodoncia y ortopedia");
    expect(renamed).toHaveLength(before);
    await expect(svc.renameCategory(db, "Ortodoncia", "X")).rejects.toThrow(/No encontramos/);
    await svc.deleteCategory(db, "Ortodoncia y ortopedia");
    expect((await svc.listTreatments(db)).some((t) => t.category === "Ortodoncia y ortopedia")).toBe(false);
  });

  it("valida nombre, categoría y precio", () => {
    expect(treatmentSchema.safeParse({ name: "", category: "Otros", price_cents: 0 }).success).toBe(false);
    expect(treatmentSchema.safeParse({ name: "x", category: "Otros", price_cents: -1 }).success).toBe(false);
  });
});
