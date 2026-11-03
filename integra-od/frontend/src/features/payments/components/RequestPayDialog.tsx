import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Textarea } from "@/components/ui/input";
import { AmountField } from "@/components/shared/AmountField";
import { Field } from "@/components/shared/Field";
import { PercentQuick } from "@/components/shared/PercentQuick";
import { useSettings } from "@/app/providers";
import { useApi } from "@/hooks/useApi";
import { useCopy } from "@/hooks/useCopy";
import { usePatientPhone } from "@/hooks/usePatientPhone";
import { formatMoney } from "@/lib/currency";
import { percentOfCents } from "@/lib/percent";
import { whatsappUrl } from "@/lib/phone";
import { workOf } from "@/features/budgets/pages/BudgetsPage";
import type { Budget, RequestDetail } from "@/types";
import { createRequest, publicLink } from "../services/payments.service";

const KEY = "integraod.collect";
const savedPct = (): number => { try { return Number(JSON.parse(localStorage.getItem(KEY) ?? "{}").pct) || 30; } catch { return 30; } };

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void;
  /** Si se sabe el presupuesto pero hay que buscarlo (al pedir de nuevo uno vencido). */
  budgetId?: string;
  /** Si ya se sabe de qué presupuesto es (desde el presupuesto). */
  budget?: Pick<Budget, "id" | "patient_ref" | "total_cents" | "applied_cents" | "balance_cents" | "first_item" | "item_count"> & { requestable_cents?: number };
  initial?: { amount_cents?: number; conditions?: string };
}

/**
 * Pedir un pago con link de Mercado Pago. No es dinero recibido: queda como "esperando pago" hasta que se confirma.
 * Efectivo y transferencia no se piden: se registran cuando el dinero llegó ("Registrar pago").
 */
