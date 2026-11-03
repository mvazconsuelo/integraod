import { z } from "zod";

export const budgetFormSchema = z.object({
  patient_ref: z.string().trim().min(1, "Elegí o creá al contacto."),
  patient_id: z.string().min(1, "Elegí o creá al contacto."),
  issued_on: z.string().min(1, "Elegí la fecha de emisión."),
  valid_until: z.string(),
  notes: z.string().max(2000),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Escribí o elegí el concepto."),
        quantity: z.number({ invalid_type_error: "Ingresá la cantidad." }).int().min(1, "Mínimo 1."),
        unit_price_cents: z.number().min(0),
        discount_pct: z.number({ invalid_type_error: "0 a 100." }).int().min(0, "0 a 100.").max(100, "0 a 100."),
      }),
    )
    .min(1, "Agregá al menos un concepto."),
});
export type BudgetForm = z.infer<typeof budgetFormSchema>;
