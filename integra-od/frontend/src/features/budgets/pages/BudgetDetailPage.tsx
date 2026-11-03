import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { HandCoins, MessageCircle, Pencil, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/shared/BackLink";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaidBar } from "@/components/shared/PaidBar";
import { StatTile } from "@/components/shared/StatTile";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { ApplyPaymentDialog } from "@/features/payments/components/ApplyPaymentDialog";
import { CopyLinkButton } from "@/features/payments/components/CopyLinkButton";
import { ManualPaymentDialog } from "@/features/payments/components/ManualPaymentDialog";
import { RequestFormDialog } from "@/features/payments/components/RequestFormDialog";
import { VoidDialog } from "@/features/payments/components/VoidDialog";
import { useSettings } from "@/app/providers";
import { patientPath } from "@/lib/patients";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { KIND_LABEL, methodLabel, formatDate } from "@/lib/formatters";
import type { BudgetDetail, BudgetStatus } from "@/types";
import { BudgetSheet } from "../components/BudgetSheet";
import { BudgetStatusPanel } from "../components/BudgetStatusPanel";
import { BudgetTimeline } from "../components/BudgetTimeline";
import { CollectPanel } from "../components/CollectPanel";
import { ShareBudgetDialog } from "../components/ShareBudgetDialog";
import { changeStatus } from "../services/budgets.service";
import { printAs } from "@/lib/print";
import { workOf } from "./BudgetsPage";

/**
 * El detalle responde: qué trabajo es, cuánto cuesta, cuánto se recibió, cuánto falta y qué pasó.
 * Las acciones cambian según el estado: no se ofrece lo que no se puede hacer.
 */
export function BudgetDetailPage() {
  const { id = "" } = useParams();
  const { settings } = useSettings();
  const { data: b, error, loading, reload } = useApi<BudgetDetail>(`/budgets/${id}`);
  const [params, setParams] = useSearchParams();
  const [sharing, setSharing] = useState(params.get("compartir") === "1");
  const [registering, setRegistering] = useState(params.get("pagar") === "1");
  const [applying, setApplying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const collecting = params.get("cobrar") === "1";
  const clearParam = (key: string) => setParams((p) => { const n = new URLSearchParams(p); n.delete(key); return n; }, { replace: true });
  const closeCollect = () => clearParam("cobrar");
  // Los atajos de la lista (?compartir, ?pagar) abren su acción una vez y se limpian.
  useEffect(() => { if (params.has("compartir")) clearParam("compartir"); if (params.has("pagar")) clearParam("pagar"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (status: BudgetStatus) => {
    try { await changeStatus(id, status); setActionError(""); await reload(); } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos cambiar el estado."); }
  };
  const download = () => b && printAs(`Presupuesto N° ${String(b.number).padStart(4, "0")} - ${b.patient_ref}`);

  if (loading && !b) return <Loading />;
  if (error || !b) return <ErrorMessage message={error ?? "No encontramos el presupuesto."} onRetry={reload} />;

  const cancelled = b.status === "cancelled";
  const active = b.applications.filter((a) => !a.voided_at);
  const canCollect = !cancelled && b.balance_cents > 0;
  const canRequest = canCollect && b.requestable_cents > 0;
  const openRequests = b.requests.filter((r) => r.display_status === "pending" || r.display_status === "partially_paid");
  const fixedBudget = { id: b.id, patient_ref: b.patient_ref, total_cents: b.total_cents, applied_cents: b.applied_cents, balance_cents: b.balance_cents, requestable_cents: b.requestable_cents, has_advance: b.has_advance, first_item: b.first_item, item_count: b.item_count };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <BackLink to="/presupuestos">presupuestos</BackLink>
        <PageHeader title={b.patient_ref} subtitle={`${workOf(b)} · N° ${String(b.number).padStart(4, "0")} · ${formatDate(b.issued_on)}`} action={<StatusBadge kind="budget" status={b.status} />} mobileAction={<StatusBadge kind="budget" status={b.status} />} />
        <Link to={patientPath(b.patient_ref)} className="-mt-3 inline-block text-sm font-medium text-secondary hover:underline">Ver todo lo de {b.patient_ref}</Link>
      </div>

      {actionError && <ErrorMessage message={actionError} />}
      {collecting && settings && !cancelled && <CollectPanel budget={b} settings={settings} onChanged={() => void reload()} onShare={() => setSharing(true)} onClose={closeCollect} />}

      {/* Resumen de dinero */}
      <section aria-label="Dinero" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Total" value={formatMoney(b.total_cents)} />
          <StatTile label="Recibido" value={formatMoney(b.applied_cents)} tone="success" />
          <StatTile label="Falta cobrar" value={formatMoney(b.balance_cents)} tone="primary" className="col-span-2 order-first sm:order-none sm:col-span-1" />
        </div>
        <PaidBar percent={b.paid_percent} label="Ya pagado del total" />
      </section>

      {/* Acciones disponibles según el estado */}
      <div className="flex flex-wrap gap-2" aria-label="Acciones">
        {!cancelled && <Button onClick={() => setSharing(true)}><MessageCircle size={16} />Compartir</Button>}
        {canRequest && <Button variant="secondary" onClick={() => setRequesting(true)}><HandCoins size={16} />Pedir un pago</Button>}
        {canCollect && <Button variant="secondary" onClick={() => setRegistering(true)}><Wallet size={16} />Registrar pago</Button>}
        {!cancelled && <Button variant="ghost" asChild><Link to={`/presupuestos/${b.id}/editar`}><Pencil size={16} />Editar</Link></Button>}
      </div>

      {/* El trabajo */}
      <Card className="p-4 sm:p-5">
        <h2 className="mb-2 text-base font-semibold">El trabajo</h2>
        <ul className="divide-y text-sm">
          {b.items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{i.description}</p>
                {(i.quantity > 1 || i.discount_pct > 0) && <p className="text-xs text-muted">{i.quantity > 1 && <>{i.quantity} × {formatMoney(i.unit_price_cents)}</>}{i.quantity > 1 && i.discount_pct > 0 && " · "}{i.discount_pct > 0 && <>{i.discount_pct}% de descuento</>}</p>}
              </div>
              <span className="shrink-0 tabular font-medium">{formatMoney(i.total_cents)}</span>
            </li>
          ))}
        </ul>
        {b.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-soft/60 p-3 text-xs text-muted">{b.notes}</p>}
      </Card>

      {/* Pendientes de pago */}
      {openRequests.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-1 text-base font-semibold">Pedidos sin pagar</h2>
          <p className="mb-2 text-xs text-muted">Pedir un pago no es cobrarlo: cuenta como recibido cuando se confirma.</p>
          <ul className="divide-y">
            {openRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <Link to={`/cobros/${r.id}`} className="font-medium hover:underline">{r.concept}</Link>
                  <p className="text-xs text-muted">{r.provider === "cash" ? "Para cobrar en efectivo" : "Con link de pago"}{r.due_date && ` · vence el ${formatDate(r.due_date)}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right"><p className="tabular font-medium">{formatMoney(r.pending_cents)}</p><StatusBadge status={r.display_status} /></div>
                  {r.provider !== "cash" && <CopyLinkButton publicId={r.public_id} iconOnly />}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Pagos recibidos */}
      {(active.length > 0 || canCollect) && (
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Pagos recibidos</h2>
            {canCollect && <Button size="sm" variant="ghost" onClick={() => setApplying(true)}>Usar un pago ya recibido</Button>}
          </div>
          {active.length === 0 ? <p className="text-sm text-muted">Todavía no se recibió ningún pago.</p> : (
            <ul className="divide-y">
              {active.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{KIND_LABEL[a.kind]} · {methodLabel(a.method)}{a.provider === "mock" && <span className="font-normal text-muted"> · simulado</span>}</p>
                    <p className="text-xs text-muted">{formatDate(a.paid_at)}</p>
                  </div>
                  <div className="flex items-center gap-2"><span className="tabular font-medium">{formatMoney(a.amount_cents)}</span><Button size="sm" variant="ghost" onClick={() => setVoiding(a.id)}>Anular</Button></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Historial */}
      <BudgetTimeline events={b.timeline} />

      <BudgetStatusPanel budget={b} onChange={setStatus} />

      {settings && <BudgetSheet budget={b} settings={settings} />}
      {sharing && settings && <ShareBudgetDialog open onOpenChange={setSharing} budget={b} settings={settings} onDownload={download} onChanged={() => void reload()} />}
      {requesting && <RequestFormDialog open onOpenChange={setRequesting} onCreated={() => void reload()} fixedBudget={fixedBudget} />}
      {registering && <ManualPaymentDialog open onOpenChange={setRegistering} onSaved={() => void reload()} fixedBudget={fixedBudget} openRequests={openRequests} />}
      {applying && <ApplyPaymentDialog open onOpenChange={setApplying} budgetId={b.id} balanceCents={b.balance_cents} onDone={reload} />}
      {voiding && <VoidDialog open onOpenChange={() => setVoiding(null)} title="Anular aplicación" path={`/payments/applications/${voiding}/void`} onDone={reload} />}
    </div>
  );
}
