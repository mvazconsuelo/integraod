export interface PatientRow { id: string; name: string; name_key: string; phone: string | null; created_at: string; updated_at: string }

/** Dos contactos no pueden tener el mismo nombre (sin importar mayúsculas ni espacios sobrantes). */
export const keyOf = (s: string) => s.trim().toLowerCase();

const COLS = "id, name, name_key, phone, created_at, updated_at";

export const listPatientRows = async (db: D1Database) =>
  (await db.prepare(`SELECT ${COLS} FROM patients ORDER BY name_key LIMIT 5000`).all<PatientRow>()).results;
export const patientById = (db: D1Database, id: string) => db.prepare(`SELECT ${COLS} FROM patients WHERE id = ?`).bind(id).first<PatientRow>();
export const patientByNameKey = (db: D1Database, key: string) => db.prepare(`SELECT ${COLS} FROM patients WHERE name_key = ?`).bind(key).first<PatientRow>();
export const patientByPhone = (db: D1Database, phone: string, exceptId?: string) =>
  db.prepare(`SELECT ${COLS} FROM patients WHERE phone = ? AND id <> ? ORDER BY created_at LIMIT 1`).bind(phone, exceptId ?? "").first<PatientRow>();

export async function insertPatient(db: D1Database, p: { id: string; name: string; phone: string | null; now: string }) {
  await db.prepare("INSERT INTO patients (id, name, name_key, phone, created_at, updated_at) VALUES (?,?,?,?,?,?)").bind(p.id, p.name, keyOf(p.name), p.phone, p.now, p.now).run();
}

/**
 * Cambia nombre y/o teléfono. Si cambia el nombre, se actualiza en todos lados donde ese contacto aparece
 * (sus presupuestos y la copia local de cobros y pagos), para que siga siendo una sola persona.
 */
export async function updatePatientRow(db: D1Database, current: PatientRow, next: { name: string; phone: string | null; now: string }) {
  const stmts = [db.prepare("UPDATE patients SET name = ?, name_key = ?, phone = ?, updated_at = ? WHERE id = ?").bind(next.name, keyOf(next.name), next.phone, next.now, current.id)];
  if (keyOf(next.name) !== current.name_key || next.name !== current.name) {
    stmts.push(
      db.prepare("UPDATE budgets SET patient_ref = ? WHERE patient_id = ?").bind(next.name, current.id),
      db.prepare("UPDATE payment_requests SET patient_ref = ? WHERE lower(trim(patient_ref)) = ?").bind(next.name, current.name_key),
      db.prepare("UPDATE payments SET patient_ref = ? WHERE lower(trim(patient_ref)) = ?").bind(next.name, current.name_key),
    );
  }
  await db.batch(stmts);
}

/** Cuántos registros usan a este contacto (presupuestos, cobros y pagos): con alguno, no se puede borrar. */
export async function patientUsage(db: D1Database, p: PatientRow): Promise<number> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM budgets WHERE patient_id = ?1)
            + (SELECT COUNT(*) FROM payment_requests WHERE lower(trim(patient_ref)) = ?2)
            + (SELECT COUNT(*) FROM payments WHERE lower(trim(patient_ref)) = ?2) AS n`,
    )
    .bind(p.id, p.name_key)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export const deletePatientRow = (db: D1Database, id: string) => db.prepare("DELETE FROM patients WHERE id = ?").bind(id).run();
