import { listBudgets } from "./budgets.service";
import { listReceived, listRequests } from "./payments.service";
import { AppError } from "../utils/errors";
import { newId } from "../utils/ids";
import { nowIso } from "../utils/dates";
import { normalizePhone, formatPhone } from "../utils/phone";
import { audit } from "./audit.service";
import { deletePatientRow, insertPatient, keyOf as contactKey, listPatientRows, patientById, patientByNameKey, patientByPhone, patientUsage, updatePatientRow, type PatientRow } from "../repositories/patients.repository";

/**
 * No hay una tabla de clientes a propósito (no es una historia clínica): el cliente es el nombre
 * o referencia que se escribe en cada presupuesto, cobro y cancelación. Se agrupa sin distinguir
 * mayúsculas ni espacios sobrantes.
 */
const keyOf = contactKey;

async function loadAll(db: D1Database) {
  const [budgets, requests, payments] = await Promise.all([
    listBudgets(db),
    listRequests(db),
    listReceived(db),
  ]);
  return { budgets, requests, payments };
}

export async function listPatients(db: D1Database) {
  const { budgets, requests, payments } = await loadAll(db);
  const map = new Map<string, { id: string | null; phone: string | null; phone_display: string | null; name: string; budgets_count: number; budgeted_cents: number; applied_cents: number; balance_cents: number; last_activity: string }>();

  const touch = (raw: string, date: string) => {
    const key = keyOf(raw);
    if (!key) return null;
    const p = map.get(key) ?? { id: null, phone: null, phone_display: null, name: raw.trim(), budgets_count: 0, budgeted_cents: 0, applied_cents: 0, balance_cents: 0, last_activity: "" };
    if (date > p.last_activity) p.last_activity = date;
    map.set(key, p);
    return p;
  };

  for (const b of budgets) {
    const p = touch(b.patient_ref, b.updated_at);
    if (p && b.status !== "cancelled") {
      p.budgets_count += 1;
      p.budgeted_cents += b.total_cents;
      p.applied_cents += b.applied_cents;
      p.balance_cents += b.balance_cents;
    }
  }
  for (const r of requests) touch(r.patient_ref, r.created_at);
  for (const pay of payments) touch(pay.patient_ref, pay.paid_at);

  // Los clientes cargados en la agenda aparecen aunque todavía no tengan presupuestos.
  const rows = await listPatientRows(db);
  for (const c of rows) touch(c.name, c.updated_at);
  const contacts = new Map(rows.map((c) => [c.name_key, c]));
  for (const [key, p] of map) {
    const c = contacts.get(key);
    if (c) { p.id = c.id; p.phone = c.phone; p.phone_display = c.phone ? formatPhone(c.phone) : null; }
  }
  return [...map.values()].sort((a, b) => b.last_activity.localeCompare(a.last_activity));
}

export async function getPatientDetail(db: D1Database, name: string) {
  const key = keyOf(name);
  const all = await loadAll(db);
  const budgets = all.budgets.filter((b) => keyOf(b.patient_ref) === key);
  const requests = all.requests.filter((r) => keyOf(r.patient_ref) === key);
  const payments = all.payments.filter((p) => keyOf(p.patient_ref) === key);
  const contact = key ? await patientByNameKey(db, key) : null;
  if (!key || (budgets.length + requests.length + payments.length === 0 && !contact)) {
    throw new AppError(404, "No encontramos a ese cliente.");
  }

  const live = budgets.filter((b) => b.status !== "cancelled");
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

  return {
    contact: contact ? toContact(contact) : null,
    name: budgets[0]?.patient_ref.trim() ?? requests[0]?.patient_ref.trim() ?? payments[0]?.patient_ref.trim() ?? contact?.name,
    totals: {
      budgeted_cents: sum(live, (b) => b.total_cents),
      applied_cents: sum(live, (b) => b.applied_cents),
      balance_cents: sum(live, (b) => b.balance_cents),
      received_cents: sum(payments.filter((p) => p.status === "approved"), (p) => p.amount_cents),
      unassigned_cents: sum(payments, (p) => p.available_cents),
    },
    budgets,
    requests,
    payments,
  };
}


// ------------------------------------------------------------------------------------------------ clientes (nombre y teléfono)

/** Un cliente tal como lo ve la pantalla: el teléfono guardado y cómo mostrarlo. */
export const toContact = (p: PatientRow) => ({ id: p.id, name: p.name, phone: p.phone, phone_display: p.phone ? formatPhone(p.phone) : null });

export async function listContacts(db: D1Database) {
  return (await listPatientRows(db)).map(toContact);
}

