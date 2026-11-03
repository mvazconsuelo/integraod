import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, MessageCircle } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { useCopy } from "@/hooks/useCopy";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/app/providers";
import { today } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { PatientPicker } from "@/components/shared/PatientPicker";
import { Field } from "@/components/shared/Field";
import { AmountField } from "@/components/shared/AmountField";
import { PercentQuick } from "@/components/shared/PercentQuick";
import { percentOfCents } from "@/lib/percent";
import { BudgetPicker, NEW_BUDGET } from "@/components/shared/BudgetPicker";
import { useApi } from "@/hooks/useApi";
import { usePatientPhone } from "@/hooks/usePatientPhone";
import { whatsappUrl } from "@/lib/phone";
import { formatMoney } from "@/lib/currency";
import type { Budget, RequestDetail } from "@/types";
import { requestFormSchema, type RequestForm } from "../schemas/payment.schema";
import { createRequest, publicLink, registerManual, resolveBudgetId } from "../services/payments.service";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void; budgetId?: string; /** Valores de partida (por ejemplo, al pedir de nuevo un cobro vencido). */ initial?: { amount_cents?: number; conditions?: string; method?: "online" | "cash" }; /** Si viene del presupuesto, ya está definido y no se vuelve a elegir. */ fixedBudget?: { id: string; patient_ref: string; total_cents?: number; applied_cents: number; balance_cents: number; requestable_cents?: number; has_advance?: boolean; first_item?: string | null; item_count?: number } }

