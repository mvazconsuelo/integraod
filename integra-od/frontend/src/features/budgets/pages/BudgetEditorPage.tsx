import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, ListPlus, NotebookText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberField } from "@/components/ui/number-field";
import { Textarea } from "@/components/ui/input";
import { AmountField } from "@/components/shared/AmountField";
import { BackLink } from "@/components/shared/BackLink";
import { Field } from "@/components/shared/Field";
import { PageHeader } from "@/components/shared/PageHeader";
import { PatientPicker } from "@/components/shared/PatientPicker";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useSettings } from "@/app/providers";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { addDays, today } from "@/lib/formatters";
import type { BudgetDetail, Treatment } from "@/types";
import { TreatmentCombobox } from "../components/TreatmentCombobox";
import { budgetFormSchema, type BudgetForm } from "../schemas/budget.schema";
import { createBudget, updateBudget } from "../services/budgets.service";

const DRAFT = "integraod.budget-draft";
interface Draft { values: BudgetForm; open: Open }
interface Open { items: boolean; notes: boolean; dates: boolean }

const total = (items: BudgetForm["items"]) =>
  items.reduce((s, i) => s + Math.round(((i.quantity || 0) * (i.unit_price_cents || 0) * (100 - Math.min(100, Math.max(0, i.discount_pct || 0)))) / 100), 0);

const readDraft = (): Draft | null => { try { return JSON.parse(sessionStorage.getItem(DRAFT) ?? "null"); } catch { return null; } };
const writeDraft = (d: Draft | null) => { try { if (d) sessionStorage.setItem(DRAFT, JSON.stringify(d)); else sessionStorage.removeItem(DRAFT); } catch { /* sin storage */ } };

/** Crear (`/presupuestos/nuevo`) o editar (`/presupuestos/:id/editar`): la misma pantalla. */
export function BudgetEditorPage() {
  const { id } = useParams();
  const existing = useApi<BudgetDetail>(id ? `/budgets/${id}` : null);
  if (id && existing.loading && !existing.data) return <Loading />;
  if (id && (existing.error || !existing.data)) return <ErrorMessage message={existing.error ?? "No encontramos el presupuesto."} onRetry={existing.reload} />;
  return <Editor budget={existing.data ?? undefined} />;
}

/**
 * Tres momentos: lo esencial (quién, qué trabajo, cuánto), los detalles opcionales a pedido, y guardar.
 * El total se ve siempre. Lo escrito se conserva si se sale y se vuelve (borrador del navegador, solo para uno nuevo).
 */
