import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/formatters";
import type { TimelineEvent } from "@/types";

const TAG: Record<TimelineEvent["type"], string> = { budget: "Presupuesto", request: "Cobro", payment: "Pago", adjustment: "Anulación" };

/** Todos los movimientos del presupuesto, del más nuevo al más viejo: lo que se pidió, lo que se pagó y lo que se anuló. */
export function BudgetTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Card id="movimientos" className="p-4 sm:p-6 scroll-mt-24">
      <h2 className="text-base font-semibold mb-3">Movimientos</h2>
      {events.length === 0 ? <p className="text-sm text-muted">Todavía no hay movimientos.</p> : (
        <ol className="divide-y">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{e.title}</p>
                {e.detail && <p className="text-xs text-muted">{e.detail}</p>}
                <p className="text-xs text-muted"><span className="font-medium">{TAG[e.type]}</span> · {formatDate(e.at)}</p>
              </div>
              {e.amount_cents !== undefined && e.amount_cents > 0 && (
                <span className={`shrink-0 tabular font-medium ${e.type === "adjustment" ? "text-danger" : ""}`}>{e.type === "adjustment" ? "− " : e.type === "payment" ? "+ " : ""}{formatMoney(e.amount_cents)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
