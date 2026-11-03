import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/formatters";
import type { TimelineEvent } from "@/types";

/** Historial del presupuesto, plegado: se abre al tocarlo para no hacer ruido. Del más nuevo al más viejo. */
export function BudgetTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <details id="historial" className="group border-t pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-muted hover:text-foreground">
        <span>Historial</span><span aria-hidden className="transition group-open:rotate-90">›</span>
      </summary>
      {events.length === 0 ? <p className="mt-3 text-sm text-muted">Todavía no hay movimientos.</p> : (
        <ol className="mt-3 divide-y">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p>{e.title}</p>
                <p className="text-xs text-muted">{formatDate(e.at)}{e.detail && ` · ${e.detail}`}</p>
              </div>
              {e.amount_cents !== undefined && e.amount_cents > 0 && <span className={`shrink-0 tabular ${e.type === "adjustment" ? "text-danger" : ""}`}>{e.type === "adjustment" ? "− " : e.type === "payment" ? "+ " : ""}{formatMoney(e.amount_cents)}</span>}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
