import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Plus, SlidersHorizontal } from "lucide-react";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberField } from "@/components/ui/number-field";
import { Textarea } from "@/components/ui/input";
import { AmountField } from "@/components/shared/AmountField";
import { Field } from "@/components/shared/Field";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/formatters";
import { PatientPicker, type PickerHandle } from "@/components/shared/PatientPicker";
import type { BudgetFormHandle } from "../hooks/useBudgetForm";
import { TreatmentCombobox } from "./TreatmentCombobox";

const link = "cursor-pointer text-sm font-medium text-secondary hover:underline";
/** Acción secundaria que se ve como botón (no como texto suelto). */
const pill = "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-secondary/30 bg-white px-3 text-[13px] font-medium sm:px-3.5 sm:text-sm text-secondary transition hover:bg-soft";

/** Quién: buscar un cliente o cargarlo ahí mismo. */
export function ClientField({ h, autoFocus, pickerRef }: { h: BudgetFormHandle; autoFocus?: boolean; pickerRef?: React.Ref<PickerHandle> }) {
  return (
    <div className="rounded-3xl border bg-white p-5 sm:p-6">
      <Controller control={h.control} name="patient_id" render={({ field }) => (
        <PatientPicker handle={pickerRef} autoFocus={autoFocus} error={h.errors.patient_id?.message ?? h.errors.patient_ref?.message} value={{ id: field.value, name: h.values.patient_ref }}
          onChange={(p) => { h.setValue("patient_ref", p.name, { shouldValidate: true }); field.onChange(p.id); }} />
      )} />
    </div>
  );
}

