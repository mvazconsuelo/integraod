import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, CircleCheck, History, Hourglass, Landmark, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { ActivityFeed } from "@/features/activity/components/ActivityFeed";
import { Amount } from "@/components/shared/Amount";
import { PageHeader } from "@/components/shared/PageHeader";
import { PeriodPicker } from "@/components/shared/PeriodPicker";
import { Section } from "@/components/shared/Section";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { methodLabel } from "@/lib/formatters";
import { defaultPeriod, describeRange, resolveRange, type Period, type PeriodValue } from "@/lib/period";
import { cn } from "@/lib/utils";
import type { Summary } from "@/types";

const OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "Este mes" },
  { value: "last", label: "Mes anterior" },
  { value: "custom", label: "Rango personalizado" },
];

const TONE = {
  success: { tile: "bg-success/10", chip: "bg-success/15 text-success" },
  warning: { tile: "bg-warning/10", chip: "bg-warning/20 text-[#8a5d2b]" },
  soft: { tile: "bg-soft", chip: "bg-white text-primary" },
} as const;

/**
 * Métricas: tres preguntas (¿cuánto cobré?, ¿cuánto me deben?, ¿se cierran mis presupuestos?) y, en la computadora, el detalle
 * (saldos más viejos, cobrado por mes y por medio). Cada número dice si es de un período o de hoy. Salen del servidor (dashboard.service).
 */
export function ControlPage() {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod("month"));
  const range = useMemo(() => resolveRange(period), [period]);
  const { data: s, error, loading, reload } = useApi<Summary>(range ? `/dashboard?from=${range.from}&to=${range.to}` : null);
  const empty = s && s.onboarding.budgets === 0 && s.onboarding.collections === 0;
  // Control tiene dos vistas: el resumen de números y el historial de lo que fue pasando (?vista=historial).
  const [params, setParams] = useSearchParams();
  const history = params.get("vista") === "historial";
  const setView = (h: boolean) => setParams(h ? { vista: "historial" } : {}, { replace: true });

  return (
    <div className="mx-auto max-w-3xl pb-6">
      <nav aria-label="Vista de Métricas" className="mb-3 inline-flex rounded-full bg-soft p-1 sm:mb-6">
        {[{ h: false, label: "Resumen" }, { h: true, label: "Historial" }].map((t) => (
          <button key={t.label} type="button" aria-current={history === t.h ? "page" : undefined} onClick={() => setView(t.h)}
            className={cn("cursor-pointer rounded-full px-5 py-2 text-[15px] font-semibold transition", history === t.h ? "bg-primary text-white" : "text-muted hover:text-foreground")}>{t.label}</button>
        ))}
      </nav>
      {history ? (
        <>
          <PageHeader title="Historial" icon={History} subtitle="Lo que fue pasando, del más nuevo al más viejo." />
          <ActivityFeed />
        </>
      ) : (
        <>
          <PageHeader title="Métricas" icon={BarChart3} subtitle={range ? describeRange(range.from, range.to) : "Elegí las dos fechas"} action={<PeriodPicker value={period} onChange={setPeriod} options={OPTIONS} />} />
          {error && <ErrorMessage message={error} onRetry={reload} />}
          {range && loading && !s && <Loading />}
          {empty && <EmptyState message="Todavía no hay nada para mostrar. Cuando armes un presupuesto y cobres, vas a ver acá cómo te va." />}
          {range && s && !empty && <Body s={s} />}
        </>
      )}
    </div>
  );
}

