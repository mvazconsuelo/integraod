import { createTreatment } from "@/features/settings/services/treatments.service";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useApi } from "@/hooks/useApi";
import type { Treatment } from "@/types";
import { budgetFormSchema, type BudgetForm } from "../schemas/budget.schema";

const DRAFT = "integraod.budget-draft";
export interface Draft { values: BudgetForm; open?: { notes?: boolean } }

/** Total que se ve mientras se arma: la misma cuenta que hace el servidor (cantidad × precio, con descuento). */
export const budgetTotal = (items: BudgetForm["items"]) =>
  items.reduce((s, i) => s + Math.round(((i.quantity || 0) * (i.unit_price_cents || 0) * (100 - Math.min(100, Math.max(0, i.discount_pct || 0)))) / 100), 0);

export const readDraft = (): Draft | null => { try { return JSON.parse(sessionStorage.getItem(DRAFT) ?? "null"); } catch { return null; } };
export const writeDraft = (d: Draft | null) => { try { if (d) sessionStorage.setItem(DRAFT, JSON.stringify(d)); else sessionStorage.removeItem(DRAFT); } catch { /* sin storage */ } };

/** Todo lo que necesita armar un presupuesto (formulario, conceptos, sugerencias), para usarlo igual al crear paso a paso o al editar. */
export function useBudgetForm(initial: BudgetForm, notesOpen: boolean) {
  const saved = useApi<Treatment[]>("/treatments");
  const recent = useApi<{ name: string; price_cents: number }[]>("/treatments/recent");
  // Lo que se sugiere: el listado propio (si lo hay) y los conceptos que ya presupuestaste.
  const catalog = useMemo<Treatment[]>(() => [
    ...(saved.data ?? []),
    ...(recent.data ?? []).filter((r) => !(saved.data ?? []).some((t) => t.name.toLowerCase() === r.name.toLowerCase())).map((r, i): Treatment => ({ id: `recent-${i}`, name: r.name, category: "Tus conceptos", price_cents: r.price_cents, position: i })),
  ], [saved.data, recent.data]);

  const form = useForm<BudgetForm>({ resolver: zodResolver(budgetFormSchema), defaultValues: initial, mode: "onChange" });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const values = form.watch();
  const errors = form.formState.errors;
  const [priceKeys, setPriceKeys] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState({ notes: notesOpen });

  const pickTreatment = (index: number, rowId: string, t: Treatment) => {
    form.setValue(`items.${index}.description`, t.name, { shouldValidate: true });
    if (t.price_cents > 0) { form.setValue(`items.${index}.unit_price_cents`, t.price_cents, { shouldValidate: true }); setPriceKeys((k) => ({ ...k, [rowId]: (k[rowId] ?? 0) + 1 })); }
  };

  // Un concepto que no estaba en el listado se guarda en él (categoría "General", con el precio que ya se cargó en la fila).
  const createConcept = async (index: number, name: string) => {
    form.setValue(`items.${index}.description`, name.trim(), { shouldValidate: true });
    try {
      await createTreatment({ name: name.trim(), category: "General", price_cents: form.getValues(`items.${index}.unit_price_cents`) || 0 });
      await saved.reload();
    } catch { /* el concepto igual queda escrito en el presupuesto */ }
  };

  return { form, control: form.control, createConcept, setValue: form.setValue, errors, fields, append, remove, values, sum: budgetTotal(values.items ?? []), catalog, pickTreatment, priceKeys, detail, setDetail, open, setOpen };
}
export type BudgetFormHandle = ReturnType<typeof useBudgetForm>;
