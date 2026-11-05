import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/shared/BackLink";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { BudgetDetail } from "@/types";
import { ClientField, ConceptsFields, OptionalFields } from "../components/BudgetFields";
import { PaymentModeRow } from "../components/PaymentModeRow";
import { useBudgetForm } from "../hooks/useBudgetForm";
import type { BudgetForm } from "../schemas/budget.schema";
import { switchToManual, updateBudget } from "../services/budgets.service";

/** Editar un presupuesto: todo en una pantalla, con el total siempre a la vista. (Crear uno nuevo es paso a paso: NewBudgetFlow.) */
export function BudgetEditorPage() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useApi<BudgetDetail>(`/budgets/${id}`);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorMessage message={error ?? "No encontramos el presupuesto."} onRetry={reload} />;
  return <Editor budget={data} />;
}

function Editor({ budget }: { budget: BudgetDetail }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const initial: BudgetForm = { patient_ref: budget.patient_ref, patient_id: budget.patient_id ?? "", issued_on: budget.issued_on, valid_until: budget.valid_until ?? "", notes: budget.notes, items: budget.items.map(({ description, detail, quantity, unit_price_cents, discount_pct }) => ({ description, detail: detail ?? "", quantity, unit_price_cents, discount_pct })) };
  const h = useBudgetForm(initial, Boolean(initial.notes));
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const submit = h.form.handleSubmit(async (v) => {
    setError("");
    try { const saved = await updateBudget(budget.id, v); navigate(`/presupuestos/${saved.id}`, { replace: true }); }
    catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar el presupuesto."); }
  });

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-0">
      <BackLink to={`/presupuestos/${budget.id}`}>presupuesto</BackLink>
      <PageHeader title="Editar presupuesto" icon={FilePlus2} />
      {budget.collects_online && <SwitchToManual budget={budget} />}
      <PaymentModeRow budgetId={budget.id} mode={budget.payment_mode} />
      <form onSubmit={submit} className="space-y-4">
        <ClientField h={h} />
        <ConceptsFields h={h} />
        <OptionalFields h={h} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t bg-white/95 px-4 py-3 backdrop-blur md:static md:z-auto md:rounded-2xl md:border md:bg-white md:p-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <div><p className="text-xs text-muted">Total</p><p className="text-2xl font-semibold tabular">{formatMoney(h.sum)}</p></div>
            <Button className="h-12 px-6 text-base" disabled={h.form.formState.isSubmitting}>Guardar cambios</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * Regla de negocio: si se cobra por Mercado Pago, el pago llega solo y no se carga a mano.
 * Para cobrar en efectivo o transferencia se pasa desde acá: se cierra el pedido por Mercado Pago.
 */
function SwitchToManual({ budget }: { budget: BudgetDetail }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = budget.requests.filter((r) => r.provider !== "cash" && (r.display_status === "pending" || r.display_status === "partially_paid")).reduce((s, r) => s + r.pending_cents, 0);
  const run = async () => {
    setBusy(true); setError("");
    try { await switchToManual(budget.id); navigate(`/presupuestos/${budget.id}`, { replace: true, state: { notice: "Listo: ahora se cobra en efectivo o transferencia." } }); }
    catch (e) { setError(e instanceof Error ? e.message : "No pudimos pasarlo."); setBusy(false); }
  };
  return (
    <section aria-label="Forma de cobro" className="mb-4 space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <p className="text-sm"><strong>Se cobra por Mercado Pago.</strong> Hay <strong className="tabular">{formatMoney(pending)}</strong> esperando.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="space-y-1.5">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void run()}>Pasar a efectivo o transferencia</Button>
        <p className="text-xs text-muted">Cancela el link de Mercado Pago.</p>
      </div>
    </section>
  );
}