function Body({ s }: { s: Summary }) {
  const a = s.acceptance;
  const answered = a.accepted + a.declined;
  const prev = s.previous_collected_cents;
  const delta = prev > 0 ? Math.round(((s.collected_cents - prev) / prev) * 100) : null;
  const compare = delta !== null ? `${delta >= 0 ? "+" : ""}${delta} % que en el período anterior` : s.collected_cents > 0 ? "En el período anterior no hubo cobros" : "";
  const money = [formatMoney(s.collected_cents), formatMoney(s.budgets_balance_cents)];
  const long = Math.max(...money.map((m) => m.length)) > 13; // importes muy largos: una columna para que respiren
  const waiting = a.waiting > 0 ? ` · ${a.waiting} sin respuesta` : "";
  return (
    <div className="space-y-5">
      {/* Lo esencial (también en el celular): cuánto cobré, cuánto me deben y cuántos presupuestos se cierran */}
      <div className={cn("grid gap-3", long ? "grid-cols-1" : "lg:grid-cols-3")}>
        <Tile tone="success" icon={Wallet} label="Cobrado" scope="En estas fechas" money={money[0]} note={compare} />
        <Tile tone="warning" icon={Hourglass} label="Por cobrar" scope="Hoy" money={money[1]} note={`${s.open_jobs_count} ${s.open_jobs_count === 1 ? "presupuesto en curso" : "presupuestos en curso"}`} to="/presupuestos?grupo=en-curso" />
        <Tile tone="soft" icon={CircleCheck} label="Aceptados" scope="De estas fechas" money={answered > 0 ? `${a.accepted} de ${answered}` : "—"}
          note={answered === 0 ? `Todavía nadie respondió${waiting}` : `${answered >= 5 && a.rate_pct !== null ? `${a.rate_pct} % de los que respondieron` : `${answered} ${answered === 1 ? "respondió" : "respondieron"}`}${waiting}`} />
      </div>

      {/* El detalle, solo en la computadora */}
      <div className="hidden space-y-5 lg:block">
        <Section title="Saldos más viejos" icon={Hourglass} flush>
          {s.oldest_balances.length === 0
            ? <p className="px-5 pb-5 text-sm text-muted sm:px-6">No hay saldos pendientes. Todo al día.</p>
            : (
              <ul className="divide-y px-5 pb-2 sm:px-6">
                {s.oldest_balances.map((o) => (
                  <li key={o.id}>
                    <Link to={`/presupuestos/${o.id}`} className="flex items-center justify-between gap-4 py-3.5 hover:opacity-80">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.patient_ref}</span>
                        <span className="block text-xs text-muted">N° {String(o.number).padStart(4, "0")} · {o.days_since_payment === null ? "sin pagos" : o.days_since_payment === 0 ? "pagó hoy" : `último pago hace ${o.days_since_payment} ${o.days_since_payment === 1 ? "día" : "días"}`}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular">{formatMoney(o.balance_cents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Section>

        {s.monthly.length > 0 && (
          <Section title="Cobrado por mes" icon={TrendingUp}>
            <Bars rows={s.monthly.slice(-6).map((m) => ({ label: monthLabel(m.month), cents: m.total_cents }))} />
          </Section>
        )}

        {s.by_method.length > 0 && (
          <Section title="Cobrado por medio de pago" icon={Landmark}>
            <Bars rows={s.by_method.map((m) => ({ label: methodLabel(m.method), cents: m.total_cents }))} />
          </Section>
        )}
      </div>
      <p className="px-1 text-center text-xs text-muted lg:hidden">Para ver más detalle, entrá desde una computadora.</p>

      {s.simulated.payments_count > 0 && <p className="px-1 text-sm text-muted">Además hay {formatMoney(s.simulated.total_cents)} de pagos de prueba. No es plata real y no se suma en ningún número de acá.</p>}
    </div>
  );
}

const monthLabel = (m: string) => new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-01T12:00:00Z`)).replace(".", "");

/** Barras horizontales simples, todas en la misma escala (la mayor ocupa todo el ancho). */
function Bars({ rows }: { rows: { label: string; cents: number }[] }) {
  const max = Math.max(...rows.map((r) => r.cents), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-soft"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round((r.cents / max) * 100))}%` }} /></span>
          <span className="tabular font-medium">{formatMoney(r.cents)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Si el número es de un período o un saldo de hoy, dicho con palabras. */
const Scope = ({ children }: { children: string }) => <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-muted">{children}</span>;

/** Un número grande con su ícono, de qué período es y una línea que lo explica. Si lleva `to`, toda la tarjeta lleva a su lista. */
function Tile({ tone, icon: Icon, label, scope, money, note, to }: { tone: keyof typeof TONE; icon: LucideIcon; label: string; scope: string; money: string; note: string; to?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2.5 text-sm font-medium"><span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", TONE[tone].chip)}><Icon size={18} /></span><span className="leading-tight">{label}</span></p>
        <Scope>{scope}</Scope>
      </div>
      <Amount value={money} mobile={34} desktop={40} className="mt-4" />
      {note && <p className="mt-2.5 text-xs leading-snug text-muted">{note}{to && <span className="font-medium text-secondary"> · Ver ›</span>}</p>}
    </>
  );
  const cls = cn("block min-w-0 rounded-2xl p-4 sm:p-5", TONE[tone].tile);
  return to ? <Link to={to} className={cn(cls, "transition hover:opacity-90")}>{body}</Link> : <div className={cls}>{body}</div>;
}