const cleanName = (raw: string) => {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new AppError(422, "Escribí el nombre completo del cliente.", "name_required");
  if (name.length > 120) throw new AppError(422, "El nombre es demasiado largo.", "name_too_long");
  return name;
};

/** Sin teléfono (vacío) es válido: queda en null. Con teléfono, tiene que entenderse. */
const cleanPhone = (raw: string): string | null => {
  if (!raw.trim()) return null;
  const phone = normalizePhone(raw);
  if (!phone) throw new AppError(422, "Revisá el teléfono: con el código de área tiene que tener 10 números (sin el 0 ni el 15). Por ejemplo 261 334 4477.", "bad_phone");
  return phone;
};

async function ensurePhoneFree(db: D1Database, phone: string, allowDuplicate: boolean, exceptId?: string) {
  if (allowDuplicate) return;
  const other = await patientByPhone(db, phone, exceptId);
  if (other) throw new AppError(409, `Ya existe ${other.name} con ese número. Si es de la misma familia, podés guardarlo igual.`, "phone_in_use");
}

/** Crea un cliente. El teléfono es opcional: se pide recién cuando hace falta para escribirle por WhatsApp. */
export async function createPatient(db: D1Database, input: { name: string; phone?: string; allow_duplicate_phone?: boolean }) {
  const name = cleanName(input.name);
  const phone = cleanPhone(input.phone ?? "");
  if (await patientByNameKey(db, keyOf(name))) throw new AppError(409, "Ya existe un cliente con ese nombre. Elegilo de la lista, o agregá algo que los distinga.", "name_exists");
  if (phone) await ensurePhoneFree(db, phone, Boolean(input.allow_duplicate_phone));
  const id = newId();
  await insertPatient(db, { id, name, phone, now: nowIso() });
  await audit(db, { action: "contact.created", entity: "contact", entityId: id });
  return toContact((await patientById(db, id))!);
}

export async function updatePatient(db: D1Database, id: string, input: { name?: string; phone?: string; allow_duplicate_phone?: boolean }) {
  const current = await patientById(db, id);
  if (!current) throw new AppError(404, "No encontramos a ese cliente.");
  const name = input.name !== undefined ? cleanName(input.name) : current.name;
  const phone = input.phone !== undefined ? cleanPhone(input.phone) : current.phone;
  if (keyOf(name) !== current.name_key) {
    const clash = await patientByNameKey(db, keyOf(name));
    if (clash && clash.id !== id) throw new AppError(409, "Ya existe otro cliente con ese nombre.", "name_exists");
  }
  if (phone && phone !== current.phone) await ensurePhoneFree(db, phone, Boolean(input.allow_duplicate_phone), id);
  await updatePatientRow(db, current, { name, phone, now: nowIso() });
  await audit(db, { action: "contact.updated", entity: "contact", entityId: id, detail: { ...(name !== current.name ? { renamed_from: current.name, renamed_to: name } : {}), phone_changed: phone !== current.phone } });
  return toContact((await patientById(db, id))!);
}

/** Borra un cliente que nunca tuvo presupuestos ni cobros. Con historial se conserva: el dinero y los presupuestos no se pierden. */
export async function deletePatient(db: D1Database, id: string) {
  const p = await patientById(db, id);
  if (!p) throw new AppError(404, "No encontramos a ese cliente.");
  if ((await patientUsage(db, p)) > 0) throw new AppError(409, `${p.name} tiene presupuestos o cobros, así que no se puede borrar. Se conserva para no perder el historial.`, "patient_in_use");
  await deletePatientRow(db, id);
  await audit(db, { action: "contact.deleted", entity: "contact", entityId: id, detail: { name: p.name } });
}

/**
 * Para un presupuesto: el cliente elegido (con su teléfono) o, si solo viene un nombre (compatibilidad), el que ya existe
 * con ese nombre o uno nuevo sin teléfono. Con un cliente elegido, el teléfono es obligatorio.
 */
export async function resolvePatientForBudget(db: D1Database, input: { patient_ref: string; patient_id?: string | null }): Promise<PatientRow> {
  if (input.patient_id) {
    const p = await patientById(db, input.patient_id);
    if (!p) throw new AppError(404, "No encontramos a ese cliente.");
    return p;
  }
  const name = cleanName(input.patient_ref);
  const found = await patientByNameKey(db, keyOf(name));
  if (found) return found;
  const id = newId();
  await insertPatient(db, { id, name, phone: null, now: nowIso() });
  return (await patientById(db, id))!;
}
