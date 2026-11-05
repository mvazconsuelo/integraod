import { DEFAULT_TIME_ZONE, isValidTimeZone } from "../utils/dates";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const cents = z.number().int("Importe inválido.").positive("El importe debe ser mayor a cero.");
const ref = z.string().trim().min(1, "Ingresá el nombre o referencia del destinatario.").max(120);

export const budgetItemSchema = z.object({
  description: z.string().trim().min(1, "Escribí o elegí el concepto.").max(200),
  quantity: z.number().int().positive("La cantidad debe ser al menos 1."),
  unit_price_cents: z.number().int().min(0, "El precio no puede ser negativo."),
  discount_pct: z.number().int().min(0).max(100, "El descuento va de 0 a 100.").default(0),
  /** Detalle libre del concepto (medidas, materiales, qué incluye). */
  detail: z.string().trim().max(1000, "El detalle es muy largo (máximo 1000 letras).").default(""),
});

export const budgetSchema = z.object({
  patient_ref: ref,
  /** El cliente elegido de la lista (con su teléfono). Sin él se usa el nombre. */
  patient_id: z.string().max(64).nullish(),
  issued_on: date,
  valid_until: date.nullable().default(null),
  notes: z.string().max(2000).default(""),
  items: z.array(budgetItemSchema).min(1, "Agregá al menos un concepto."),
});

export const budgetSharedSchema = z.object({ channel: z.string().trim().max(30).default("") });
export const budgetAnswerSchema = z.object({ answer: z.enum(["accepted", "declined"]) });

export const budgetPaymentModeSchema = z.object({ mode: z.enum(["total", "advance", "partial"]).nullable() });

export const budgetCollectMethodSchema = z.object({ method: z.enum(["mercadopago", "transfer", "cash"]).nullable() });

export const budgetStatusSchema = z.object({
  status: z.enum(["sent", "in_progress", "completed", "cancelled"]),
});

export const paymentRequestSchema = z.object({
  /** "online": con link de Mercado Pago. "cash": se cobra en mano (sin link). */
  method: z.enum(["online", "cash"]).default("online"),
  patient_ref: ref,
  concept: z.string().max(200).optional(),
  amount_cents: cents,
  kind: z.enum(["advance", "partial", "final"]).optional(),
  budget_id: z.string().min(1, "Elegí el presupuesto al que corresponde este cobro."),
  conditions: z.string().max(1000).default(""),
  due_date: date.nullable().default(null),
});

export const manualPaymentSchema = z.object({
  patient_ref: ref,
  concept: z.string().max(200).optional(),
  amount_cents: cents,
  method: z.enum(["cash", "transfer"]),
  kind: z.enum(["advance", "partial", "final"]).optional(),
  budget_id: z.string().min(1, "Elegí el presupuesto al que corresponde este pago."),
  request_id: z.string().nullable().default(null),
  paid_on: date.optional(),
  notes: z.string().max(500).default(""),
  idempotency_key: z.string().min(8).max(64).optional(),
});

export const applySchema = z.object({
  budget_id: z.string().min(1, "Elegí un presupuesto."),
  amount_cents: cents,
});

export const voidSchema = z.object({
  reason: z.string().trim().min(1, "Contanos brevemente el motivo.").max(300),
});

export const settingsSchema = z.object({
  name: z.string().trim().max(120),
  phone: z.string().max(60),
  email: z.string().max(120),
  address: z.string().max(200),
  professional_info: z.string().max(300),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido."),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido."),
  terms: z.string().max(2000),
  bank_holder: z.string().trim().max(120).optional(),
  // CBU/CVU: 22 dígitos (se aceptan con espacios o guiones). Alias: 6 a 20 letras, números, punto o guion.
  bank_cbu: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")).refine((v) => v === "" || /^\d{22}$/.test(v), "El CBU o CVU tiene 22 números.").optional(),
  bank_alias: z.string().trim().refine((v) => v === "" || /^[a-zA-Z0-9.-]{6,20}$/.test(v), "El alias tiene entre 6 y 20 letras, números, puntos o guiones.").optional(),
  time_zone: z.string().refine(isValidTimeZone, "Elegí una zona horaria válida.").default(DEFAULT_TIME_ZONE),
});

export const treatmentSchema = z.object({
  name: z.string().trim().min(1, "Escribí el nombre del servicio.").max(120),
  category: z.string().trim().min(1, "Elegí una categoría.").max(60),
  price_cents: z.number().int().min(0, "El precio no puede ser negativo."),
});

export const categoryRenameSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1, "Escribí el nuevo nombre de la categoría.").max(60),
});
export const categoryDeleteSchema = z.object({ name: z.string().trim().min(1) });

export const mockCheckoutSchema = z.object({ outcome: z.enum(["approved", "rejected", "pending"]) });

export const rangeSchema = z.object({ from: date, to: date });

export const patientCreateSchema = z.object({
  name: z.string().trim().min(1, "Escribí el nombre completo del destinatario.").max(120),
  /** Opcional: solo hace falta para escribirle por WhatsApp. */
  phone: z.string().trim().max(40).default(""),
  allow_duplicate_phone: z.boolean().default(false),
});
export const patientUpdateSchema = z.object({
  name: z.string().trim().min(1, "Escribí el nombre completo del destinatario.").max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  allow_duplicate_phone: z.boolean().default(false),
});
