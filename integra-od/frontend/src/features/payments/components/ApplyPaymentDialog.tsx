import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Field } from "@/components/shared/Field";
import { AmountField } from "@/components/shared/AmountField";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { BUDGET_STATUS_LABEL, KIND_LABEL, formatDate } from "@/lib/formatters";
import type { Budget, Received } from "@/types";
import { applyPayment } from "../services/payments.service";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; budgetId?: string; balanceCents?: number; paymentId?: string }

/** Aplica dinero ya recibido a un presupuesto. Se puede abrir desde un presupuesto (elige pago) o desde un pago (elige presupuesto). */
export function ApplyPaymentDialog({ open, onOpenChange, onDone, budgetId, balanceCents, paymentId }: Props) {
  const received = useApi<Received[]>("/payments/received");
  const budgets = useApi<Budget[]>(budgetId ? null : "/budgets");
  const [pid, setPid] = useState(paymentId ?? "");
  const [bid, setBid] = useState(budgetId ?? "");
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => (received.data ?? []).filter((p) => p.available_cents > 0), [received.data]);
  const available = (received.data ?? []).find((p) => p.id === pid)?.available_cents ?? 0;
  const budget = budgetId ? undefined : budgets.data?.find((b) => b.id === bid);
  const balance = budgetId ? (balanceCents ?? 0) : (budget?.balance_cents ?? 0);
  const suggested = Math.max(0, Math.min(available, balance));
  const value = amount ?? suggested;
  const valid = pid && bid && value > 0 && value <= available && value <= balance;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await applyPayment(pid, bid, value); onOpenChange(false); onDone(); } catch (err) { setError(err instanceof Error ? err.message : "No pudimos usar el pago."); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open} onOpenChange={onOpenChange} title="Usar un pago ya recibido" description="Elegí a qué presupuesto corresponde. Se descuenta de lo que falta cobrar."
      footer={<Button form="apply-form" className="w-full" disabled={busy || !valid}>Confirmar</Button>}
    >
      <form id="apply-form" onSubmit={submit} className="space-y-3 sm:space-y-4">
        {!paymentId && (
          <Field required label="Pago recibido">
            <Dropdown
              value={pid} onChange={(v) => { setPid(v); setAmount(null); }} placeholder="Elegí un pago…" emptyText="No hay pagos sin presupuesto."
              options={options.map((p) => ({ value: p.id, label: p.patient_ref, hint: `${KIND_LABEL[p.kind]} · ${formatDate(p.paid_at)}`, trailing: `Sin usar ${formatMoney(p.available_cents)}` }))}
            />
          </Field>
        )}
        {!budgetId && (
          <Field required label="Presupuesto">
            <Dropdown
              value={bid} onChange={(v) => { setBid(v); setAmount(null); }} placeholder="Elegí un presupuesto…" emptyText="No hay presupuestos con algo por cobrar."
              options={(budgets.data ?? []).filter((b) => b.balance_cents > 0 && b.status !== "cancelled").map((b) => ({ value: b.id, label: b.patient_ref, hint: `Presupuesto N° ${String(b.number).padStart(4, "0")} · ${BUDGET_STATUS_LABEL[b.status]}`, trailing: `Falta ${formatMoney(b.balance_cents)}` }))}
            />
          </Field>
        )}
        {pid && bid && (
          <>
            <Field required label="¿Cuánto usar?" hint={`Sin usar del pago: ${formatMoney(available)} · Falta cobrar del presupuesto: ${formatMoney(balance)}`}>
              <AmountField key={`${pid}-${bid}`} valueCents={value} onChange={setAmount} />
            </Field>
            <dl className="rounded-lg bg-soft px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-muted">Después, al presupuesto le falta</dt><dd className="tabular font-medium">{formatMoney(Math.max(0, balance - value))}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Te queda sin usar de este pago</dt><dd className="tabular font-medium">{formatMoney(Math.max(0, available - value))}</dd></div>
            </dl>
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