export function RequestFormDialog({ open, onOpenChange, onCreated, budgetId, initial, fixedBudget }: Props) {
  const budgets = useApi<Budget[]>("/budgets");
  const [created, setCreated] = useState<RequestDetail | null>(null);
  const waPhone = usePatientPhone(created?.patient_ref ?? "");
  const { state: copyState, copy: copyText } = useCopy();
  const [error, setError] = useState("");
  // Cómo te va a pagar: con link de Mercado Pago o en efectivo. Sin Mercado Pago conectado, solo efectivo.
  const { settings } = useSettings();
  const onlineReady = Boolean(settings?.mp_connected || settings?.mp_mock);
  const [chosen, setChosen] = useState<"online" | "cash" | null>(initial?.method ?? null);
  const method = chosen ?? (onlineReady ? "online" : "cash");
  const [paidNow, setPaidNow] = useState(false);
  const [showConditions, setShowConditions] = useState(Boolean(initial?.conditions));
  const [paidOn, setPaidOn] = useState(today());
  const paymentKey = useRef(crypto.randomUUID()); // si el pedido se repite, el pago se registra una sola vez
  const [cashDone, setCashDone] = useState<{ id: string; state: "paid" | "pending" | "unpaid"; message?: string } | null>(null);
  const { register, control, handleSubmit, setValue, setError: setFieldError, getValues, watch, formState: { errors, isSubmitting } } = useForm<RequestForm>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: { patient_ref: fixedBudget?.patient_ref ?? "", patient_id: "", amount_cents: initial?.amount_cents ?? (fixedBudget && fixedBudget.applied_cents > 0 ? (fixedBudget.requestable_cents ?? 0) : 0), budget_id: fixedBudget?.id ?? budgetId ?? "", new_treatment: "", new_total_cents: 0, conditions: initial?.conditions ?? "", due_date: "" },
  });

  const openBudgets = (budgets.data ?? []).filter((b) => b.status !== "cancelled" && b.balance_cents > 0);
  const [pickedBudget, treatment, total] = watch(["budget_id", "new_treatment", "new_total_cents"]);
  const [amountKey, setAmountKey] = useState(0);
  const [mode, setMode] = useState<"part" | "all">("part");
  // Atajo para pedir un porcentaje del total del presupuesto (el importe se calcula y se puede ajustar a mano).
  const [pct, setPct] = useState<{ value: number; capped: boolean } | null>(null);

  // Lo máximo que se puede pedir: lo que falta del presupuesto (menos lo ya pedido sin pagar, si se sabe).
  const limit = fixedBudget ? (fixedBudget.requestable_cents ?? fixedBudget.balance_cents) : openBudgets.find((b) => b.id === pickedBudget)?.balance_cents;

  // Cobro total: se pide todo lo que falta (o el total del presupuesto nuevo), sin escribir importe.
  const pickedExisting = fixedBudget ?? openBudgets.find((b) => b.id === pickedBudget);
  const hasAdvance = Boolean(pickedExisting?.has_advance);
  const allCents = limit ?? (pickedBudget === NEW_BUDGET ? total : undefined);
  const baseTotal = fixedBudget?.total_cents ?? openBudgets.find((b) => b.id === pickedBudget)?.total_cents ?? (pickedBudget === NEW_BUDGET ? total : 0);
  useEffect(() => setPct(null), [pickedBudget, mode]);
  const pickPercent = (value: number) => {
    const wanted = percentOfCents(baseTotal, value);
    const cents = limit !== undefined ? Math.min(wanted, limit) : wanted; // nunca más de lo que se puede pedir
    setValue("amount_cents", cents, { shouldValidate: true });
    setAmountKey((k) => k + 1);
    setPct({ value, capped: cents < wanted });
  };
  useEffect(() => {
    if (mode === "all" && allCents) { setValue("amount_cents", allCents, { shouldValidate: true }); setAmountKey((k) => k + 1); }
  }, [mode, allCents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al cargar los presupuestos: si ya viene uno elegido, se completa el contacto; si no hay ninguno, queda listo para crear uno.
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
      setFieldError("amount_cents", { type: "manual", message: limit === 0 ? "Ya pediste todo lo que falta de este presupuesto." : `Lo máximo que podés pedir es ${formatMoney(limit)}.` });
      return;
    }
    try {
      const id = await resolveBudgetId(v);
      if (v.budget_id === NEW_BUDGET) { setValue("budget_id", id); void budgets.reload(); } // si falla lo siguiente, no se duplica
      const request = await createRequest({ method, patient_ref: v.patient_ref, amount_cents: v.amount_cents, conditions: v.conditions, budget_id: id, due_date: v.due_date || null });
      if (method === "online") {
        setCreated(request);
      } else if (paidNow) {
        // Ya cobró en mano: se registra el pago contra el cobro recién creado. Si esto falla, el cobro queda pendiente y se puede registrar desde su pantalla.
        try {
          await registerManual({ patient_ref: v.patient_ref, amount_cents: v.amount_cents, method: "cash", paid_on: paidOn, budget_id: id, request_id: request.id, notes: "", idempotency_key: paymentKey.current });
          setCashDone({ id: request.id, state: "paid" });
        } catch (e) {
          setCashDone({ id: request.id, state: "unpaid", message: e instanceof Error ? e.message : undefined });
        }
      } else {
        setCashDone({ id: request.id, state: "pending" });
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos crear el cobro.");
    }
  });

  if (cashDone) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title={cashDone.state === "paid" ? "Pago registrado" : cashDone.state === "pending" ? "Cobro anotado" : "Cobro creado"}>
        <div className="space-y-4">
          <p className="text-sm">
            {cashDone.state === "paid" ? "El pago en efectivo quedó registrado y se sumó al presupuesto."
              : cashDone.state === "pending" ? "Queda pendiente. Cuando el contacto te pague en mano, entrá al cobro y registrá el pago."
              : `Se creó el cobro, pero no pudimos registrar el pago${cashDone.message ? `: ${cashDone.message}` : ""}. Registralo desde el cobro.`}
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" variant="secondary" asChild><Link to={`/cobros/${cashDone.id}`}>Ver cobro</Link></Button>
            <Button className="flex-1" onClick={() => onOpenChange(false)}>Listo</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  if (created) {
    const link = publicLink(created.public_id);
    const text = `Hola ${created.patient_ref}, te comparto el link para pagar ${created.concept} (${formatMoney(created.amount_cents)}): ${link}`;
    const copy = () => void copyText(link);
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title="Cobro creado" description="Compartí este link con el contacto.">
        <div className="space-y-4">
          <div className="rounded-lg bg-soft px-3 py-2 text-sm break-all tabular select-all">{link}</div>
          {!created.checkout_url && (
            <p className="text-sm text-warning bg-warning/10 rounded-lg px-3 py-2">Todavía no conectaste Mercado Pago, así que el contacto no podrá pagar online con este link. Conectalo en Configuración o registrá el pago a mano cuando lo recibas.</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1" onClick={copy}>{copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}{copyState === "copied" ? "Copiado" : copyState === "failed" ? "No se pudo copiar" : "Copiar link"}</Button>
            <Button className="flex-1" variant="secondary" asChild><a href={whatsappUrl(waPhone, text)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Compartir por WhatsApp</a></Button>
          </div>
          {copyState === "failed" && <p role="alert" className="text-xs text-danger">Tu navegador no dejó copiar. Tocá el link de arriba para seleccionarlo y copialo a mano.</p>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open} onOpenChange={onOpenChange} title="Solicitar cobro"
      description={method === "cash" ? "Queda anotado para registrar el pago cuando el contacto te pague en mano." : "Generamos un link para que el contacto pague con Mercado Pago."}
      footer={<Button form="request-form" className="w-full" disabled={isSubmitting}>{method === "online" ? "Crear link de pago" : paidNow ? "Registrar pago en efectivo" : "Crear cobro"}</Button>}
    >
      <form id="request-form" onSubmit={submit} className="space-y-3 sm:space-y-4">
        {fixedBudget ? (
          <p className="rounded-lg bg-soft px-3 py-2 text-sm">Presupuesto de <strong>{fixedBudget.patient_ref}</strong> · falta cobrar {formatMoney(fixedBudget.balance_cents)}{limit !== undefined && limit < fixedBudget.balance_cents && <> · ya pediste {formatMoney(fixedBudget.balance_cents - limit)} sin pagar</>}</p>
        ) : (
          <BudgetPicker
            patientField={<Controller control={control} name="patient_id" render={({ field }) => <PatientPicker autoFocus error={errors.patient_ref?.message} value={{ id: field.value, name: watch("patient_ref") }} onChange={(p) => { setValue("patient_ref", p.name, { shouldValidate: true }); field.onChange(p.id); }} />} />}
            budgets={openBudgets} budgetId={pickedBudget} onBudgetChange={pickBudget}
            treatment={treatment} onTreatmentChange={(v) => setValue("new_treatment", v, { shouldValidate: !!errors.new_treatment })}
            totalCents={total} onTotalChange={(c) => setValue("new_total_cents", c, { shouldValidate: !!errors.new_total_cents })}
            errors={{ budget_id: errors.budget_id?.message, new_treatment: errors.new_treatment?.message, new_total_cents: errors.new_total_cents?.message }}
          />
        )}
        <Field plain label="¿Cómo te va a pagar?">
          <Segmented
            label="Cómo te va a pagar" value={method} onChange={(v) => { setChosen(v); if (v === "online") setPaidNow(false); }}
            options={[{ value: "online", label: "Mercado Pago", disabled: !onlineReady }, { value: "cash", label: "Efectivo" }]}
          />
          {!onlineReady && <p className="mt-1.5 text-xs text-muted">Para pedir con link, primero conectá Mercado Pago en <Link to="/configuracion?seccion=mercadopago" className="font-medium text-secondary underline underline-offset-2">Configuración</Link>.</p>}
        </Field>
        <Field label="¿Qué querés pedir?">
          <Segmented label="Qué querés pedir" value={mode} onChange={setMode} options={[{ value: "part", label: hasAdvance ? "Un pago parcial" : "Un anticipo" }, { value: "all", label: hasAdvance ? "Todo lo que falta" : "El cobro total" }]} />
        </Field>
        {mode === "part" && baseTotal > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Calcular como porcentaje del presupuesto</p>
            <PercentQuick selected={pct?.value ?? null} onPick={pickPercent} />
            {pct && (
              <p className="text-xs text-muted tabular">
                {pct.value} % de {formatMoney(baseTotal)} = <strong className="font-semibold text-foreground">{formatMoney(getValues("amount_cents"))}</strong>
                {pct.capped && " (ajustado al máximo que se puede pedir)"}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {mode === "all" ? (
            <Field label="Importe a pedir" hint={hasAdvance ? "Todo lo que falta cobrar." : "El total del presupuesto."}>
              <p className="h-10 rounded-lg bg-soft px-3 flex items-center text-sm font-medium tabular">{allCents ? formatMoney(allCents) : "Elegí un presupuesto"}</p>
            </Field>
          ) : (
            <Field required label="Importe a pedir" error={errors.amount_cents?.message} hint={limit !== undefined ? `Máximo: ${formatMoney(limit)}` : undefined}>
              <Controller control={control} name="amount_cents" render={({ field }) => <AmountField key={amountKey} valueCents={field.value} onChange={(c) => { field.onChange(c); setPct(null); }} />} />
            </Field>
          )}
          {method === "cash" && paidNow
            ? <Field label="Fecha del pago"><DatePicker value={paidOn} max={today()} onChange={setPaidOn} /></Field>
            : <Field label="Vence (opcional)"><Controller control={control} name="due_date" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} clearable placeholder="Sin vencimiento" />} /></Field>}
        </div>
        {method === "cash" && (
          <div className="rounded-lg border p-3">
            <Switch checked={paidNow} onChange={setPaidNow} label="Ya me pagó" hint="Se registra el pago ahora y se suma al presupuesto." />
          </div>
        )}
        {/* Las condiciones son opcionales: quedan plegadas para que el formulario sea corto */}
        {showConditions ? (
          <Field label="Condiciones (opcional)"><Textarea autoFocus={!initial?.conditions} className="min-h-16 sm:min-h-24" {...register("conditions")} placeholder="Ej: El anticipo se retiene si cancelás con menos de 24 hs." /></Field>
        ) : (
          <button type="button" onClick={() => setShowConditions(true)} className="text-sm font-medium text-secondary cursor-pointer hover:underline">+ Agregar condiciones</button>
        )}
        <p className="hidden text-xs text-muted sm:block">* Campo obligatorio</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
