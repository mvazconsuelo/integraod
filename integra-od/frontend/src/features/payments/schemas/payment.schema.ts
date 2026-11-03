import { z } from "zod";

const budgetPick = {
  patient_id: z.string(),
  budget_id: z.string(),
  new_treatment: z.string(),
  new_total_cents: z.number(),
};

/** Cada cobro necesita un presupuesto: uno existente o uno nuevo con el trabajo y el total. */
function checkBudget(v: { budget_id: string; patient_id: string; new_treatment: string; new_total_cents: number; amount_cents: number }, ctx: z.RefinementCtx) {
  if (!v.budget_id) return ctx.addIssue({ code: "custom", path: ["budget_id"], message: "Elegí un presupuesto o creá uno nuevo." });
  if (v.budget_id !== "new") return;
  if (!v.patient_id) ctx.addIssue({ code: "custom", path: ["patient_ref"], message: "Elegí o creá al contacto." });
  if (!v.new_treatment.trim()) ctx.addIssue({ code: "custom", path: ["new_treatment"], message: "Escribí qué trabajo es." });
  if (v.new_total_cents <= 0) ctx.addIssue({ code: "custom", path: ["new_total_cents"], message: "Ingresá el total del presupuesto." });
  else if (v.amount_cents > v.new_total_cents) ctx.addIssue({ code: "custom", path: ["amount_cents"], message: "No puede superar el total del presupuesto." });
}

export const requestFormSchema = z
  .object({
    patient_ref: z.string().trim().min(1, "Ingresá el nombre o referencia del contacto."),
    amount_cents: z.number().min(1, "Ingresá el importe."),
    conditions: z.string().max(1000),
    due_date: z.string(),
    ...budgetPick,
  })
  .superRefine(checkBudget);
export type RequestForm = z.infer<typeof requestFormSchema>;

export const manualFormSchema = z
  .object({
    patient_ref: z.string().trim().min(1, "Ingresá el nombre o referencia del contacto."),
    amount_cents: z.number().min(1, "Ingresá el importe."),
    method: z.enum(["cash", "transfer"]),
    paid_on: z.string().min(1, "Elegí la fecha."),
    ...budgetPick,
  })
  .superRefine(checkBudget);
export type ManualForm = z.infer<typeof manualFormSchema>;
