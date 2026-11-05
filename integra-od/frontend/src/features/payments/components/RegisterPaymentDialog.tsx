import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Segmented } from "@/components/ui/segmented";
import { AmountField } from "@/components/shared/AmountField";
import { Field } from "@/components/shared/Field";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { formatDate, today } from "@/lib/formatters";
import { workOf } from "@/features/budgets/pages/BudgetsPage";
import type { Budget, BudgetDetail } from "@/types";
import { registerManual } from "../services/payments.service";

type Method = "cash" | "transfer";
const KEY = "integraod.pay.method";
const lastMethod = (): Method => { try { return localStorage.getItem(KEY) === "transfer" ? "transfer" : "cash"; } catch { return "cash"; } };

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Recibe una frase para mostrar ("Registraste $30.000 de Dana. Faltan $70.000."). */
  onSaved: (message: string) => void;
  /** Si ya se sabe de qué presupuesto es. */
  budgetId?: string;
  /** Si el pago es de un pedido con link que ya existe: ese pedido se cierra. */
  requestId?: string;
}

/**
 * Registrar un pago que YA se recibió, en tres preguntas: ¿de qué presupuesto?, ¿cuánto? y ¿cómo te pagó?
 * (efectivo o transferencia). Los pagos de Mercado Pago no se registran acá: llegan solos.
 */
export function RegisterPaymentDialog({ open, onOpenChange, onSaved, budgetId, requestId }: Props) {
  const budgets = useApi<Budget[]>("/budgets");
  const owing = useMemo(() => (budgets.data ?? []).filter((b) => b.balance_cents > 0 && b.status !== "cancelled"), [budgets.data]);
  const [picked, setPicked] = useState(budgetId ?? "");
  // Un solo presupuesto con saldo: ya queda elegido.
  useEffect(() => { if (!picked && owing.length === 1) setPicked(owing[0].id); }, [owing, picked]);
  const budget = owing.find((b) => b.id === picked);
  const detail = useApi<BudgetDetail>(picked ? `/budgets/${picked}` : null);
  const links = (detail.data?.requests ?? []).filter((r) => r.provider !== "cash" && (r.display_status === "pending" || r.display_status === "partially_paid"));

  const [linkId, setLinkId] = useState(requestId ?? "");
  const [cents, setCents] = useState(0);
  const [amountKey, setAmountKey] = useState(0);
  const [method, setMethod] = useState<Method>(lastMethod);
  const [paidOn, setPaidOn] = useState(today());
  const [changingDate, setChangingDate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID()); // un doble toque no registra dos veces

  // Importe de partida: lo del pedido elegido o, si no, lo que falta del presupuesto.
  const prefill = (id: string) => {
    const link = (detail.data?.requests ?? []).find((r) => r.id === id);
    setCents(link ? link.pending_cents : budget?.balance_cents ?? 0);
    setAmountKey((k) => k + 1);
  };
  useEffect(() => { if (budget) { prefill(linkId); } }, [picked, detail.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setError("");
    if (!budget) return setError("Elegí de qué presupuesto es el pago.");
    if (cents <= 0) return setError("Ingresá cuánto te pagaron.");
    if (cents > budget.balance_cents) return setError(`A este presupuesto le faltan ${formatMoney(budget.balance_cents)}.`);
    setBusy(true);
    try {
      await registerManual({ patient_ref: budget.patient_ref, amount_cents: cents, method, paid_on: paidOn, budget_id: budget.id, request_id: linkId || null, notes: "", idempotency_key: key.current });
      try { localStorage.setItem(KEY, method); } catch { /* sin storage */ }
      const left = budget.balance_cents - cents;
      onOpenChange(false);
      onSaved(`Registraste ${formatMoney(cents)} de ${budget.patient_ref}. ${left > 0 ? `Faltan ${formatMoney(left)}.` : "Quedó todo cobrado."}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos registrar el pago.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Registrar pago" description="Para lo que ya te pagaron en mano o por transferencia."
      footer={<Button className="w-full" disabled={busy || !budget} onClick={() => void submit()}>Registrar {cents > 0 ? formatMoney(cents) : "pago"}</Button>}>
      <div className="space-y-5">
        {!budgetId && (
          budgets.loading && !budgets.data ? <p className="text-sm text-muted">Un momento…</p>
          : owing.length === 0 ? <p className="rounded-lg bg-soft px-3 py-3 text-sm">No hay presupuestos con plata pendiente. Creá un presupuesto primero.</p>
          : (
            <Field label="¿De qué presupuesto?">
              <Dropdown value={picked} onChange={(v) => { setPicked(v); setLinkId(""); }} placeholder="Buscá por destinatario o concepto"
                options={owing.map((b) => ({ value: b.id, label: b.patient_ref, hint: workOf(b), trailing: `Falta ${formatMoney(b.balance_cents)}` }))} />
            </Field>
          )
        )}
        {budget && budgetId && <p className="rounded-lg bg-soft px-3 py-2 text-sm"><strong>{budget.patient_ref}</strong> · {workOf(budget)} · falta {formatMoney(budget.balance_cents)}</p>}

        {budget && (
          <>
            {links.length > 0 && (
              <Field label="¿Es por un link de pago?" hint="Si lo es, ese link se cierra y no se puede pagar de nuevo. Si el destinatario pagó con el link, no lo registres: llega solo.">
                <Dropdown value={linkId} onChange={(v) => { setLinkId(v); prefill(v); }} placeholder="No, es otro pago"
                  options={[{ value: "", label: "No, es otro pago" }, ...links.map((r) => ({ value: r.id, label: r.concept, hint: `Link del ${formatDate(r.created_at)}`, trailing: `Falta ${formatMoney(r.pending_cents)}` }))]} />
              </Field>
            )}
            <Field label="¿Cuánto?" hint={`Hasta ${formatMoney(budget.balance_cents)}`}>
              <AmountField key={amountKey} valueCents={cents} onChange={setCents} />
            </Field>
            <Field plain label="¿Cómo te pagó?">
              <Segmented label="Cómo te pagó" value={method} onChange={setMethod} options={[{ value: "cash", label: "Efectivo" }, { value: "transfer", label: "Transferencia" }]} />
            </Field>
            <div className="text-sm text-muted">
              {changingDate
                ? <Field plain label="Fecha del pago"><DatePicker value={paidOn} onChange={setPaidOn} max={today()} /></Field>
                : <>{paidOn === today() ? "Hoy" : formatDate(paidOn)} · <button type="button" onClick={() => setChangingDate(true)} className="cursor-pointer font-medium text-secondary hover:underline">cambiar fecha</button></>}
            </div>
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
