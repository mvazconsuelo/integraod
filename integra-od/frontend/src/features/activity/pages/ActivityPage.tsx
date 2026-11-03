import { Link } from "react-router-dom";
import { FilePlus2, HandCoins, Undo2, Wallet } from "lucide-react";
import { History } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ActivityTabs } from "@/components/shared/ActivityTabs";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatDate, localDay, today, addDays } from "@/lib/formatters";
import { clinicTimeZone } from "@/lib/time-zone";
import type { ActivityEvent } from "@/types";

const ICON = { budget: FilePlus2, request: HandCoins, payment: Wallet, adjustment: Undo2 } as const;
const TONE = { budget: "bg-soft text-primary", request: "bg-warning/10 text-[#8a5d2b]", payment: "bg-success/10 text-success", adjustment: "bg-danger/10 text-danger" } as const;

const time = (iso: string) => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: clinicTimeZone() }).format(new Date(iso));

function dayLabel(day: string): string {
  if (day === today()) return "Hoy";
  if (day === addDays(today(), -1)) return "Ayer";
  return formatDate(day);
}

/** Historial: lo que fue pasando, en frases y del más nuevo al más viejo. Cada línea lleva a su contexto. */
export function ActivityPage() {
  const { data, error, loading, reload } = useApi<ActivityEvent[]>("/activity");
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of data ?? []) { const d = localDay(e.at); groups.set(d, [...(groups.get(d) ?? []), e]); }

  return (
    <>
      <ActivityTabs />
      <PageHeader title="Historial" icon={History} />
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data?.length === 0 && <EmptyState message="Todavía no hay movimientos. Cuando crees un presupuesto o recibas un pago, lo vas a ver acá." />}
      <div className="space-y-6">
        {[...groups].map(([day, events]) => (
          <section key={day} aria-label={dayLabel(day)}>
            <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted">{dayLabel(day)}</h2>
            <div className="divide-y overflow-hidden rounded-3xl border bg-white">
              {events.map((e) => {
                const Icon = ICON[e.type];
                return (
                  <Link key={e.id} to={e.to} className="flex items-start gap-3 px-4 py-4 hover:bg-soft/50 sm:px-5">
                    <span aria-hidden className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${TONE[e.type]}`}><Icon size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-snug">{e.text}</span>
                      {e.detail && <span className="block text-sm text-muted">{e.detail}</span>}
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted">{time(e.at)}{e.simulated && <span className="block font-medium text-[#8a5d2b]">simulado</span>}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