/** Qué: los conceptos, uno para empezar; se suman con el botón de abajo. Cantidad y descuento, solo en el que se pide. */
export function ConceptsFields({ h }: { h: BudgetFormHandle }) {
  const { control, errors, fields, values } = h;
  // Se edita un concepto a la vez; los demás quedan en una fila compacta (así la lista no crece sin fin).
  const [active, setActive] = useState(fields.length - 1);
  const count = useRef(fields.length);
  useEffect(() => {
    if (fields.length > count.current) setActive(fields.length - 1);
    else if (active >= fields.length) setActive(Math.max(0, fields.length - 1));
    count.current = fields.length;
  }, [fields.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Si falta algo en un concepto cerrado, se abre ese.
  useEffect(() => {
    const bad = (errors.items as unknown[] | undefined)?.findIndex((e) => Boolean(e));
    if (bad !== undefined && bad >= 0) setActive(bad);
  }, [errors.items]);
  const activeField = fields[active];
  const activeRow = values.items?.[active];
  const activeDetail = activeField ? (h.detail[activeField.id] ?? Boolean(activeRow && (activeRow.quantity !== 1 || activeRow.discount_pct !== 0))) : false;
  return (
    <section aria-label="Conceptos" className="space-y-3 rounded-3xl border bg-white p-4 sm:space-y-6 sm:p-6">
      {fields.map((f, i) => {
        const row = values.items?.[i];
        if (i !== active) {
          const line = row ? Math.round((row.quantity * row.unit_price_cents * (100 - row.discount_pct)) / 100) : 0;
          return (
            <div key={f.id} className="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
              <button type="button" onClick={() => setActive(i)} aria-label={`Editar concepto ${i + 1}`} className="min-w-0 flex-1 cursor-pointer text-left">
                <span className="block truncate text-sm font-medium">{row?.description?.trim() || `Concepto ${i + 1}`}</span>
                <span className="block text-xs tabular text-muted">{formatMoney(line)}{row && row.quantity > 1 ? ` · ${row.quantity} unidades` : ""} · Editar</span>
              </button>
              <button type="button" className="shrink-0 cursor-pointer text-sm text-muted hover:text-danger hover:underline" onClick={() => h.remove(i)}>Quitar</button>
            </div>
          );
        }
        const showDetail = h.detail[f.id] ?? Boolean(row && (row.quantity !== 1 || row.discount_pct !== 0));
        return (
          <div key={f.id} className="space-y-3 rounded-2xl bg-soft/60 p-3 sm:p-4">
            <div className="grid gap-3 desk:grid-cols-[1fr_15rem] desk:gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`desc-${f.id}`} className="text-sm font-semibold">Concepto{fields.length > 1 ? ` ${i + 1}` : ""}<span className="text-danger" aria-hidden> *</span></label>
                {fields.length > 1 && <button type="button" className="cursor-pointer text-sm text-muted hover:text-danger hover:underline" onClick={() => h.remove(i)}>Quitar</button>}
              </div>
              <Controller control={control} name={`items.${i}.description`} render={({ field }) => <TreatmentCombobox id={`desc-${f.id}`} nextId={`amt-${f.id}`} value={field.value} onChange={field.onChange} catalog={h.catalog} onPick={(t) => h.pickTreatment(i, f.id, t)} invalid={!!errors.items?.[i]?.description} />} />
              {errors.items?.[i]?.description && <p role="alert" className="text-xs text-danger">{errors.items[i]?.description?.message}</p>}
            </div>
            <Field label={showDetail ? "Precio de cada uno" : "Importe"} error={errors.items?.[i]?.unit_price_cents?.message}>
              <Controller control={control} name={`items.${i}.unit_price_cents`} render={({ field }) => <AmountField id={`amt-${f.id}`} key={`${f.id}-${h.priceKeys[f.id] ?? 0}`} valueCents={field.value} onChange={field.onChange} />} />
            </Field>
            </div>
            {showDetail && (
              <div className="grid grid-cols-2 gap-3">
                <Field plain label="Cantidad" error={errors.items?.[i]?.quantity?.message}><Controller control={control} name={`items.${i}.quantity`} render={({ field }) => <NumberField ariaLabel="Cantidad" min={1} max={999} value={field.value} onChange={field.onChange} invalid={!!errors.items?.[i]?.quantity} />} /></Field>
                <Field plain label="Descuento (%)" error={errors.items?.[i]?.discount_pct?.message}><Controller control={control} name={`items.${i}.discount_pct`} render={({ field }) => <NumberField ariaLabel="Descuento en porcentaje" min={0} max={100} value={field.value} onChange={field.onChange} invalid={!!errors.items?.[i]?.discount_pct} />} /></Field>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <button type="button" className={pill} onClick={() => h.append({ description: "", quantity: 1, unit_price_cents: 0, discount_pct: 0 })}><Plus size={15} aria-hidden />Otro concepto</button>
        {activeField && !activeDetail && <button type="button" className={pill} onClick={() => h.setDetail((d) => ({ ...d, [activeField.id]: true }))}><SlidersHorizontal size={14} aria-hidden className="hidden sm:block" />Cantidad o descuento</button>}
      </div>
    </section>
  );
}

/** Lo opcional, en una sola sección que se despliega: vencimiento y observaciones. Plegada, dice cómo está. */
export function OptionalFields({ h }: { h: BudgetFormHandle }) {
  const open = h.open.notes;
  const expired = h.errors.valid_until?.message;
  useEffect(() => { if (expired && !open) h.setOpen({ ...h.open, notes: true }); }, [expired]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = `${h.values.valid_until ? `Vence el ${formatDate(h.values.valid_until)}` : "Sin vencimiento"}${h.values.notes.trim() ? " · Con observaciones" : " · Observaciones"}`;
  return (
    <section aria-label="Más opciones" className="rounded-3xl border bg-white">
      <button type="button" aria-expanded={open} aria-controls="mas-opciones" onClick={() => h.setOpen({ ...h.open, notes: !open })}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-6">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} aria-hidden className="text-secondary" />Más opciones <span className="font-normal text-muted">(opcional)</span></span>
          {!open && <span className="mt-0.5 block truncate text-sm text-muted">{summary}</span>}
        </span>
        <ChevronDown aria-hidden size={20} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id="mas-opciones" className="space-y-4 border-t px-4 pb-4 pt-3 sm:px-6">
          <Field label="Fecha de vencimiento" hint="Hasta cuándo vale. Si no corresponde, dejalo vacío." error={expired}>
            <Controller control={h.control} name="valid_until" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} clearable placeholder="Sin vencimiento" />} />
          </Field>
          <Field label="Observaciones" hint="Se imprimen en el presupuesto.">
            <Controller control={h.control} name="notes" render={({ field }) => <Textarea aria-label="Observaciones" enterKeyHint="enter" className="min-h-24" value={field.value} onChange={field.onChange} placeholder="Condiciones, aclaraciones, formas de pago…" />} />
          </Field>
        </div>
      )}
    </section>
  );
}
