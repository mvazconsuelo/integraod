import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { BackLink } from "@/components/shared/BackLink";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatTile } from "@/components/shared/StatTile";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { patientPath } from "@/lib/patients";
import { formatMoney } from "@/lib/currency";
import { feeLine } from "@/lib/fees";
import { KIND_LABEL, methodLabel, formatDate } from "@/lib/formatters";
import type { BudgetDetail, RequestDetail } from "@/types";
import { ApplyPaymentDialog } from "../components/ApplyPaymentDialog";
import { ManualPaymentDialog } from "../components/ManualPaymentDialog";
import { RequestFormDialog } from "../components/RequestFormDialog";
import { changeStatus } from "@/features/budgets/services/budgets.service";
import { cancelRequest } from "../services/payments.service";

export function PaymentDetailPage() {
  const { id = "" } = useParams();
  const { data: r, error, loading, reload } = useApi<RequestDetail>(`/payments/${id}`);
  const [manual, setManual] = useState(false);
  const [renewing, setRenewing] = useState(false);
  // Presupuesto que quedó sin cobros al cancelar este: se ofrece cancelarlo también.
  const [offerBudget, setOfferBudget] = useState<{ id: string; number: number; patient: string } | null>(null);
  const [busyBudget, setBusyBudget] = useState(false);
  const [applyId, setApplyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  if (loading && !r) return <Loading />;
  if (error || !r) return <ErrorMessage message={error ?? "No encontramos el cobro."} onRetry={reload} />;

  const open = r.display_status === "pending" || r.display_status === "partially_paid" || r.display_status === "expired";
  const cancel = async () => {
    try {
      await cancelRequest(id);
      await reload();
      // Un presupuesto sin ningún cobro activo ni pago se ve raro: se ofrece cancelarlo (no se hace solo: puede que vayas a pedir otro cobro).
      if (r.budget_id) {
        const b = await api<BudgetDetail>(`/budgets/${r.budget_id}`);
        const live = ["pending", "partially_paid", "paid"];
        if (b.status === "sent" && b.applied_cents === 0 && b.requests.every((x) => !live.includes(x.display_status))) {
          setOfferBudget({ id: b.id, number: b.number, patient: b.patient_ref });
        }
      }
    } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos cancelar."); }
  };
  const cancelBudget = async () => {
    if (!offerBudget) return;
    setBusyBudget(true);
    try { await changeStatus(offerBudget.id, "cancelled"); setOfferBudget(null); await reload(); } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos cancelar el presupuesto."); setOfferBudget(null); } finally { setBusyBudget(false); }
  };
  const expired = r.display_status === "expired";
  const isCash = r.provider === "cash"; // se cobra en mano: no tiene link de pago
  // Al pedirlo de nuevo, el cobro vencido (sin pagos) se cancela solo: no queda una deuda fantasma al lado del nuevo.
  const renewed = async () => {
    if (r.paid_cents === 0) { try { await cancelRequest(id); } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos cancelar el cobro vencido."); } }
    await reload();
  };

  return (
    <>
      <BackLink to="/cobros">cobros</BackLink>
      <PageHeader title={r.patient_ref} subtitle={`${r.concept} · solicitado el ${formatDate(r.created_at)}${r.due_date ? ` · vence el ${formatDate(r.due_date)}` : ""}`} action={<StatusBadge status={r.display_status} />} />
      <Link to={patientPath(r.patient_ref)} className="inline-block mb-4 mr-5 text-sm text-secondary font-medium hover:underline">Ver todo lo de {r.patient_ref}</Link>
      {r.budget_id && <Link to={`/presupuestos/${r.budget_id}`} className="inline-block mb-4 text-sm text-secondary font-medium hover:underline">Ver presupuesto N° {String(r.budget_number).padStart(4, "0")}</Link>}
      {actionError && <div className="mb-4"><ErrorMessage message={actionError} /></div>}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile label="Importe solicitado" value={formatMoney(r.amount_cents)} />
          <StatTile label="Pagado" value={formatMoney(r.paid_cents)} tone="success" />
          <StatTile label="Falta cobrar" value={formatMoney(r.pending_cents)} tone="primary" className="col-span-2 sm:col-span-1 order-first sm:order-none" />
        </div>

        <div className={open ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start" : ""}>
          <div className="min-w-0">
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-3">Pagos recibidos</h2>
          {r.payments.length === 0 ? <p className="text-sm text-muted">Todavía no se recibió ningún pago de este cobro.</p> : (
            <ul className="divide-y">
              {r.payments.map((p) => (
                <li key={p.id} className="py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{KIND_LABEL[p.kind]} · {methodLabel(p.method)}{p.source === "manual" && <span className="text-muted font-normal"> · carga manual</span>}{p.provider === "mock" && <span className="text-muted font-normal"> · simulado</span>}</p>
                    <p className="text-xs text-muted">{formatDate(p.paid_at)}{p.status !== "approved" && ` · ${p.status === "refunded" ? "Reembolsado" : "Anulado"}`}</p>
                    {p.applications.filter((a) => !a.voided_at).map((a) => <p key={a.id} className="text-xs text-muted">Suma {formatMoney(a.amount_cents)} al presupuesto N° {String(a.budget_number).padStart(4, "0")}</p>)}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right"><p className="tabular font-semibold">{formatMoney(p.amount_cents)}</p>{p.status === "approved" && feeLine(p) && <p className="text-xs text-muted tabular">{feeLine(p)}{p.provider === "mock" && " (simulada)"}</p>}{p.status === "approved" && <p className="text-xs text-muted tabular">Sin usar {formatMoney(p.available_cents)}</p>}</div>
                    {p.available_cents > 0 && <Button size="sm" onClick={() => setApplyId(p.id)}>Elegir presupuesto</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
          </div>
          <div className="lg:sticky lg:top-20">
        {open && expired && (
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Este cobro venció</h2>
              <p className="text-sm text-muted mt-1">{isCash ? "Pasó la fecha de vencimiento de este cobro." : "El link ya no se puede usar: si el contacto lo abre, ve que venció."}</p>
            </div>
            <ul className="divide-y rounded-lg border text-sm">
              <li className="p-3.5 space-y-2.5">
                <div><p className="font-medium">El contacto todavía quiere pagar</p><p className="text-xs text-muted">{isCash ? "Se anota un cobro nuevo y este se cancela solo." : "Se arma un link nuevo y este cobro se cancela solo."}</p></div>
                <Button size="sm" onClick={() => setRenewing(true)}><RefreshCw size={14} />Pedir de nuevo</Button>
              </li>
              <li className="p-3.5 space-y-2.5">
                <p className="font-medium">Ya te pagó en mano</p>
                <Button size="sm" variant="secondary" onClick={() => setManual(true)}>Registrar pago en efectivo</Button>
              </li>
              {r.paid_cents === 0 && (
                <li className="p-3.5 space-y-2.5">
                  <p className="font-medium">Ya no corresponde</p>
                  <Button size="sm" variant="danger" onClick={cancel}>Cancelar cobro</Button>
                </li>
              )}
            </ul>
          </Card>
        )}
        {open && !expired && isCash && (
          <Card className="p-5 space-y-3">
            <h2 className="text-base font-semibold">Cobro en efectivo</h2>
            <p className="text-sm text-muted">Se cobra en mano. Cuando el contacto pague, registrá el pago y se suma al presupuesto.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setManual(true)}>Registrar pago en efectivo</Button>
              {r.paid_cents === 0 && <Button size="sm" variant="danger" onClick={cancel}>Cancelar cobro</Button>}
            </div>
          </Card>
        )}
        {open && !expired && !isCash && (
          <Card className="p-5 space-y-3">
            <h2 className="text-base font-semibold">Cobro con link de pago</h2>
            <p className="text-sm text-muted">El link se comparte desde el presupuesto, junto con el PDF.</p>
            {!r.checkout_url && <p className="text-sm text-warning">Este cobro no tiene link de Mercado Pago (la cuenta no estaba conectada al crearlo). Podés registrar el pago a mano.</p>}
            <div className="flex flex-wrap gap-2">
              {r.budget_id && <Button size="sm" asChild><Link to={`/presupuestos/${r.budget_id}`}>Ir al presupuesto</Link></Button>}
              <Button size="sm" variant="secondary" onClick={() => setManual(true)}>Registrar pago en efectivo</Button>
              {r.paid_cents === 0 && <Button size="sm" variant="danger" onClick={cancel}>Cancelar cobro</Button>}
            </div>
          </Card>
        )}
          </div>
        </div>
      </div>

      {manual && <ManualPaymentDialog open onOpenChange={setManual} onSaved={reload} requestId={r.id} defaults={{ patient_ref: r.patient_ref, amount_cents: r.pending_cents, budget_id: r.budget_id ?? "" }} />}
      {offerBudget && (
        <Dialog open onOpenChange={(o) => !o && setOfferBudget(null)} title="¿Cancelar también el presupuesto?" description={`El presupuesto N° ${String(offerBudget.number).padStart(4, "0")} de ${offerBudget.patient} quedó sin cobros ni pagos. Si el contacto ya no sigue, cancelalo y deja de figurar como abierto.`}>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setOfferBudget(null)}>No, dejarlo</Button>
            <Button variant="danger" className="flex-1" disabled={busyBudget} onClick={() => void cancelBudget()}>Sí, cancelar presupuesto</Button>
          </div>
        </Dialog>
      )}
      {renewing && <RequestFormDialog open onOpenChange={setRenewing} onCreated={() => void renewed()} budgetId={r.budget_id ?? undefined} initial={{ amount_cents: r.pending_cents, conditions: r.conditions, method: isCash ? "cash" : "online" }} />}
      {applyId && <ApplyPaymentDialog open onOpenChange={() => setApplyId(null)} paymentId={applyId} onDone={reload} />}
    </>
  );
}
