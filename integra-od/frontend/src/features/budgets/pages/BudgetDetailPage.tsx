import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ActionMenu, type MenuAction } from "@/components/ui/action-menu";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { BackLink } from "@/components/shared/BackLink";
import { Amount } from "@/components/shared/Amount";
import { Avatar } from "@/components/shared/Avatar";
import { ActionBar, FlowScreen } from "@/components/layout/FlowScreen";
import { PaidBar } from "@/components/shared/PaidBar";
import { Section } from "@/components/shared/Section";
import { cn } from "@/lib/utils";
import { Banknote, CircleCheck, Hourglass, ListChecks, Send, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { RegisterPaymentDialog } from "@/features/payments/components/RegisterPaymentDialog";
import { RequestPayDialog } from "@/features/payments/components/RequestPayDialog";
import { VoidDialog } from "@/features/payments/components/VoidDialog";
import { useSettings } from "@/app/providers";
import { useApi } from "@/hooks/useApi";
import { useNotice } from "@/hooks/useNotice";
import { patientPath } from "@/lib/patients";
import { formatMoney } from "@/lib/currency";
import { KIND_LABEL, methodLabel, formatDate, formatDateNumeric, today } from "@/lib/formatters";
import type { BudgetDetail, BudgetStatus, PaymentRequest, Received } from "@/types";
import { budgetPdf, deliverPdf } from "@/lib/budget-pdf";
import { BudgetCancelFlow, type CancelMode } from "../components/BudgetStatusPanel";
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
  const [voiding, setVoiding] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState<CancelMode>(null);
  const [actionError, setActionError] = useState("");
  const clearParam = (key: string) => setParams((p) => { const n = new URLSearchParams(p); n.delete(key); return n; }, { replace: true });
  // Los atajos (?compartir, ?pagar) abren su acción una vez y se limpian.
  useEffect(() => { if (params.has("compartir")) clearParam("compartir"); if (params.has("pagar")) clearParam("pagar"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (status: BudgetStatus) => {
    try { await changeStatus(id, status); setActionError(""); await reload(); } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos cambiar el estado."); }
  };
  const download = async () => {
    if (!b || !settings) return;
    try { setActionError(""); await deliverPdf(await budgetPdf(b, settings)); } catch { setActionError("No pudimos generar el PDF. Probá de nuevo."); }
  };

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
  const detailed = b.items.length > 1 || b.items.some((i) => i.quantity > 1 || i.discount_pct > 0 || i.detail);

  // Cobros por Mercado Pago esperando que el cliente pague: ese pago llega solo, no hay que cargarlo a mano.
  const awaitingOnline = waiting.filter((r) => r.provider !== "cash" && (r.display_status === "pending" || r.display_status === "partially_paid"));
  const awaitingCents = awaitingOnline.reduce((s, r) => s + r.pending_cents, 0);
  const awaitingPaid = awaitingOnline.reduce((s, r) => s + r.paid_cents, 0); // lo que ya se pagó de esos pedidos
  // Se cobra por Mercado Pago y no hay ningún link esperando (por ejemplo, ya se pagó el anticipo): el link anterior no se comparte de nuevo,
  // lo que sigue es un pago nuevo, con su propio link.
  const viaMp = b.collect_method === "mercadopago" || b.requests.some((r) => r.provider !== "cash");
  const newPayment = viaMp && canRequest && awaitingOnline.length === 0;
  const movements = b.applications; // en orden de fecha; los anulados quedan a la vista

  const answer = async (a: "accepted" | "declined") => { try { await recordAnswer(id, a); setActionError(""); await reload(); } catch (e) { setActionError(e instanceof Error ? e.message : "No pudimos guardar la respuesta."); } };
  // Aceptó / rechazó solo tiene sentido mientras todavía no hay pagos ni pedido en curso (con eso, el cliente ya está avanzando).
  const canAnswer = !cancelled && !done && b.applied_cents === 0 && waiting.length === 0;
  const menu: MenuAction[] = [
    { label: "Editar", onClick: () => navigate(`/presupuestos/${b.id}/editar`), hidden: cancelled },
    { label: "Marcar como aceptado", onClick: () => void answer("accepted"), hidden: !canAnswer || b.answer === "accepted" },
    { label: "Marcar como rechazado", onClick: () => void answer("declined"), hidden: !canAnswer || b.answer === "declined" },
    { label: "Descargar PDF", onClick: download },
    { label: "Reabrir presupuesto", onClick: () => void setStatus("sent"), hidden: !cancelled },
    { label: b.applied_cents > 0 ? "¿Por qué no puedo cancelarlo?" : "Cancelar presupuesto", tone: b.applied_cents > 0 ? undefined : "danger", onClick: () => setCancelMode(b.applied_cents > 0 ? "blocked" : "confirm"), hidden: cancelled || done },
  ];

  // Las acciones de cobro, siempre a mano abajo (el resumen y las listas scrollean arriba).
  const actionBar = canCollect ? (
    <ActionBar className="py-2">
      {awaitingOnline.length > 0 ? (
        <div className="grid w-full grid-cols-2 gap-2">
          <Button className="h-12 text-base" onClick={() => setSharing(true)}>Compartir<WhatsAppIcon size={18} /></Button>
          <Button variant="secondary" className="h-12 text-base" onClick={() => navigate(`/presupuestos/${b.id}/editar`)}><Banknote size={18} aria-hidden />Pasar a efectivo</Button>
        </div>
      ) : (
        <div className={cn("grid w-full gap-2", canRequest && !newPayment ? "grid-cols-2" : "grid-cols-1")}>
          <Button className="h-12 text-base" onClick={() => setRegistering({})}><Banknote size={18} aria-hidden />Registrar pago</Button>
          {canRequest && !newPayment && <Button variant="secondary" className="h-12 text-base" onClick={() => setRequesting("new")}><Send size={17} aria-hidden />Link de pago</Button>}
        </div>
      )}
    </ActionBar>
  ) : null;

  return (
    <FlowScreen className="max-w-2xl" top={<div className="shrink-0 pb-3">
      <div>
        <BackLink to="/presupuestos">presupuestos</BackLink>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar name={b.patient_ref} size="md" className="mt-1" />
            <div className="min-w-0">
              {/* Los nombres largos se muestran completos (se parten en renglones y la letra se achica), nunca cortados con "…" */}
              <h1 className={cn("font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]", b.patient_ref.length > 40 ? "text-lg sm:text-2xl" : b.patient_ref.length > 24 ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl")}>{b.patient_ref}</h1>
              {/* Con varios conceptos no se resume ("Limpieza y 2 más"): se listan abajo en "Conceptos". Con uno solo, es lo único que lo dice. */}
              {b.item_count === 1 && <p className={cn("text-muted [overflow-wrap:anywhere]", workOf(b).length > 50 && "text-sm sm:text-base")}>{workOf(b)}</p>}
              <Link to={patientPath(b.patient_ref)} className="mt-0.5 inline-block text-sm font-medium text-secondary hover:underline">Ver destinatario ›</Link>
            </div>
          </div>
          <ActionMenu actions={menu} />
        </div>
      </div>
      </div>}
      bar={actionBar}>
      <div className="space-y-6 pb-2">
      {actionError && <ErrorMessage message={actionError} />}

      {/* Resumen: cuánto vale, cuánto se recibió y cuánto falta. Es lo más importante de la pantalla. */}
      <section aria-label="Resumen de dinero" className={cn("space-y-4 rounded-3xl p-5 sm:p-6", cancelled ? "bg-soft" : done ? "bg-success/10" : "bg-warning/10")}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 text-sm font-medium">
            <span aria-hidden className={cn("grid h-9 w-9 place-items-center rounded-full", cancelled ? "bg-white text-muted" : done ? "bg-success/15 text-success" : "bg-warning/20 text-[#8a5d2b]")}>{done ? <CircleCheck size={18} /> : <Hourglass size={18} />}</span>
            {cancelled ? "Cancelado" : done ? "Cobrado" : "Falta cobrar"}
          </p>
          <StatusBadge kind="situation" status={b.situation} />
        </div>
        <p className="-mt-1 text-sm text-muted">
          Presupuesto <strong className="font-semibold text-foreground">N° {String(b.number).padStart(4, "0")}</strong>
          {b.valid_until && <span className={expiredBudget ? "font-medium text-danger" : undefined}> · {expiredBudget ? "Venció" : "Vence"} el {formatDateNumeric(b.valid_until)}</span>}
        </p>
        {!cancelled && !done && <Amount value={formatMoney(b.balance_cents)} mobile={42} desktop={56} />}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted">Presupuesto</dt><dd className="text-lg font-semibold tabular">{formatMoney(b.total_cents)}</dd></div>
          <div><dt className="text-muted">Recibido</dt><dd className="text-lg font-semibold tabular text-success">{formatMoney(b.applied_cents)}</dd></div>
        </dl>
        {!cancelled && <PaidBar percent={b.paid_percent} label={`${b.paid_percent} % cobrado`} />}
        {canCollect && (
          <div className="space-y-3 pt-1">
            {awaitingOnline.length > 0 && (
              <p className="flex items-start gap-2 rounded-2xl bg-white/70 px-3.5 py-2.5 text-sm"><Hourglass size={16} aria-hidden className="mt-0.5 shrink-0 text-[#8a5d2b]" /><span><strong>{awaitingOnline.every((r) => r.kind === "advance") ? "Anticipo" : "Pago"} Mercado Pago</strong> · <strong className="tabular">{formatMoney(awaitingCents)}</strong>{awaitingPaid > 0 && <> Ya recibiste {formatMoney(awaitingPaid)}.</>}</span></p>
            )}
            {/* Un solo botón de compartir (solo WhatsApp). Con un pedido por Mercado Pago esperando, ese botón está en la barra de abajo. */}
            {awaitingOnline.length === 0 && (newPayment
              ? <Button variant="secondary" className="h-11 w-full" onClick={() => setRequesting("new")}><Send size={17} aria-hidden />Nuevo pago</Button>
              : <Button variant="secondary" className="h-11 w-full" onClick={() => setSharing(true)}>Compartir<WhatsAppIcon size={18} /></Button>)}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {awaitingOnline.length > 0 && canRequest && <button type="button" className="cursor-pointer font-medium text-secondary hover:underline" onClick={() => setRequesting("new")}>Otro link de pago</button>}
            </div>
          </div>
        )}
        {!canCollect && !cancelled && <Button variant="secondary" className="h-11 w-full" onClick={() => setSharing(true)}>Compartir<WhatsAppIcon size={18} /></Button>}
      </section>

      {detailed && (
        <Section title="Conceptos" icon={ListChecks} flush>
          <ul className="divide-y px-5 pb-2 text-sm sm:px-6">
            {b.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0"><p>{i.description}</p>{i.detail && <p className="whitespace-pre-line text-xs text-muted">{i.detail}</p>}{(i.quantity > 1 || i.discount_pct > 0) && <p className="text-xs text-muted">{i.quantity > 1 && `${i.quantity} × ${formatMoney(i.unit_price_cents)}`}{i.quantity > 1 && i.discount_pct > 0 && " · "}{i.discount_pct > 0 && `${i.discount_pct}% de descuento`}</p>}</div>
                <span className="shrink-0 tabular">{formatMoney(i.total_cents)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {movements.length > 0 && (
        <Section title="Dinero recibido" icon={Wallet} flush className="scroll-mt-24">
          <ul id="pagos" className="divide-y px-5 pb-2 sm:px-6">
            {movements.map((a) => (
              <li key={a.id} className={cn("flex items-center justify-between gap-3 py-3 text-sm", a.voided_at && "opacity-60")}>
                <div className="min-w-0">
                  <p className={cn("font-medium", a.voided_at && "line-through")}>{KIND_LABEL[a.kind]} · {formatMoney(a.amount_cents)}</p>
                  <p className="text-xs text-muted">{methodLabel(a.method)}{a.provider === "mock" && " (simulado)"} · {formatDate(a.paid_at)}{a.voided_at && ` · Anulado${a.void_reason ? `: ${a.void_reason}` : ""}`}</p>
                </div>
                {!a.voided_at && <Button size="sm" variant="ghost" onClick={() => setVoiding(a.id)}>Anular</Button>}
              </li>
            ))}
          </ul>
        </Section>
      )}


      {sharing && settings && <ShareBudgetDialog open onOpenChange={setSharing} budget={b} settings={settings} onChanged={() => void reload()} />}
      {requesting && <RequestPayDialog open onOpenChange={() => setRequesting(null)} onCreated={() => void reload()} budget={requesting === "new" ? fixedBudget : undefined} budgetId={requesting === "new" ? undefined : b.id} initial={requesting === "new" ? undefined : { amount_cents: requesting.pending_cents, conditions: requesting.conditions }} />}
      {registering && <RegisterPaymentDialog open onOpenChange={() => setRegistering(null)} onSaved={(m) => { void reload(); notify(m); }} budgetId={b.id} requestId={registering.requestId} />}
      {voiding && <VoidDialog open onOpenChange={() => setVoiding(null)} title="Anular pago" path={`/payments/applications/${voiding}/void`} onDone={reload} />}
      <BudgetCancelFlow budget={b} mode={cancelMode} onClose={() => setCancelMode(null)} onChange={setStatus} />
      </div>
    </FlowScreen>
  );
}

