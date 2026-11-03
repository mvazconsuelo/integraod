import { useState, type ReactNode } from "react";
import { Field } from "@/components/shared/Field";
import { AmountField } from "@/components/shared/AmountField";
import { Plus } from "lucide-react";
import { TreatmentCombobox } from "@/features/budgets/components/TreatmentCombobox";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/currency";
import { BUDGET_STATUS_LABEL } from "@/lib/formatters";
import { useApi } from "@/hooks/useApi";
import type { Budget, Treatment } from "@/types";

export const NEW_BUDGET = "new";

interface Props {
  budgets: Budget[];
  budgetId: string;
  onBudgetChange: (id: string) => void;
  treatment: string;
  onTreatmentChange: (v: string) => void;
  totalCents: number;
  onTotalChange: (c: number) => void;
  errors: { budget_id?: string; new_treatment?: string; new_total_cents?: string };
  /** Campo de contacto: solo se pide al crear un presupuesto nuevo. */
  patientField?: ReactNode;
}

/** Elegir un presupuesto existente o crear uno ahí mismo con dos datos: el trabajo y el total. */
export function BudgetPicker({ budgets, budgetId, onBudgetChange, treatment, onTreatmentChange, totalCents, onTotalChange, errors, patientField }: Props) {
  const creating = budgetId === NEW_BUDGET;
  const catalog = useApi<Treatment[]>("/treatments");
  const [fillKey, setFillKey] = useState(0);

  return (
    <div className="space-y-3">
      <Field required label="Presupuesto" error={errors.budget_id} hint={creating ? undefined : "El pago se aplica solo a este presupuesto."}>
<Dropdown
          value={budgetId} onChange={onBudgetChange} placeholder="Elegí o escribí el contacto…" invalid={!!errors.budget_id}
          options={[
            ...budgets.map((b) => ({ value: b.id, label: b.patient_ref, hint: `Presupuesto N° ${String(b.number).padStart(4, "0")} · ${BUDGET_STATUS_LABEL[b.status]}${b.has_advance ? " · anticipo ya pedido" : ""}`, trailing: `Falta ${formatMoney(b.balance_cents)}` })),
            { value: NEW_BUDGET, label: "Crear presupuesto nuevo", hint: "Con el trabajo y el total, sin salir de acá", icon: <Plus size={16} className="text-primary" />, pinned: true },
          ]}
        />
      </Field>
      {creating && (
        <div className="rounded-lg border border-dashed p-3 space-y-3 bg-soft/40">
          <p className="text-xs text-muted">Se crea un presupuesto con un solo concepto. Después podés completarlo o editarlo.</p>
          {patientField}
          <Field required label="Trabajo" error={errors.new_treatment}>
            <TreatmentCombobox
              id="new-treatment" value={treatment} onChange={onTreatmentChange} catalog={catalog.data ?? []} invalid={!!errors.new_treatment}
              onPick={(t) => { onTreatmentChange(t.name); if (t.price_cents > 0) { onTotalChange(t.price_cents); setFillKey((k) => k + 1); } }}
            />
          </Field>
          <Field required label="Total del presupuesto" error={errors.new_total_cents} hint="El anticipo es una parte de este total.">
            <AmountField key={fillKey} valueCents={totalCents} onChange={onTotalChange} />
          </Field>
        </div>
      )}
    </div>
  );
}
