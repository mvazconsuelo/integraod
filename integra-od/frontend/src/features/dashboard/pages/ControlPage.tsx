import { useMemo, useState } from "react";
import { BarChart3, CalendarClock, CircleCheck, FileText, HandCoins, Hourglass, Percent, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { Amount } from "@/components/shared/Amount";
import { PageHeader } from "@/components/shared/PageHeader";
import { PeriodPicker } from "@/components/shared/PeriodPicker";
import { Section } from "@/components/shared/Section";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
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
 * Control: cómo viene el negocio, en tres bloques. Cada número dice si es del período elegido o un saldo de hoy,
 * y cómo se calcula. Los importes grandes; los conteos, más chicos. Los números salen del servidor (dashboard.service).
 */
export function ControlPage() {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod("month"));
  const range = useMemo(() => resolveRange(period), [period]);
  const { data: s, error, loading, reload } = useApi<Summary>(range ? `/dashboard?from=${range.from}&to=${range.to}` : null);
  const empty = s && s.onboarding.budgets === 0 && s.onboarding.collections === 0;

  return (
    <div className="mx-auto max-w-3xl pb-6">
      <PageHeader title="Control" icon={BarChart3} subtitle={range ? describeRange(range.from, range.to) : "Elegí las dos fechas"} action={<PeriodPicker value={period} onChange={setPeriod} options={OPTIONS} />} />
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {range && loading && !s && <Loading />}
      {empty && <EmptyState message="Todavía no hay nada para mostrar. Cuando armes un presupuesto y cobres, vas a ver acá cómo te va." />}
      {range && s && !empty && <Body s={s} />}
    </div>
  );
}

function Body({ s }: { s: Summary }) {
  const a = s.acceptance;
  const answered = a.accepted + a.declined;
  const money = [formatMoney(s.collected_cents), formatMoney(s.budgets_balance_cents)];
  const long = Math.max(...money.map((m) => m.length)) > 13; // importes muy largos: una columna para que respiren
  return (
    <div className="space-y-5">
      <Section title="Cómo te va" icon={BarChart3}>
        <div className={cn("grid gap-3", long ? "grid-cols-1" : "sm:grid-cols-2")}>
          <Tile tone="success" icon={Wallet} label="Plata que te entró" scope="En estas fechas" money={money[0]} how="Lo que ya cobraste de verdad." />
          <Tile tone="warning" icon={Hourglass} label="Todavía te deben" scope="Hoy" money={money[1]} how="Lo que falta cobrar de los presupuestos que ya empezaron a pagarse." />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Count tone="soft" icon={FileText} label="Presupuestos hechos" scope="En estas fechas" value={s.budgets_emitted_count} how="Los que armaste." />
          <Count tone="success" icon={CircleCheck} label="Presupuestos aceptados" scope="En estas fechas" value={s.jobs_concreted.count} how="Los que recibieron su primer pago." />
        </div>
      </Section>

      <Section title="Tus ventas" icon={TrendingUp}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Tile tone="soft" icon={HandCoins} label="Promedio por presupuesto" scope="En estas fechas" money={s.average_job_cents === null ? "—" : formatMoney(s.average_job_cents)} how={s.jobs_concreted.count > 0 ? `Cuánto cuesta, en promedio, ${s.jobs_concreted.count === 1 ? "el presupuesto aceptado" : `cada uno de los ${s.jobs_concreted.count} presupuestos aceptados`}.` : "Todavía no te aceptaron ninguno en estas fechas."} />
          <Tile tone="soft" icon={Percent} label="Cuántos te dicen que sí" scope="De los de estas fechas" money={a.rate_pct === null ? "—" : `${a.rate_pct} %`} how={answered > 0 ? `Aceptaron ${a.accepted} de ${answered} que ya contestaron${a.waiting > 0 ? `. ${a.waiting === 1 ? "El que todavía no contestó no cuenta" : `Los ${a.waiting} que todavía no contestaron no cuentan`}` : ""}.` : a.emitted > 0 ? `Todavía no contestó ${a.emitted === 1 ? "el presupuesto que hiciste" : `ninguno de los ${a.emitted} que hiciste`}.` : "No hiciste presupuestos en estas fechas."} />
        </div>
      </Section>

      <Section title="Tus cobros" icon={CalendarClock} flush>
        <dl className="divide-y px-5 pb-2 sm:px-6">
          <Line label="Presupuestos con plata por cobrar" scope="Hoy" value={s.open_jobs_count} how="Ya pagaron algo, pero falta el resto." />
          <Line label="Pagos que te hicieron" scope="En estas fechas" value={s.payments_count} how="Cada pago cuenta una sola vez." />
          <Line label="Anticipos que te pagaron" scope="En estas fechas" value={s.advances_received_count} how="Cuántos presupuestos ya tienen su anticipo." />
        </dl>
      </Section>

      {s.simulated.payments_count > 0 && <p className="px-1 text-sm text-muted">Además hay {formatMoney(s.simulated.total_cents)} de pagos de prueba. No es plata real y no se suma en ningún número de acá.</p>}
    </div>
  );
}

/** Si el número es de un período o un saldo de hoy, dicho con palabras. */
const Scope = ({ children }: { children: string }) => <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-muted">{children}</span>;

/** Un importe (o porcentaje) grande, con su ícono. */
function Tile({ tone, icon: Icon, label, scope, money, how }: { tone: keyof typeof TONE; icon: LucideIcon; label: string; scope: string; money: string; how: string }) {
  return (
    <div className={cn("min-w-0 rounded-2xl p-4 sm:p-5", TONE[tone].tile)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2.5 text-sm font-medium"><span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", TONE[tone].chip)}><Icon size={18} /></span><span className="leading-tight">{label}</span></p>
        <Scope>{scope}</Scope>
      </div>
      <Amount value={money} mobile={34} desktop={40} className="mt-4" />
      <p className="mt-2.5 text-xs leading-snug text-muted">{how}</p>
    </div>
  );
}

/** Una cantidad: más chica que los importes. */
function Count({ tone, icon: Icon, label, scope, value, how }: { tone: keyof typeof TONE; icon: LucideIcon; label: string; scope: string; value: number; how: string }) {
  return (
    <div className={cn("min-w-0 rounded-2xl p-4", TONE[tone].tile)}>
      <span aria-hidden className={cn("grid h-8 w-8 place-items-center rounded-full", TONE[tone].chip)}><Icon size={16} /></span>
      <p className="mt-3 text-3xl font-semibold leading-none tracking-tight tabular">{value}</p>
      <p className="mt-2 text-sm font-medium leading-tight">{label}</p>
      <p className="mt-1 text-xs leading-snug text-muted">{how} <span className="whitespace-nowrap">· {scope}</span></p>
    </div>
  );
}

function Line({ label, scope, value, how }: { label: string; scope: string; value: number; how: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <dt className="font-medium leading-tight">{label}</dt>
        <p className="mt-0.5 text-xs text-muted">{how} <span className="whitespace-nowrap">· {scope}</span></p>
      </div>
      <dd className="shrink-0 text-2xl font-semibold tabular">{value}</dd>
    </div>
  );
}
