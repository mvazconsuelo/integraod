import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, FilePlus2, ListChecks, Wallet } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { PERIODS, resolveRange, type Period } from "@/lib/period";
import { clinicTimeZone } from "@/lib/time-zone";
import type { Summary } from "@/types";

// Los períodos rápidos (sin fechas a medida: eso se elige en Control).
const QUICK = PERIODS.filter((p) => p.value !== "custom");
const KEY = "integraod.home.period";

const readPeriod = (): Period => {
  try { const v = localStorage.getItem(KEY); if (QUICK.some((p) => p.value === v)) return v as Period; } catch { /* sin storage */ }
  return "month";
};

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("es-AR", { hour: "numeric", hourCycle: "h23", timeZone: clinicTimeZone() }).format(new Date()));
  return hour < 6 ? "Buenas noches" : hour < 13 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";
}

/**
 * Inicio: lo que se hace todos los días y nada más. Crear un presupuesto, anotar un cobro, ver lo pendiente,
 * y dos números (cobrado y por cobrar). El detalle y los análisis están en Control.
 */
export function HomePage() {
  const [period, setPeriod] = useState<Period>(readPeriod);
  const range = useMemo(() => resolveRange({ period, from: "", to: "" }), [period]);
  const { data: s, error, reload } = useApi<Summary>(range ? `/dashboard?from=${range.from}&to=${range.to}` : null);
  const choose = (v: string) => { setPeriod(v as Period); try { localStorage.setItem(KEY, v); } catch { /* sin storage */ } };

  return (
    <div className="mx-auto max-w-2xl space-y-5 sm:space-y-6">
      <div className="pt-2 sm:pt-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting()}</h1>
        <p className="mt-1 text-lg text-muted">¿Qué querés hacer ahora?</p>
      </div>

      <Link
        to="/presupuestos/nuevo"
        className="group flex items-center gap-3 rounded-3xl bg-primary p-4 text-white shadow-[0_18px_36px_-18px_rgba(23,59,54,0.7)] transition active:scale-[0.99] sm:gap-5 sm:p-7"
      >
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/12 sm:h-16 sm:w-16"><FilePlus2 size={28} strokeWidth={1.75} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-semibold tracking-tight sm:text-3xl">Crear presupuesto</span>
          <span className="mt-1 block text-sm text-white/85 sm:text-base">Presupuestá, compartí y cobrá en segundos.</span>
        </span>
        <ChevronRight aria-hidden size={26} className="shrink-0 transition group-hover:translate-x-0.5" />
      </Link>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <QuickAction to="/cobros?pago=1" icon={<Wallet size={26} strokeWidth={1.75} />} title="Registrar cobro" text="Anotá un pago recibido." />
        <QuickAction to="/cobros?estado=pendientes" icon={<ListChecks size={26} strokeWidth={1.75} />} title="Ver pendientes" text="Cobros y saldos por recibir." />
      </div>

      <section aria-label="Resumen" className="rounded-3xl border bg-white p-4 shadow-[0_8px_24px_-16px_rgba(23,59,54,0.25)] sm:p-5">
        <div className="flex items-center gap-2 text-muted">
          <CalendarDays aria-hidden size={18} />
          <div className="w-44"><Dropdown searchable={false} ariaLabel="Período del resumen" placeholder="Período" value={period} onChange={choose} options={QUICK.map((p) => ({ value: p.value, label: p.label }))} /></div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:gap-6">
          <div>
            <dt className="text-sm text-muted">Cobrado</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular sm:text-3xl">{s ? formatMoney(s.collected_cents) : "—"}</dd>
          </div>
          <div className="border-l pl-4 sm:pl-6">
            <dt className="text-sm text-muted">Por cobrar</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular sm:text-3xl">{s ? formatMoney(s.budgets_balance_cents) : "—"}</dd>
            <p className="mt-0.5 text-xs text-muted">al día de hoy</p>
          </div>
        </dl>
        {error && <p role="alert" className="mt-3 text-sm text-danger">No pudimos cargar los números. <button type="button" onClick={() => void reload()} className="cursor-pointer font-medium underline">Reintentar</button></p>}
        {s && s.simulated.payments_count > 0 && (
          <p className="mt-4 rounded-xl bg-warning/10 px-3 py-2 text-xs text-[#7a5222]">Hay {formatMoney(s.simulated.total_cents)} en pagos simulados del piloto. No son dinero y no se suman.</p>
        )}
      </section>

      <p className="text-center text-sm text-muted"><Link to="/control" className="font-medium text-secondary hover:underline">Ver todas las métricas en Control</Link></p>
    </div>
  );
}

function QuickAction({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-[0_8px_24px_-18px_rgba(23,59,54,0.3)] transition hover:bg-soft/50 active:scale-[0.99] sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <span aria-hidden className="text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-tight sm:text-lg">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </Link>
  );
}
