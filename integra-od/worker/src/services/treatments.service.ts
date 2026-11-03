import { AppError } from "../utils/errors";
import { newId } from "../utils/ids";

export interface Treatment {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  position: number;
}

interface TreatmentInput { name: string; category: string; price_cents: number }

/**
 * Los trabajos que ya presupuestaste, del más reciente al más viejo, con el último precio usado:
 * así el campo "¿Qué trabajo es?" sugiere lo tuyo sin cargar ningún listado antes.
 */
export async function listRecentWork(db: D1Database, limit = 40) {
  const { results } = await db
    .prepare("SELECT i.description AS name, i.unit_price_cents AS price_cents FROM budget_items i JOIN budgets b ON b.id = i.budget_id ORDER BY b.created_at DESC, i.position")
    .all<{ name: string; price_cents: number }>();
  const seen = new Set<string>();
  const out: { name: string; price_cents: number }[] = [];
  for (const r of results) {
    const key = r.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: r.name.trim(), price_cents: r.price_cents });
    if (out.length >= limit) break;
  }
  return out;
}

export async function listTreatments(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM treatments ORDER BY position, name").all<Treatment>();
  return results;
}

export async function createTreatment(db: D1Database, t: TreatmentInput) {
  const id = newId();
  await db
    .prepare("INSERT INTO treatments (id, name, category, price_cents, position) VALUES (?,?,?,?, (SELECT COALESCE(MAX(position), 0) + 1 FROM treatments))")
    .bind(id, t.name, t.category, t.price_cents)
    .run();
  return db.prepare("SELECT * FROM treatments WHERE id = ?").bind(id).first<Treatment>();
}

export async function updateTreatment(db: D1Database, id: string, t: TreatmentInput) {
  const res = await db.prepare("UPDATE treatments SET name=?, category=?, price_cents=? WHERE id=?").bind(t.name, t.category, t.price_cents, id).run();
  if (!res.meta.changes) throw new AppError(404, "No encontramos ese servicio.");
  return db.prepare("SELECT * FROM treatments WHERE id = ?").bind(id).first<Treatment>();
}

/** Borrar del listado no afecta presupuestos ya creados: copian el nombre y el precio. */
export async function deleteTreatment(db: D1Database, id: string) {
  await db.prepare("DELETE FROM treatments WHERE id = ?").bind(id).run();
}

/** Renombrar una categoría la cambia en todos sus tratamientos (si el nombre ya existe, se unen). */
export async function renameCategory(db: D1Database, from: string, to: string) {
  const res = await db.prepare("UPDATE treatments SET category = ? WHERE category = ?").bind(to, from).run();
  if (!res.meta.changes) throw new AppError(404, "No encontramos esa categoría.");
}

/** Elimina la categoría con todos sus tratamientos. Los presupuestos ya creados no se tocan. */
export async function deleteCategory(db: D1Database, name: string) {
  await db.prepare("DELETE FROM treatments WHERE category = ?").bind(name).run();
}
