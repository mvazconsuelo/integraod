import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CircleAlert, FilePlus2, Hammer, Hourglass, MessageCircle, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/shared/Amount";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { resolveRange } from "@/lib/period";
import { clinicTimeZone } from "@/lib/time-zone";
import { groupWorks } from "@/lib/work-groups";
import type { Budget, Summary } from "@/types";

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("es-AR", { hour: "numeric", hourCycle: "h23", timeZone: clinicTimeZone() }).format(new Date()));
  return hour < 6 ? "Buenas noches" : hour < 13 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";
}

/**
 * Inicio: tres cosas. Empezar un presupuesto, ver en qué están tus presupuestos y saber cuánta plata recibiste y cuánta falta.
 * Los importes vienen del servidor (cobrado confirmado y saldo real de los presupuestos); acá solo se cuentan estados.
 */
export function HomePage() {
  const month = useMemo(() => resolveRange({ period: "month", from: "", to: "" }), []);
  const summary = useApi<Summary>(month ? `/dashboard?from=${month.from}&to=${month.to}` : null);
  const budgets = useApi<Budget[]>("/budgets");

  const failed = summary.error || budgets.error;
  const retry = () => { void summary.reload(); void budgets.reload(); };
  const groups = budgets.data ? groupWorks(budgets.data) : null;
  const noJobs = budgets.data?.length === 0;
  const recibido = summary.data ? formatMoney(summary.data.collected_cents) : "—";
  const porCobrar = summary.data ? formatMoney(summary.data.budgets_balance_cents) : "—";

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-2 sm:space-y-6 sm:pb-6">
      <div className="pt-1 sm:pt-4">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">{greeting()} <span aria-hidden>👋</span></h1>
        <p className="mt-1 hidden text-lg text-muted sm:block">¿Qué hacemos hoy?</p>
      </div>

      {/* La acción principal: lo más grande y con más color de toda la pantalla */}
      <Link to="/presupuestos/nuevo" className="group relative flex items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-[#2c6a5f] px-4 py-4 text-white shadow-[0_14px_30px_-14px_rgba(23,59,54,0.55)] transition active:scale-[0.99] sm:gap-6 sm:px-8 sm:py-9">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/[0.07]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/[0.05]" />
        <span aria-hidden className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-primary sm:h-[72px] sm:w-[72px]"><FilePlus2 size={30} strokeWidth={1.9} /></span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-xl font-semibold tracking-tight sm:text-3xl">Nuevo presupuesto</span>
          <span className="mt-1 hidden text-base leading-snug text-white/85 sm:block">Prepará y compartí un presupuesto en minutos.</span>
        </span>
        <span aria-hidden className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 transition group-hover:translate-x-0.5 group-hover:bg-white/25"><ChevronRight size={22} /></span>
      </Link>

      {failed && <p role="alert" className="text-sm text-danger">No pudimos cargar tus números. <button type="button" onClick={retry} className="cursor-pointer font-medium underline">Reintentar</button></p>}

      <div className="space-y-3 sm:space-y-6">
        <section aria-label="Tus presupuestos" className="flex flex-col rounded-3xl border bg-white p-4 sm:p-7">
          <h2 className="text-base font-semibold sm:text-lg">Tus presupuestos</h2>
          {noJobs ? (
            <p className="mt-4 flex-1 text-[15px] leading-relaxed text-muted">Todavía no tenés presupuestos. Tocá <strong className="text-foreground">Nuevo presupuesto</strong> para armar el primero.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
              <Indicator to="/presupuestos?grupo=esperando-pago" label="Esperando pago" value={groups?.awaitingPayment.length} icon={Hourglass} tone="warning" />
              <Indicator to="/presupuestos?grupo=en-curso" label="En curso" value={groups?.inProgress.length} icon={Hammer} tone="success" />
              <Indicator to="/presupuestos?grupo=por-responder" label="Por responder" value={groups?.toAnswer.length} icon={MessageCircle} tone="neutral" />
              <Indicator to="/presupuestos?grupo=atencion" label="Necesitan atención" value={groups?.attention.length} icon={CircleAlert} tone={groups && groups.attention.length > 0 ? "danger" : "neutral"} />
            </dl>
          )}
          <Link to="/presupuestos" className="mt-3 inline-flex self-start py-1 text-[15px] font-semibold text-secondary hover:underline">Ver todos los presupuestos ›</Link>
        </section>

        <section aria-label="Tu dinero" className="flex flex-col rounded-3xl border bg-white p-4 sm:p-7">
          <h2 className="text-base font-semibold sm:text-lg">Tu dinero</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
            <Money label="Recibido" note="Este mes" icon={Wallet} tone="success" value={recibido} />
            <Money label="Por cobrar" note="Hoy" icon={Hourglass} tone="warning" value={porCobrar} />
          </dl>
        </section>
      </div>
    </div>
  );
}

const TONE = {
  success: { tile: "bg-success/10", chip: "bg-success/15 text-success" },
  warning: { tile: "bg-warning/10", chip: "bg-warning/20 text-[#8a5d2b]" },
  danger: { tile: "bg-danger/10", chip: "bg-danger/15 text-danger" },
  neutral: { tile: "bg-soft", chip: "bg-white text-muted" },
} as const;

/** Un número con su ícono y lo que cuenta; al tocarlo se abre ese grupo de presupuestos. */
function Indicator({ to, label, value, icon: Icon, tone }: { to: string; label: string; value?: number; icon: LucideIcon; tone: keyof typeof TONE }) {
  return (
    <Link to={to} className={cn("flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 transition hover:brightness-[0.97] sm:flex-col sm:gap-2.5 sm:px-3 sm:py-4 sm:text-center", TONE[tone].tile)}>
      <dd className="order-2 text-[26px] font-semibold leading-none tracking-tight tabular sm:text-[34px]">{value ?? "—"}</dd>
      <span aria-hidden className={cn("order-1 grid h-8 w-8 shrink-0 place-items-center rounded-full", TONE[tone].chip)}><Icon size={16} /></span>
      <dt className="order-3 min-w-0 text-balance text-[12.5px] leading-tight text-muted">{label}</dt>
    </Link>
  );
}

function Money({ label, note, value, icon: Icon, tone }: { label: string; note: string; value: string; icon: LucideIcon; tone: keyof typeof TONE }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-2xl p-3 sm:gap-3 sm:p-5", TONE[tone].tile)}>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", TONE[tone].chip)}><Icon size={17} /></span>
        <dt className="text-[13px] font-medium sm:text-sm">{label}</dt>
      </div>
      <dd><Amount value={value} mobile={22} desktop={32} /></dd>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}
