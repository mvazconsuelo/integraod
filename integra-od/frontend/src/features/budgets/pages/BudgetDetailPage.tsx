import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ActionMenu, type MenuAction } from "@/components/ui/action-menu";
import { BackLink } from "@/components/shared/BackLink";
import { Amount } from "@/components/shared/Amount";
import { Avatar } from "@/components/shared/Avatar";
import { PaidBar } from "@/components/shared/PaidBar";
import { Section } from "@/components/shared/Section";
import { cn } from "@/lib/utils";
import { CircleCheck, Hourglass, ListChecks, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { ApplyPaymentDialog } from "@/features/payments/components/ApplyPaymentDialog";
import { RegisterPaymentDialog } from "@/features/payments/components/RegisterPaymentDialog";
import { RequestPayDialog } from "@/features/payments/components/RequestPayDialog";
import { VoidDialog } from "@/features/payments/components/VoidDialog";
import { cancelRequest, publicLink } from "@/features/payments/services/payments.service";
import { useSettings } from "@/app/providers";
import { useApi } from "@/hooks/useApi";
import { useCopy } from "@/hooks/useCopy";
import { useNotice } from "@/hooks/useNotice";
import { patientPath } from "@/lib/patients";
import { formatMoney } from "@/lib/currency";
import { KIND_LABEL, methodLabel, formatDate, today } from "@/lib/formatters";
import { printAs } from "@/lib/print";
import type { BudgetDetail, BudgetStatus, PaymentRequest } from "@/types";
import { BudgetSheet } from "../components/BudgetSheet";
import { BudgetCancelFlow, type CancelMode } from "../components/BudgetStatusPanel";
import { BudgetTimeline } from "../components/BudgetTimeline";
import { ShareBudgetDialog } from "../components/ShareBudgetDialog";
import { changeStatus, recordAnswer } from "../services/budgets.service";
import { workOf } from "./BudgetsPage";

/**
 * Un presupuesto, en una sola pantalla: cuánto cuesta, cuánto se recibió, cuánto falta y qué se puede hacer ahora.
 * Una acción principal que cambia con el estado; lo ocasional está en el menú "⋯".
 */
export function BudgetDetailPage() {
  const { id = "" } = useParams();
  const { settings } = useSettings();
  const { data: b, error, loading, reload } = useApi<BudgetDetail>(`/budgets/${id}`);
  const [params, setParams] = useSearchParams();
  const notify = useNotice();
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(params.get("compartir") === "1");
  const [registering, setRegistering] = useState<{ requestId?: string } | null>(params.get("pagar") === "1" ? {} : null);
  const [requesting, setRequesting] = useState<PaymentRequest | "new" | null>(null);
  const [applying, setApplying] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState<CancelMode>(null);
  const [actionError, setActionError] = useState("");
  const clearParam = (key: string) => setParams((p) => { const n = new URLSearchParams(p); n.delete(key); return n; }, { replace: true });
  // Los atajos (?compartir, ?pagar) abren su acción una vez y se limpian.
  useEffect(() => { if (params.has("compartir")) clearParam("compartir"); if (params.has("pagar")) clearParam("pagar"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (status: BudgetStatus) => {
    try { await changeStatus(id, status); setActionError(""); await reload(); } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos cambiar el estado."); }
  };
  const download = () => b && printAs(`Presupuesto N° ${String(b.number).padStart(4, "0")} - ${b.patient_ref}`);

  if (loading && !b) return <Loading />;
  if (error || !b) return <ErrorMessage message={error ?? "No encontramos el presupuesto."} onRetry={reload} />;

  const cancelled = b.status === "cancelled";
  // Vencido solo si todavía no recibió ningún pago: con pagos, el trabajo ya está en marcha.
  const expiredBudget = Boolean(b.valid_until) && b.valid_until! < today() && b.status === "sent";
  const done = !cancelled && b.balance_cents === 0;
  const active = b.applications.filter((a) => !a.voided_at);
  const canCollect = !cancelled && b.balance_cents > 0;
  const canRequest = canCollect && b.requestable_cents > 0;
  const waiting = b.requests.filter((r) => r.display_status === "pending" || r.display_status === "partially_paid" || r.display_status === "expired");
  const fixedBudget = { id: b.id, patient_ref: b.patient_ref, total_cents: b.total_cents, applied_cents: b.applied_cents, balance_cents: b.balance_cents, requestable_cents: b.requestable_cents, first_item: b.first_item, item_count: b.item_count };
  const detailed = b.items.length > 1 || b.items.some((i) => i.quantity > 1 || i.discount_pct > 0);

  // Una sola acción principal, según el estado.
  const primary = cancelled || done ? null
    : active.length === 0 && waiting.length === 0 ? { label: "Compartir", run: () => setSharing(true) }
    : { label: "Registrar pago", run: () => setRegistering({}) };

  const answer = async (a: "accepted" | "declined") => { try { await recordAnswer(id, a); setActionError(""); await reload(); } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos guardar la respuesta."); } };
  const canAnswer = !cancelled && !done;
  const menu: MenuAction[] = [
    { label: "Compartir", onClick: () => setSharing(true), hidden: cancelled || primary?.label === "Compartir" },
    { label: "Registrar pago", onClick: () => setRegistering({}), hidden: !canCollect || primary?.label === "Registrar pago" },
    { label: "Pedir un pago", onClick: () => setRequesting("new"), hidden: !canRequest },
    { label: "Usar un pago ya recibido", onClick: () => setApplying(true), hidden: !canCollect },
    { label: "Editar", onClick: () => navigate(`/presupuestos/${b.id}/editar`), hidden: cancelled },
    { label: "El cliente aceptó", onClick: () => void answer("accepted"), hidden: !canAnswer || b.answer === "accepted" },
    { label: "El cliente lo rechazó", onClick: () => void answer("declined"), hidden: !canAnswer || b.answer === "declined" },
    { label: "Descargar PDF", onClick: download },
    { label: "Reabrir presupuesto", onClick: () => void setStatus("sent"), hidden: !cancelled },
    { label: b.applied_cents > 0 ? "¿Por qué no puedo cancelarlo?" : "Cancelar presupuesto", tone: b.applied_cents > 0 ? undefined : "danger", onClick: () => setCancelMode(b.applied_cents > 0 ? "blocked" : "confirm"), hidden: cancelled || done },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <BackLink to="/presupuestos">presupuestos</BackLink>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar name={b.patient_ref} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{b.patient_ref}</h1>
              <p className="truncate text-muted">{workOf(b)}</p>
              <p className="mt-0.5 text-sm text-muted">N° {String(b.number).padStart(4, "0")} · {formatDate(b.issued_on)} · {b.valid_until && <span className={expiredBudget ? "font-medium text-danger" : undefined}>{expiredBudget ? "Venció" : "Vence"} el {formatDate(b.valid_until)} · </span>}<Link to={patientPath(b.patient_ref)} className="text-secondary hover:underline">ver cliente</Link></p>
            </div>
          </div>
          <ActionMenu actions={menu} />
        </div>
      </div>

      {actionError && <ErrorMessage message={actionError} />}

      {/* El dinero, en una mirada: el bloque con más color de la pantalla */}
      <section aria-label="Dinero" className={cn("space-y-4 rounded-3xl p-5 sm:p-6", cancelled ? "bg-soft" : done ? "bg-success/10" : "bg-warning/10")}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 text-sm font-medium">
            <span aria-hidden className={cn("grid h-9 w-9 place-items-center rounded-full", cancelled ? "bg-white text-muted" : done ? "bg-success/15 text-success" : "bg-warning/20 text-[#8a5d2b]")}>{done ? <CircleCheck size={18} /> : <Hourglass size={18} />}</span>
            {cancelled ? "Total" : done ? "Cobrado" : "Falta cobrar"}
          </p>
          <StatusBadge kind="budget" status={b.status} />
        </div>
        <Amount value={formatMoney(cancelled || done ? b.total_cents : b.balance_cents)} mobile={42} desktop={56} />
        {!cancelled && <PaidBar percent={b.paid_percent} label={`Cobrado ${formatMoney(b.applied_cents)} de ${formatMoney(b.total_cents)}`} />}
        {primary && <Button className="h-12 w-full text-base" onClick={primary.run}>{primary.label}</Button>}
      </section>

      {detailed && (
        <Section title="Conceptos" icon={ListChecks} flush>
          <ul className="divide-y px-5 pb-2 text-sm sm:px-6">
            {b.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0"><p>{i.description}</p>{(i.quantity > 1 || i.discount_pct > 0) && <p className="text-xs text-muted">{i.quantity > 1 && `${i.quantity} × ${formatMoney(i.unit_price_cents)}`}{i.quantity > 1 && i.discount_pct > 0 && " · "}{i.discount_pct > 0 && `${i.discount_pct}% de descuento`}</p>}</div>
                <span className="shrink-0 tabular">{formatMoney(i.total_cents)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(waiting.length > 0 || active.length > 0) && (
        <Section title="Pagos" icon={Wallet} flush className="scroll-mt-24">
          <ul id="pagos" className="divide-y px-5 pb-2 sm:px-6">
            {waiting.map((r) => <RequestRow key={r.id} r={r} onRegister={() => setRegistering({ requestId: r.id })} onAgain={() => setRequesting(r)} onDone={() => void reload()} />)}
            {active.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0"><p>{KIND_LABEL[a.kind]} · {methodLabel(a.method)}{a.provider === "mock" && <span className="text-muted"> · simulado</span>}</p><p className="text-xs text-muted">{formatDate(a.paid_at)}</p></div>
                <div className="flex items-center gap-1"><span className="tabular font-medium text-success">{formatMoney(a.amount_cents)}</span><Button size="sm" variant="ghost" onClick={() => setVoiding(a.id)}>Anular</Button></div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.notes && <details className="border-t pt-4 text-sm"><summary className="cursor-pointer font-medium text-muted hover:text-foreground">Condiciones</summary><p className="mt-2 whitespace-pre-line text-muted">{b.notes}</p></details>}
      <BudgetTimeline events={b.timeline} />

      {settings && <BudgetSheet budget={b} settings={settings} />}
      {sharing && settings && <ShareBudgetDialog open onOpenChange={setSharing} budget={b} settings={settings} onDownload={download} onChanged={() => void reload()} />}
      {requesting && <RequestPayDialog open onOpenChange={() => setRequesting(null)} onCreated={() => void reload()} budget={requesting === "new" ? fixedBudget : undefined} budgetId={requesting === "new" ? undefined : b.id} initial={requesting === "new" ? undefined : { amount_cents: requesting.pending_cents, conditions: requesting.conditions }} />}
      {registering && <RegisterPaymentDialog open onOpenChange={() => setRegistering(null)} onSaved={(m) => { void reload(); notify(m); }} budgetId={b.id} requestId={registering.requestId} />}
      {applying && <ApplyPaymentDialog open onOpenChange={setApplying} budgetId={b.id} balanceCents={b.balance_cents} onDone={reload} />}
      {voiding && <VoidDialog open onOpenChange={() => setVoiding(null)} title="Anular pago" path={`/payments/applications/${voiding}/void`} onDone={reload} />}
      <BudgetCancelFlow budget={b} mode={cancelMode} onClose={() => setCancelMode(null)} onChange={setStatus} />
    </div>
  );
}

/** Un pedido de pago que todavía no se cobró: qué es, su estado y lo que se puede hacer con él, a la vista (sin otro menú). */
function RequestRow({ r, onAgain, onRegister, onDone }: { r: PaymentRequest; onAgain: () => void; onRegister: () => void; onDone: () => void }) {
  const { state, copy } = useCopy();
  const [error, setError] = useState("");
  const expired = r.display_status === "expired";
  const online = r.provider !== "cash";
  const link = "cursor-pointer text-sm font-medium text-secondary hover:underline";
  const cancel = async () => { try { await cancelRequest(r.id); onDone(); } catch (e) { setError(e instanceof Error ? e.message : "No pudimos cancelar el pedido."); } };
  return (
    <li className="py-3.5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p>{online ? "Pedido con link" : "Pedido en mano"} · {formatMoney(r.amount_cents)}</p><p className="text-xs text-muted">{formatDate(r.created_at)}{r.due_date && ` · vence el ${formatDate(r.due_date)}`}</p></div>
        <StatusBadge status={r.display_status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {online && !expired && <button type="button" className={link} onClick={() => void copy(publicLink(r.public_id))}>{state === "copied" ? "Link copiado" : "Copiar link"}</button>}
        {!online && <button type="button" className={link} onClick={onRegister}>Registrar pago</button>}
        {expired && <button type="button" className={link} onClick={onAgain}>Pedir de nuevo</button>}
        {r.paid_cents === 0 && <button type="button" className="cursor-pointer text-sm text-muted hover:text-danger hover:underline" onClick={() => void cancel()}>Cancelar pedido</button>}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  );
}