export function RequestPayDialog({ open, onOpenChange, onCreated, budgetId, budget: fixed, initial }: Props) {
  const { settings } = useSettings();
  const onlineReady = Boolean(settings?.mp_connected || settings?.mp_mock);
  const budgets = useApi<Budget[]>(fixed ? null : "/budgets");
  const candidates = useMemo(() => (budgets.data ?? []).filter((b) => b.balance_cents > 0 && b.status !== "cancelled"), [budgets.data]);
  const [pickedId, setPickedId] = useState(budgetId ?? "");
  useEffect(() => { if (!fixed && !pickedId && candidates.length === 1) setPickedId(candidates[0].id); }, [candidates, fixed, pickedId]);
  const budget = fixed ?? candidates.find((b) => b.id === pickedId);

  const limit = budget ? (fixed?.requestable_cents ?? budget.balance_cents) : 0;
  const [pct, setPct] = useState<number | null>(initial?.amount_cents ? null : savedPct());
  const [cents, setCents] = useState(initial?.amount_cents ?? 0);
  const [amountKey, setAmountKey] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [showDue, setShowDue] = useState(false);
  const [conditions, setConditions] = useState(initial?.conditions ?? "");
  const [showConditions, setShowConditions] = useState(Boolean(initial?.conditions));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<RequestDetail | null>(null);
  const { state: copyState, copy } = useCopy();
  const waPhone = usePatientPhone(created?.patient_ref ?? "");

  // Importe de partida: el porcentaje recordado del total (sin pasarse de lo que se puede pedir).
  useEffect(() => {
    if (!budget || initial?.amount_cents) return;
    const base = budget.applied_cents > 0 ? limit : Math.min(percentOfCents(budget.total_cents, pct ?? 30), limit);
    setCents(base); setAmountKey((k) => k + 1);
  }, [budget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (v: number) => { if (!budget) return; setPct(v); setCents(Math.min(percentOfCents(budget.total_cents, v), limit)); setAmountKey((k) => k + 1); };

  const submit = async () => {
    setError("");
    if (!budget) return setError("Elegí de qué presupuesto es el pedido.");
    if (cents <= 0) return setError("Ingresá cuánto vas a pedir.");
    if (cents > limit) return setError(`Lo máximo que podés pedir es ${formatMoney(limit)}.`);
    setBusy(true);
    try {
      const r = await createRequest({ method: "online", patient_ref: budget.patient_ref, amount_cents: cents, budget_id: budget.id, conditions, due_date: dueDate || null });
      if (pct) { try { localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), pct })); } catch { /* sin storage */ } }
      setCreated(r);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos crear el pedido.");
    } finally { setBusy(false); }
  };

  if (created) {
    const link = publicLink(created.public_id);
    const text = `Hola ${created.patient_ref}, te comparto el link para pagar ${created.concept} (${formatMoney(created.amount_cents)}): ${link}`;
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title={`Pediste ${formatMoney(created.amount_cents)}`} description="Todavía no es dinero recibido: queda esperando hasta que el pago se confirme.">
        <div className="space-y-4">
          <div className="select-all break-all rounded-lg bg-soft px-3 py-2 text-sm tabular">{link}</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => void copy(link)}>{copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}{copyState === "copied" ? "Copiado" : copyState === "failed" ? "No se pudo copiar" : "Copiar link"}</Button>
            <Button className="flex-1" variant="secondary" asChild><a href={whatsappUrl(waPhone, text)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Mandar por WhatsApp</a></Button>
          </div>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>Listo</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Pedir un pago" description="Generamos un link para que pague con Mercado Pago."
      footer={<Button className="w-full" disabled={busy || !onlineReady || !budget} onClick={() => void submit()}>Pedir {cents > 0 ? formatMoney(cents) : "pago"}</Button>}>
      <div className="space-y-5">
        {!onlineReady && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-[#7a5222]">Para pedir con link, primero conectá Mercado Pago en <Link to="/configuracion?seccion=mercadopago" className="font-medium underline">Configuración</Link>.</p>}
        {fixed
          ? <p className="rounded-lg bg-soft px-3 py-2 text-sm"><strong>{fixed.patient_ref}</strong> · {workOf(fixed)} · falta {formatMoney(fixed.balance_cents)}</p>
          : candidates.length === 0 && !budgets.loading
            ? <p className="rounded-lg bg-soft px-3 py-3 text-sm">No hay presupuestos con plata pendiente. Creá un presupuesto primero.</p>
            : <Field label="¿De qué presupuesto?"><Dropdown value={pickedId} onChange={setPickedId} placeholder="Buscá por cliente o concepto" options={candidates.map((b) => ({ value: b.id, label: b.patient_ref, hint: workOf(b), trailing: `Falta ${formatMoney(b.balance_cents)}` }))} /></Field>}
        {budget && (
          <>
            <div className="space-y-3">
              <PercentQuick selected={pct} onPick={pick} />
              <Field label="¿Cuánto?" hint={`Hasta ${formatMoney(limit)}. `}>
                <AmountField key={amountKey} valueCents={cents} onChange={(c) => { setCents(c); setPct(null); }} />
              </Field>
              {limit > 0 && <button type="button" onClick={() => { setPct(null); setCents(limit); setAmountKey((k) => k + 1); }} className="-mt-1 cursor-pointer text-sm font-medium text-secondary hover:underline">Pedir todo lo que falta ({formatMoney(limit)})</button>}
            </div>
            <div className="space-y-3 text-sm">
              {showDue ? <Field plain label="Vence"><DatePicker value={dueDate} onChange={setDueDate} clearable placeholder="Sin vencimiento" /></Field>
                : <button type="button" onClick={() => setShowDue(true)} className="cursor-pointer font-medium text-secondary hover:underline">+ Poner vencimiento</button>}
              {showConditions ? <Field label="Condiciones"><Textarea autoFocus className="min-h-16" value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Ej: El anticipo se retiene si cancelás con menos de 24 hs." /></Field>
                : <div><button type="button" onClick={() => setShowConditions(true)} className="cursor-pointer font-medium text-secondary hover:underline">+ Agregar condiciones</button></div>}
            </div>
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
