import { ChevronDown } from "lucide-react";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberField } from "@/components/ui/number-field";
import { Textarea } from "@/components/ui/input";
import { AmountField } from "@/components/shared/AmountField";
import { Field } from "@/components/shared/Field";
import { PatientPicker, type PickerHandle } from "@/components/shared/PatientPicker";
import type { BudgetFormHandle } from "../hooks/useBudgetForm";
import { TreatmentCombobox } from "./TreatmentCombobox";

const link = "cursor-pointer text-sm font-medium text-secondary hover:underline";

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
  return (
    <section aria-label="Conceptos" className="space-y-6 rounded-3xl border bg-white p-5 sm:p-6">
      {fields.map((f, i) => {
        const row = values.items?.[i];
        const showDetail = h.detail[f.id] ?? Boolean(row && (row.quantity !== 1 || row.discount_pct !== 0));
        return (
          <div key={f.id} className={`space-y-4 ${i > 0 ? "border-t pt-6" : ""}`}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`desc-${f.id}`} className="text-sm font-medium">Concepto {i + 1}<span className="text-danger" aria-hidden> *</span></label>
                {fields.length > 1 && <button type="button" className="cursor-pointer text-sm text-muted hover:text-danger hover:underline" onClick={() => h.remove(i)}>Quitar</button>}
              </div>
              <Controller control={control} name={`items.${i}.description`} render={({ field }) => <TreatmentCombobox id={`desc-${f.id}`} value={field.value} onChange={field.onChange} catalog={h.catalog} onPick={(t) => h.pickTreatment(i, f.id, t)} invalid={!!errors.items?.[i]?.description} />} />
              {errors.items?.[i]?.description && <p role="alert" className="text-xs text-danger">{errors.items[i]?.description?.message}</p>}
            </div>
            <Field label={showDetail ? "Precio de cada uno" : "Importe"} error={errors.items?.[i]?.unit_price_cents?.message}>
              <Controller control={control} name={`items.${i}.unit_price_cents`} render={({ field }) => <AmountField key={`${f.id}-${h.priceKeys[f.id] ?? 0}`} valueCents={field.value} onChange={field.onChange} />} />
            </Field>
            {showDetail && (
              <div className="grid grid-cols-2 gap-3">
                <Field plain label="Cantidad" error={errors.items?.[i]?.quantity?.message}><Controller control={control} name={`items.${i}.quantity`} render={({ field }) => <NumberField ariaLabel="Cantidad" min={1} max={999} value={field.value} onChange={field.onChange} invalid={!!errors.items?.[i]?.quantity} />} /></Field>
                <Field plain label="Descuento (%)" error={errors.items?.[i]?.discount_pct?.message}><Controller control={control} name={`items.${i}.discount_pct`} render={({ field }) => <NumberField ariaLabel="Descuento en porcentaje" min={0} max={100} value={field.value} onChange={field.onChange} invalid={!!errors.items?.[i]?.discount_pct} />} /></Field>
              </div>
            )}
            {!showDetail && <button type="button" className={link} onClick={() => h.setDetail((d) => ({ ...d, [f.id]: true }))}>Cantidad o descuento</button>}
          </div>
        );
      })}
      <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => h.append({ description: "", quantity: 1, unit_price_cents: 0, discount_pct: 0 })}>+ Agregar otro concepto</Button>
    </section>
  );
}

/** Lo opcional, a la vista y dicho con todas las letras. */
export function OptionalFields({ h }: { h: BudgetFormHandle }) {
  return (
    <section aria-label="Opcionales" className="space-y-5 rounded-3xl border bg-white p-5 sm:p-6">
      {/* Observaciones: un campo que se despliega y se vuelve a plegar */}
      <div className="rounded-2xl border">
        <button type="button" aria-expanded={h.open.notes} aria-controls="observaciones" onClick={() => h.setOpen({ ...h.open, notes: !h.open.notes })}
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Observaciones <span className="font-normal text-muted">(opcional)</span></span>
            {!h.open.notes && <span className="mt-0.5 block truncate text-sm text-muted">{h.values.notes ? h.values.notes.replace(/\s+/g, " ") : "Condiciones, aclaraciones, formas de pago…"}</span>}
          </span>
          <ChevronDown aria-hidden size={20} className={`shrink-0 text-muted transition-transform ${h.open.notes ? "rotate-180" : ""}`} />
        </button>
        {h.open.notes && (
          <div id="observaciones" className="border-t px-4 pb-4 pt-3">
            <Controller control={h.control} name="notes" render={({ field }) => <Textarea autoFocus aria-label="Observaciones" className="min-h-28" value={field.value} onChange={field.onChange} placeholder="Se imprimen en el presupuesto: condiciones, aclaraciones, formas de pago…" />} />
          </div>
        )}
      </div>
      <Field label="Fecha de vencimiento" hint="Hasta cuándo vale este presupuesto. Si no corresponde, dejalo vacío.">
        <Controller control={h.control} name="valid_until" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} clearable placeholder="Sin vencimiento" />} />
      </Field>
    </section>
  );
}
