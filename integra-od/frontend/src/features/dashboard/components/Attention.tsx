import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { plural } from "@/lib/plural";
import type { Summary } from "@/types";

/** Lo que pide acción hoy. Si no hay nada, lo dice: la ausencia de avisos también es información. */
export function Attention({ s }: { s: Summary }) {
  const items: { text: string; to: string; action: string }[] = [];
  // Lo más importante primero: dinero que un proveedor aprobó pero no coincide con ningún cobro (error o intento de estafa).
  if (s.review_count > 0) items.push({ text: `${plural(s.review_count, "pago", "pagos")} de Mercado Pago no coincide con ningún cobro. Revisalo para no perder dinero.`, to: "/cobros?tab=revisar", action: "Revisar" });
  if (s.pending_requests.expired_count > 0) items.push({ text: `${plural(s.pending_requests.expired_count, "cobro vencido", "cobros vencidos")} por ${formatMoney(s.pending_requests.expired_cents)}.`, to: "/cobros?estado=vencidos", action: "Ver cobros" });
  if (s.money_unapplied_cents > 0) items.push({ text: `Recibiste ${formatMoney(s.money_unapplied_cents)} que todavía no está en ningún presupuesto.`, to: "/cobros?tab=recibidos", action: "Elegir presupuesto" });
  if (s.stale_sent_count > 0) items.push({ text: `${plural(s.stale_sent_count, "presupuesto enviado", "presupuestos enviados")} hace más de 7 días sin respuesta.`, to: "/presupuestos", action: "Ver presupuestos" });

  if (items.length === 0) {
    return <p className="flex items-center gap-2 text-sm text-success px-1"><CheckCircle2 size={18} />Todo al día: no hay nada pendiente de revisar.</p>;
  }
  return (
    <section aria-label="Para hacer ahora" className="space-y-2">
      <h2 className="text-sm font-medium text-muted px-1">Para hacer ahora</h2>
      {items.map((i) => (
        <Link key={i.text} to={i.to} className="flex items-center gap-3 rounded-xl border border-warning/40 bg-white px-4 py-3 text-sm hover:bg-soft">
          <span>{i.text}</span>
          <span className="ml-auto text-secondary font-medium whitespace-nowrap">{i.action}</span>
          <span className="grid place-items-center h-8 w-8 rounded-lg bg-warning/10 text-warning shrink-0"><AlertCircle size={18} /></span>
        </Link>
      ))}
    </section>
  );
}
