import { useLayoutEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, CircleAlert, FilePlus2, Hammer, Hourglass, MessageCircle, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/shared/Amount";
import { useFlowScreen } from "@/components/layout/FlowScreen";
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

  useFlowScreen(true);
  const failed = summary.error || budgets.error;
  // El Inicio no scrollea la página: se prueba el diseño completo y, si no entra en el área visible, se compacta (nivel 1 y 2).
  // Se mide directamente sobre el DOM, de menos a más compacto, así siempre queda el menos compacto que entra.
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const html = document.documentElement;
    const fit = () => {
      const el = root.current, main = document.querySelector<HTMLElement>(".app-main");
      if (!el || !main) return;
      for (const level of [0, 1, 2]) {
        if (level === 0) delete el.dataset.tight; else el.dataset.tight = String(level);
        html.classList.toggle("tight-chrome", level === 2);
        if (main.scrollHeight <= main.clientHeight + 1) return;
      }
    };
    fit();
    const frame = requestAnimationFrame(fit); // ya con la página en modo ventana fija
    void document.fonts?.ready.then(fit); // la tipografía puede cambiar el alto al cargar
    const observer = new ResizeObserver(fit); // y cualquier otro cambio de tamaño del contenido
    if (root.current) observer.observe(root.current);
    window.addEventListener("resize", fit); window.visualViewport?.addEventListener("resize", fit);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); html.classList.remove("tight-chrome"); };
  }, [budgets.data, summary.data, failed]);

  const retry = () => { void summary.reload(); void budgets.reload(); };
  const groups = budgets.data ? groupWorks(budgets.data) : null;
  const noJobs = budgets.data?.length === 0;
  const recibido = summary.data ? formatMoney(summary.data.collected_cents) : "—";
  const porCobrar = summary.data ? formatMoney(summary.data.budgets_balance_cents) : "—";

  return (
    <div ref={root} className="home mx-auto w-full max-w-3xl space-y-3 [@media(max-height:620px)]:space-y-2 pb-1 sm:space-y-6">
      <div className="home-greeting pt-0 sm:pt-4 [@media(max-height:620px)]:hidden sm:[@media(max-height:620px)]:block">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{greeting()} <span aria-hidden>👋</span></h1>
              </div>

      {/* La acción principal: lo más grande y con más color de toda la pantalla */}
      <Link to="/presupuestos/nuevo" className="home-cta group relative flex items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-[#2c6a5f] px-4 py-3 [@media(max-height:620px)]:py-2 text-white shadow-[0_14px_30px_-14px_rgba(23,59,54,0.55)] transition active:scale-[0.99] sm:gap-6 sm:px-7 sm:py-6">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/[0.07]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/[0.05]" />
        <span aria-hidden className="home-cta-icon relative grid h-12 w-12 [@media(max-height:620px)]:h-10 [@media(max-height:620px)]:w-10 shrink-0 place-items-center rounded-2xl bg-white text-primary sm:h-14 sm:w-14"><FilePlus2 size={30} strokeWidth={1.9} /></span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-xl font-semibold tracking-tight sm:text-2xl">Nuevo presupuesto</span>
          <span className="home-cta-sub mt-1 hidden text-base leading-snug text-white/85 sm:block">Prepará y compartí un presupuesto en minutos.</span>
        </span>
        <span aria-hidden className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 transition group-hover:translate-x-0.5 group-hover:bg-white/25"><ChevronRight size={22} /></span>
      </Link>

      {failed && <p role="alert" className="text-sm text-danger">No pudimos cargar tus números. <button type="button" onClick={retry} className="cursor-pointer font-medium underline">Reintentar</button></p>}

      <div className="space-y-3 [@media(max-height:620px)]:space-y-2 sm:space-y-6 desk:flex desk:flex-col desk:gap-4 desk:space-y-0">
        <section aria-label="Tus presupuestos" className="flex flex-col rounded-3xl border bg-white p-3.5 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold sm:text-lg">Tus presupuestos</h2>
            {!noJobs && <Link to="/presupuestos" className="shrink-0 py-0.5 text-sm font-semibold text-secondary hover:underline sm:text-[15px]">Ver todos ›</Link>}
          </div>
          {noJobs ? (
            <p className="mt-4 flex-1 text-[15px] leading-relaxed text-muted">Todavía no tenés presupuestos. Tocá <strong className="text-foreground">Nuevo presupuesto</strong> para armar el primero.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
              <Indicator to="/presupuestos?grupo=esperando-pago" label="Por pagar" value={groups?.awaitingPayment.length} icon={Hourglass} tone="warning" />
              <Indicator to="/presupuestos?grupo=en-curso" label="En curso" value={groups?.inProgress.length} icon={Hammer} tone="success" />
              <Indicator to="/presupuestos?grupo=por-responder" label="En espera" value={groups?.toAnswer.length} icon={MessageCircle} tone="neutral" />
              <Indicator to="/presupuestos?grupo=atencion" label="Vencidos" value={groups?.attention.length} icon={CircleAlert} tone={groups && groups.attention.length > 0 ? "danger" : "neutral"} />
            </dl>
          )}
        </section>

        <section aria-label="Tu dinero" className="desk:-order-1 flex flex-col rounded-3xl border bg-white p-3.5 sm:p-5">
          <h2 className="home-money-title text-base font-semibold sm:text-lg">Tu dinero</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 ">
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
    <Link to={to} className={cn("home-ind flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 [@media(max-height:620px)]:py-1.5 transition hover:brightness-[0.97] sm:flex-col sm:gap-1.5 sm:px-3 sm:py-3 sm:text-center", TONE[tone].tile)}>
      <dd className="order-2 text-[26px] font-semibold leading-none tracking-tight tabular sm:text-[30px]">{value ?? "—"}</dd>
      <span aria-hidden className={cn("order-1 grid h-8 w-8 shrink-0 place-items-center rounded-full", TONE[tone].chip)}><Icon size={16} /></span>
      <dt className="order-3 min-w-0 text-balance text-[12.5px] leading-tight text-muted">{label}</dt>
    </Link>
  );
}

function Money({ label, note, value, icon: Icon, tone }: { label: string; note: string; value: string; icon: LucideIcon; tone: keyof typeof TONE }) {
  return (
    <div className={cn("home-money flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-3 text-center sm:gap-2 sm:p-4", TONE[tone].tile)}>
      <div className="flex items-center justify-center gap-2">
        <span aria-hidden className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", TONE[tone].chip)}><Icon size={17} /></span>
        <div className="min-w-0 text-left leading-tight">
          <dt className="text-[13px] font-medium sm:text-sm">{label}</dt>
          <span className="block text-[11px] text-muted sm:text-xs">{note}</span>
        </div>
      </div>
      <dd className="flex w-full justify-center"><Amount value={value} mobile={22} desktop={30} /></dd>
    </div>
  );
}
