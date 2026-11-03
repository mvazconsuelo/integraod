import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatientPicker } from "@/components/shared/PatientPicker";
import { Field } from "@/components/shared/Field";
import { AmountField } from "@/components/shared/AmountField";
import { BudgetPicker, NEW_BUDGET } from "@/components/shared/BudgetPicker";
import { formatMoney } from "@/lib/currency";
import { Dropdown } from "@/components/ui/dropdown";
import { useApi } from "@/hooks/useApi";
import { formatDate, today } from "@/lib/formatters";
import type { Budget, PaymentRequest } from "@/types";
import { manualFormSchema, type ManualForm } from "../schemas/payment.schema";
import { registerManual, resolveBudgetId } from "../services/payments.service";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void; requestId?: string; /** Links ya pedidos de este presupuesto que siguen abiertos. */ openRequests?: PaymentRequest[]; fixedBudget?: { id: string; patient_ref: string; applied_cents: number; balance_cents: number; has_advance?: boolean; first_item?: string | null; item_count?: number }; defaults?: Partial<Pick<ManualForm, "patient_ref" | "amount_cents" | "budget_id">> }

export function ManualPaymentDialog({ open, onOpenChange, onSaved, requestId, openRequests, fixedBudget, defaults }: Props) {
  const budgets = useApi<Budget[]>("/budgets");
  const [error, setError] = useState("");
  // Una clave por formulario abierto: si el pedido se repite (doble clic, reintento), el pago se registra una sola vez.
  const idempotencyKey = useRef(crypto.randomUUID());
  const { register, control, handleSubmit, setValue, setError: setFieldError, getValues, watch, formState: { errors, isSubmitting } } = useForm<ManualForm>({
    resolver: zodResolver(manualFormSchema),
    defaultValues: { patient_ref: fixedBudget?.patient_ref ?? "", patient_id: "", amount_cents: 0, method: "cash", paid_on: today(), budget_id: fixedBudget?.id ?? "", new_treatment: "", new_total_cents: 0, ...defaults },
  });

  const openBudgets = (budgets.data ?? []).filter((b) => b.balance_cents > 0 && b.status !== "cancelled");
  const [pickedBudget, treatment, total] = watch(["budget_id", "new_treatment", "new_total_cents"]);
  const [amountKey, setAmountKey] = useState(0);
  const [requestPick, setRequestPick] = useState("");

  // Si el efectivo paga un link ya pedido, se asocia: así el link se cierra y no se puede pagar dos veces.
  const pickRequest = (id: string) => {
    setRequestPick(id);
    const r = openRequests?.find((x) => x.id === id);
    if (r) { setValue("amount_cents", r.pending_cents, { shouldValidate: true }); setAmountKey((k) => k + 1); }
  };

  // Un pago manual no puede superar lo que falta del presupuesto.
  const limit = fixedBudget ? fixedBudget.balance_cents : openBudgets.find((b) => b.id === pickedBudget)?.balance_cents;
  const payAll = () => { setValue("amount_cents", limit ?? 0, { shouldValidate: true }); setAmountKey((k) => k + 1); };

  useEffect(() => {
    if (!budgets.data) return;
    const picked = openBudgets.find((b) => b.id === getValues("budget_id"));
    if (picked && !getValues("patient_ref")) setValue("patient_ref", picked.patient_ref);
    else if (openBudgets.length === 0 && !getValues("budget_id")) setValue("budget_id", NEW_BUDGET);
  }, [budgets.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickBudget = (id: string) => {
    setValue("budget_id", id, { shouldValidate: true });
    const b = openBudgets.find((x) => x.id === id);
    if (b) setValue("patient_ref", b.patient_ref);
  };

  const submit = handleSubmit(async (v) => {
    if (limit !== undefined && v.amount_cents > limit) {
      setFieldError("amount_cents", { type: "manual", message: `Al presupuesto le faltan ${formatMoney(limit)}.` });
      return;
    }
    try {
      const id = await resolveBudgetId(v);
      if (v.budget_id === NEW_BUDGET) { setValue("budget_id", id); void budgets.reload(); }
      await registerManual({ patient_ref: v.patient_ref, amount_cents: v.amount_cents, method: v.method, paid_on: v.paid_on, budget_id: id, request_id: requestId ?? (requestPick || null), notes: "", idempotency_key: idempotencyKey.current });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos registrar el pago.");
    }
  });

  return (
    <Dialog
      open={open} onOpenChange={onOpenChange} title="Registrar pago en efectivo" description="Para plata que recibís en mano. Queda identificado como carga manual."
      footer={<Button form="manual-form" className="w-full" disabled={isSubmitting}>Registrar pago en efectivo</Button>}
    >
      <form id="manual-form" onSubmit={submit} className="space-y-3 sm:space-y-4">
        {fixedBudget ? (
          <p className="rounded-lg bg-soft px-3 py-2 text-sm">Presupuesto de <strong>{fixedBudget.patient_ref}</strong> · falta cobrar {formatMoney(fixedBudget.balance_cents)}</p>
        ) : (
          <BudgetPicker
            patientField={<Controller control={control} name="patient_id" render={({ field }) => <PatientPicker autoFocus error={errors.patient_ref?.message} value={{ id: field.value, name: watch("patient_ref") }} onChange={(p) => { setValue("patient_ref", p.name, { shouldValidate: true }); field.onChange(p.id); }} />} />}
            budgets={openBudgets} budgetId={pickedBudget} onBudgetChange={pickBudget}
            treatment={treatment} onTreatmentChange={(v) => setValue("new_treatment", v, { shouldValidate: !!errors.new_treatment })}
            totalCents={total} onTotalChange={(c) => setValue("new_total_cents", c, { shouldValidate: !!errors.new_total_cents })}
            errors={{ budget_id: errors.budget_id?.message, new_treatment: errors.new_treatment?.message, new_total_cents: errors.new_total_cents?.message }}
          />
        )}
        {fixedBudget && openRequests && openRequests.length > 0 && (
          <Field label="¿Es el pago de un link ya pedido? (opcional)" hint="Si elegís uno, ese link se cierra y no se puede pagar de nuevo.">
            <Dropdown
              value={requestPick} onChange={pickRequest} placeholder="No, es un pago aparte"
              options={[{ value: "", label: "No, es un pago aparte" }, ...openRequests.map((r) => ({ value: r.id, label: r.concept, hint: `Pedido el ${formatDate(r.created_at)}`, trailing: `Falta ${formatMoney(r.pending_cents)}` }))]}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field required label="Importe" error={errors.amount_cents?.message} hint={limit !== undefined ? `Máx. ${formatMoney(limit)}` : undefined}><Controller control={control} name="amount_cents" render={({ field }) => <AmountField key={amountKey} valueCents={field.value} onChange={field.onChange} />} /></Field>
          <Field required label="Fecha" error={errors.paid_on?.message}><Controller control={control} name="paid_on" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} /></Field>
        </div>
        {limit !== undefined && limit > 0 && <button type="button" onClick={payAll} className="-mt-2 text-xs text-secondary font-medium hover:underline cursor-pointer">Pagó todo lo que falta ({formatMoney(limit)})</button>}
        <p className="hidden text-xs text-muted sm:block">* Campo obligatorio</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
