import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { PeriodPicker } from "@/components/shared/PeriodPicker";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { defaultPeriod, describeRange, PERIODS, resolveRange, type PeriodValue } from "@/lib/period";
import type { Summary } from "@/types";
import { Attention } from "../components/Attention";
import { GettingStarted, onboardingSteps } from "../components/GettingStarted";
import { BudgetsStatsCard, CollectedCard, OpenBudgetsCard, PeriodCard, ToCollectCard } from "../components/SummaryCards";

const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");

export function ControlPage() {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod());
  const range = useMemo(() => resolveRange(period), [period]);
  const { data: s, error, loading, reload } = useApi<Summary>(range ? `/dashboard?from=${range.from}&to=${range.to}` : null);
  const title = period.period === "custom" ? "Fechas elegidas" : (PERIODS.find((p) => p.value === period.period)?.label ?? "Período");

  return (
    <>
      <PageHeader title="Control" subtitle="Cómo viene el dinero. Cada número dice cómo se calcula." action={<PeriodPicker value={period} onChange={setPeriod} />} />
      
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {range && loading && !s && <Loading />}
      {range && s && s.onboarding.budgets === 0 && s.onboarding.collections === 0 && <GettingStarted s={s} welcome />}
      {range && s && !(s.onboarding.budgets === 0 && s.onboarding.collections === 0) && (
        <div className="space-y-6">
          {onboardingSteps(s).some((x) => !x.done) ? <GettingStarted s={s} welcome={false} /> : <Attention s={s} />}

          {/* Lo que pasó en el período elegido */}
          <section aria-label={title}>
            <SectionTitle title={title} hint={range ? describeRange(range.from, range.to) : undefined} />
            <div className="grid gap-3 lg:grid-cols-2">
              <CollectedCard s={s} />
              <PeriodCard s={s} />
              <BudgetsStatsCard s={s} />
            </div>
          </section>

          {/* Cómo está todo hoy: no cambia con el período */}
          <section aria-label="Al día de hoy">
            <SectionTitle title="Al día de hoy" hint="No cambia con el período" />
            <div className="grid gap-3 md:grid-cols-2">
              <ToCollectCard s={s} />
              <OpenBudgetsCard s={s} />
            </div>
          </section>

          {s.monthly.length > 1 && <MonthlyCard s={s} />}

        </div>
      )}
    </>
  );
}

/** Título de un bloque del Resumen: el nombre y, al lado, aclarado en gris a qué fechas o situación corresponde. */
const SectionTitle = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
    <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    {hint && <p className="text-sm text-muted">{hint}</p>}
  </div>
);

function MonthlyCard({ s }: { s: Summary }) {
  const data = s.monthly.map((m) => ({ mes: monthLabel(m.month), total: m.total_cents / 100 }));
  return (
    <Card className="p-5">
      <h2 className="font-medium">Evolución de cobros</h2>
      <p className="mb-4 text-xs text-muted">Lo cobrado en cada mes (pagos confirmados y reales, por día de cobro).</p>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E3E9E5" />
            <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} stroke="#5F6F69" />
            <YAxis hide />
            <Tooltip cursor={{ fill: "#E9F0EC" }} formatter={(v: number) => [formatMoney(v * 100), "Cobrado"]} />
            <Bar dataKey="total" fill="#52796F" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
