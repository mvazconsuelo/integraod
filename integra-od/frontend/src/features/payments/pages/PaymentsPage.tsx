import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader } from "@/components/shared/PageHeader";
import { ActivityTabs } from "@/components/shared/ActivityTabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { SearchBox, normText } from "@/components/shared/SearchBox";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { KIND_LABEL, methodLabel, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { feeLine } from "@/lib/fees";
import type { PaymentRequest, Received, ReviewItem } from "@/types";
import { CopyLinkButton } from "../components/CopyLinkButton";
import { ApplyPaymentDialog } from "../components/ApplyPaymentDialog";
import { RequestFormDialog } from "../components/RequestFormDialog";
import { ManualPaymentDialog } from "../components/ManualPaymentDialog";
import { VoidDialog } from "../components/VoidDialog";

type Tab = "pendientes" | "recibidos" | "revisar";
const OPEN = ["pending", "partially_paid", "expired"];

/** Cobros: dos grupos, lo que te deben (pendientes) y lo que ya recibiste. Pedir un pago no es cobrarlo. */
export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (["recibidos", "revisar"].includes(params.get("tab") ?? "") ? params.get("tab") : "pendientes") as Tab;
  const onlyExpired = params.get("estado") === "vencidos";
  const creating = params.get("nuevo") === "1";
  const registering = params.get("pago") === "1"; // anotar un pago que ya se recibió
  const setFlag = (key: string, on: boolean) =>
    setParams((p) => { const n = new URLSearchParams(p); if (on) n.set(key, "1"); else { n.delete(key); n.delete("presupuesto"); } return n; }, { replace: !on });
  const [applyId, setApplyId] = useState<string | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<PaymentRequest | null>(null);
  const requests = useApi<PaymentRequest[]>("/payments");
  const received = useApi<Received[]>("/payments/received");
  // Pagos que un proveedor aprobó pero no coinciden con ningún cobro (otro importe, otra moneda, referencia desconocida).
  const review = useApi<ReviewItem[]>("/payments/review");
  const reviewItems = review.data ?? [];
  const [dismissId, setDismissId] = useState<string | null>(null);
  const reloadAll = () => { void requests.reload(); void received.reload(); void review.reload(); };

  const [query, setQuery] = useState("");
  const q = normText(query.trim());
  const found = (r: PaymentRequest) => !q || normText(r.patient_ref).includes(q) || normText(r.concept).includes(q) || String(r.budget_number ?? "").padStart(4, "0").includes(q.replace(/^0+/, "") || q);
  const open = (requests.data ?? []).filter((r) => OPEN.includes(r.display_status));
  const shown = open.filter((r) => found(r) && (!onlyExpired || r.display_status === "expired"));
  const owed = open.reduce((sum, r) => sum + r.pending_cents, 0);
  const unapplied = (received.data ?? []).reduce((sum, p) => sum + p.available_cents, 0);

  const newBtn = <div className="flex flex-wrap gap-2"><Button onClick={() => setFlag("nuevo", true)}><Plus size={16} />Solicitar cobro</Button><Button variant="secondary" onClick={() => setFlag("pago", true)}><Wallet size={16} />Registrar pago</Button></div>;

  return (
    <>
      <ActivityTabs />
      <PageHeader title="Cobros" subtitle="Lo que te deben y lo que ya recibiste." action={newBtn} mobileAction={<Button size="sm" onClick={() => setFlag("nuevo", true)}><Plus size={14} />Solicitar</Button>} />
      <div className="mb-5 max-w-md">
        <Segmented
          label="Qué ver" value={tab} onChange={(k) => setParams(k === "pendientes" ? {} : { tab: k })}
          options={[
            { value: "pendientes", label: `Pendientes${open.length ? ` · ${open.length}` : ""}` },
            { value: "recibidos", label: "Recibidos" },
            ...(reviewItems.length > 0 || tab === "revisar" ? [{ value: "revisar" as const, label: `Para revisar · ${reviewItems.length}` }] : []),
          ]}
        />
      </div>

      {tab === "pendientes" && (
        <>
          {requests.error && <ErrorMessage message={requests.error} onRetry={requests.reload} />}
          {requests.loading && !requests.data && <Loading />}
          {requests.data && open.length === 0 && <EmptyState message="No tenés cobros pendientes. Cuando pidas un pago, aparece acá hasta que te paguen." action={newBtn} />}
          {open.length > 0 && (
            <div className="mb-5 space-y-3">
              <p className="text-sm"><span className="text-muted">En total te deben </span><strong className="text-lg tabular">{formatMoney(owed)}</strong></p>
              <SearchBox label="Buscar cobro" placeholder="Buscar por nombre o número" value={query} onChange={setQuery} />
              {onlyExpired && <p className="text-sm text-muted">Mostrando solo los vencidos. <button type="button" onClick={() => setParams({}, { replace: true })} className="cursor-pointer font-medium text-secondary underline">Ver todos</button></p>}
            </div>
          )}
          {open.length > 0 && shown.length === 0 && <EmptyState message="No encontramos cobros con esa búsqueda." />}
          {shown.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Cobros pendientes">
              {shown.map((r) => (
                <li key={r.id} className="flex min-w-0 flex-col rounded-2xl border bg-white shadow-[0_8px_24px_-18px_rgba(23,59,54,0.3)]">
                  <Link to={`/cobros/${r.id}`} className="block space-y-3 rounded-t-2xl p-4 hover:bg-soft/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold leading-tight">{r.patient_ref}</p>
                        <p className="truncate text-sm text-muted">{r.concept}{r.budget_id && ` · Presupuesto N° ${String(r.budget_number).padStart(4, "0")}`}</p>
                      </div>
                      <StatusBadge status={r.display_status} />
                    </div>
                    <p className="text-2xl font-semibold tracking-tight tabular"><span className="mr-1.5 text-sm font-normal text-muted">Falta</span>{formatMoney(r.pending_cents)}</p>
                    <p className="text-xs text-muted tabular">Pediste {formatMoney(r.amount_cents)} · Recibiste {formatMoney(r.paid_cents)} · {formatDate(r.created_at)}{r.due_date && ` · vence el ${formatDate(r.due_date)}`}</p>
                  </Link>
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => setPayFor(r)}><Wallet size={14} />Registrar pago</Button>
                    {r.provider !== "cash" && r.display_status !== "expired" && <CopyLinkButton publicId={r.public_id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "recibidos" && (
        <>
          {received.error && <ErrorMessage message={received.error} onRetry={received.reload} />}
          {received.loading && !received.data && <Loading />}
          {received.data?.length === 0 && <EmptyState message="Todavía no recibiste pagos. Cuando un contacto pague, o registres un pago a mano, va a aparecer acá." />}
          {received.data && received.data.length > 0 && (
            <Card className="divide-y">
              {received.data.map((p) => (
                <div key={p.id} className={cn("p-4 flex flex-wrap items-center justify-between gap-3", p.status !== "approved" && "opacity-60")}>
                  <div className="min-w-0">
                    <p className="font-medium">{p.patient_ref} <span className="text-muted font-normal">· {KIND_LABEL[p.kind]}</span></p>
                    <p className="text-xs text-muted">{formatDate(p.paid_at)} · {methodLabel(p.method)}{p.source === "manual" && " · carga manual"}{p.provider === "mock" && " · simulado"}{p.status !== "approved" && ` · ${p.status === "refunded" ? "Reembolsado" : "Anulado"}`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="tabular font-semibold">{formatMoney(p.amount_cents)}</p>
                      {p.status === "approved" && feeLine(p) && <p className="text-xs tabular text-muted">{feeLine(p)}{p.provider === "mock" && " (simulada)"}</p>}
                      {p.status === "approved" && <p className="text-xs tabular text-muted">{p.available_cents > 0 ? <span className="text-warning font-medium">{formatMoney(p.available_cents)} sin presupuesto</span> : "Ya está en un presupuesto"}</p>}
                    </div>
                    {p.available_cents > 0 && <Button size="sm" onClick={() => setApplyId(p.id)}>Elegir presupuesto</Button>}
                    {p.status === "approved" && p.source === "manual" && <Button size="sm" variant="ghost" onClick={() => setVoidId(p.id)}>Anular</Button>}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === "revisar" && (
        <>
        <p className="mb-4 rounded-lg bg-warning/10 px-4 py-3 text-sm text-[#7a5222]">
          Estos pagos fueron aprobados por el proveedor pero <strong>no coinciden con ningún cobro</strong>: otro importe, otra moneda o un cobro que no existe. No se cuentan como dinero cobrado. Verificalos en tu cuenta y, cuando los resuelvas, marcalos como revisados.
        </p>
        {reviewItems.length === 0 ? <EmptyState message="No hay pagos para revisar." /> : (
          <Card className="divide-y">
            {reviewItems.map((r) => (
              <div key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{methodLabel(r.provider)} · pago {r.provider_payment_id}</p>
                  <p className="text-xs text-muted">{r.reason} · {formatDate(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {r.amount_cents !== null && <span className="tabular font-semibold">{formatMoney(r.amount_cents)}</span>}
                  <Button size="sm" variant="secondary" onClick={() => setDismissId(r.id)}>Marcar como revisado</Button>
                </div>
              </div>
            ))}
          </Card>
        )}
        </>
      )}

      {dismissId && <VoidDialog open onOpenChange={() => setDismissId(null)} title="Marcar como revisado" description="Queda registrado con tu motivo. No suma dinero: si corresponde cobrarlo, cargalo como pago en efectivo del presupuesto." confirmLabel="Marcar como revisado" placeholder="Ej: lo devolví al pagador" tone="primary" path={`/payments/review/${dismissId}/dismiss`} onDone={reloadAll} />}

      {registering && <ManualPaymentDialog open onOpenChange={(o) => setFlag("pago", o)} onSaved={reloadAll} />}
      {payFor && <ManualPaymentDialog open onOpenChange={() => setPayFor(null)} onSaved={reloadAll} requestId={payFor.id} defaults={{ patient_ref: payFor.patient_ref, amount_cents: payFor.pending_cents, budget_id: payFor.budget_id ?? "" }} />}
      {creating && <RequestFormDialog open onOpenChange={(o) => setFlag("nuevo", o)} onCreated={reloadAll} budgetId={params.get("presupuesto") ?? undefined} />}
      {applyId && <ApplyPaymentDialog open onOpenChange={() => setApplyId(null)} paymentId={applyId} onDone={reloadAll} />}
      {voidId && <VoidDialog open onOpenChange={() => setVoidId(null)} title="Anular pago" path={`/payments/received/${voidId}/void`} onDone={reloadAll} />}
    </>
  );
}