function Editor({ budget }: { budget?: BudgetDetail }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { settings } = useSettings();
  const catalog = useApi<Treatment[]>("/treatments");
  const editing = Boolean(budget);
  const draft = useRef(editing ? null : readDraft()).current;

  const initial: BudgetForm = budget
    ? { patient_ref: budget.patient_ref, patient_id: budget.patient_id ?? "", issued_on: budget.issued_on, valid_until: budget.valid_until ?? "", notes: budget.notes, items: budget.items.map(({ description, quantity, unit_price_cents, discount_pct }) => ({ description, quantity, unit_price_cents, discount_pct })) }
    : draft?.values ?? {
        patient_ref: params.get("contacto") ?? "", patient_id: "", issued_on: today(), valid_until: addDays(today(), settings?.default_validity_days ?? 30), notes: settings?.terms ?? "",
        items: [{ description: "", quantity: 1, unit_price_cents: 0, discount_pct: 0 }],
      };
  const complex = (v: BudgetForm) => v.items.length > 1 || v.items.some((i) => i.quantity !== 1 || i.discount_pct !== 0);
  const [open, setOpen] = useState<Open>(draft?.open ?? { items: complex(initial), notes: editing && Boolean(initial.notes), dates: false });
  const [error, setError] = useState("");
  const [priceKeys, setPriceKeys] = useState<Record<string, number>>({});

  const { control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<BudgetForm>({ resolver: zodResolver(budgetFormSchema), defaultValues: initial, mode: "onChange" });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const values = watch();
  const sum = total(values.items ?? []);

  // Las condiciones y la vigencia por defecto llegan con la configuración.
  useEffect(() => {
    if (editing || draft || !settings) return;
    setValue("notes", settings.terms);
    setValue("valid_until", addDays(today(), settings.default_validity_days));
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Borrador: lo escrito no se pierde si se vuelve atrás.
  useEffect(() => { if (!editing) writeDraft({ values, open }); }, [JSON.stringify(values), open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickTreatment = (index: number, rowId: string, t: Treatment) => {
    setValue(`items.${index}.description`, t.name, { shouldValidate: true });
    if (t.price_cents > 0) { setValue(`items.${index}.unit_price_cents`, t.price_cents, { shouldValidate: true }); setPriceKeys((k) => ({ ...k, [rowId]: (k[rowId] ?? 0) + 1 })); }
  };

  const submit = handleSubmit(async (v) => {
    setError("");
    try {
      const saved = budget ? await updateBudget(budget.id, v) : await createBudget(v);
      if (!budget) writeDraft(null);
      // Uno nuevo sigue en el cobro, en la misma pantalla del presupuesto.
      navigate(budget ? `/presupuestos/${saved.id}` : `/presupuestos/${saved.id}?cobrar=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar el presupuesto.");
    }
  });

  const price = (i: number) => errors.items?.[i]?.unit_price_cents?.message;
  const allClosed = open.items && open.notes && open.dates;

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-0">
      <BackLink to={editing ? `/presupuestos/${budget!.id}` : "/presupuestos"}>{editing ? "presupuesto" : "presupuestos"}</BackLink>
      <PageHeader title={editing ? "Editar presupuesto" : "Nuevo presupuesto"} subtitle={editing ? undefined : "Tres datos y listo. Lo demás es opcional."} />

      <form id="budget-form" onSubmit={submit} className="space-y-4">
        <Card className="space-y-4 p-4 sm:p-5">
          <Controller control={control} name="patient_id" render={({ field }) => (
            <PatientPicker autoFocus={!editing && !params.get("contacto")} error={errors.patient_id?.message ?? errors.patient_ref?.message} value={{ id: field.value, name: values.patient_ref }}
              onChange={(p) => { setValue("patient_ref", p.name, { shouldValidate: true }); field.onChange(p.id); }} />
          )} />

          {!open.items && fields[0] && (
            <>
              <Field required label="¿Qué trabajo es?" error={errors.items?.[0]?.description?.message}>
                <Controller control={control} name="items.0.description" render={({ field }) => <TreatmentCombobox id="work" value={field.value} onChange={field.onChange} catalog={catalog.data ?? []} onPick={(t) => pickTreatment(0, fields[0].id, t)} invalid={!!errors.items?.[0]?.description} />} />
              </Field>
              <Field label="Importe" hint="El total se calcula solo." error={price(0)}>
                <Controller control={control} name="items.0.unit_price_cents" render={({ field }) => <AmountField key={`${fields[0].id}-${priceKeys[fields[0].id] ?? 0}`} valueCents={field.value} onChange={field.onChange} />} />
              </Field>
            </>
          )}
        </Card>

        {open.items && (
          <div className="space-y-3">
            {fields.map((f, i) => (
              <Card key={f.id} className="space-y-3 p-4">
                <Field required label={fields.length > 1 ? `Concepto ${i + 1}` : "Concepto"} error={errors.items?.[i]?.description?.message}>
                  <Controller control={control} name={`items.${i}.description`} render={({ field }) => <TreatmentCombobox id={`desc-${f.id}`} value={field.value} onChange={field.onChange} catalog={catalog.data ?? []} onPick={(t) => pickTreatment(i, f.id, t)} invalid={!!errors.items?.[i]?.description} />} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field plain required label="Cantidad" error={errors.items?.[i]?.quantity?.message}><Controller control={control} name={`items.${i}.quantity`} render={({ field }) => <NumberField ariaLabel="Cantidad" min={1} max={999} value={field.value} onChange={field.onChange} invalid={!!errors.items?.[i]?.quantity} />} /></Field>
                  <Field label="Precio unitario" error={price(i)}><Controller control={control} name={`items.${i}.unit_price_cents`} render={({ field }) => <AmountField key={`${f.id}-${priceKeys[f.id] ?? 0}`} valueCents={field.value} onChange={field.onChange} />} /></Field>
                  <Field plain label="Descuento (%)" error={errors.items?.[i]?.discount_pct?.message}><Controller control={control} name={`items.${i}.discount_pct`} render={({ field }) => <NumberField ariaLabel="Descuento en porcentaje" min={0} max={100} value={field.value} onChange={field.onChange} invalid={!!errors.items?.[i]?.discount_pct} />} /></Field>
                </div>
                {fields.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}><Trash2 size={14} />Quitar</Button>}
              </Card>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ description: "", quantity: 1, unit_price_cents: 0, discount_pct: 0 })}><Plus size={14} />Agregar otro concepto</Button>
          </div>
        )}

        {open.dates && (
          <Card className="grid grid-cols-2 gap-3 p-4">
            <Field required label="Fecha de emisión" error={errors.issued_on?.message}><Controller control={control} name="issued_on" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} /></Field>
            <Field label="Válido hasta"><Controller control={control} name="valid_until" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} clearable placeholder="Sin vencimiento" />} /></Field>
          </Card>
        )}

        {open.notes && (
          <Card className="p-4"><Field label="Observaciones y condiciones"><Controller control={control} name="notes" render={({ field }) => <Textarea className="min-h-24" value={field.value} onChange={field.onChange} />} /></Field></Card>
        )}

        {!allClosed && (
          <div className="flex flex-wrap gap-2" aria-label="Agregar detalles">
            {!open.items && <Chip icon={<ListPlus size={15} />} onClick={() => setOpen({ ...open, items: true })}>Varios conceptos, cantidades o descuentos</Chip>}
            {!open.notes && <Chip icon={<NotebookText size={15} />} onClick={() => setOpen({ ...open, notes: true })}>Observaciones y condiciones</Chip>}
            {!open.dates && <Chip icon={<CalendarDays size={15} />} onClick={() => setOpen({ ...open, dates: true })}>Fechas</Chip>}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        {/* Total siempre a la vista; en el celular queda pegado arriba de la barra de navegación */}
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t bg-white/95 px-4 py-3 backdrop-blur md:static md:z-auto md:rounded-2xl md:border md:bg-white md:p-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <div><p className="text-xs text-muted">Total</p><p className="text-2xl font-semibold tabular">{formatMoney(sum)}</p></div>
            <Button className="h-12 px-6 text-base" disabled={isSubmitting}>{editing ? "Guardar cambios" : "Crear presupuesto"}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

const Chip = ({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border bg-white px-4 text-sm font-medium text-secondary hover:bg-soft">{icon}{children}</button>
);
