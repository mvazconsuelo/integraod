import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { methodLabel } from "@/lib/formatters";
import type { PaymentRequest, Received, ReviewItem } from "@/types";
import { VoidDialog } from "./VoidDialog";

/**
 * Lo que pide una decisión, solo cuando existe: pagos de Mercado Pago que no coinciden con ningún pedido,
 * pagos que no coinciden con ningún pedido y pedidos vencidos. Si no hay nada, no se muestra nada.
 */
export function NeedsAttention() {
  const requests = useApi<PaymentRequest[]>("/payments");
  const received = useApi<Received[]>("/payments/received");
  const review = useApi<ReviewItem[]>("/payments/review");
  const [dismissId, setDismissId] = useState<string | null>(null);
  const reload = () => { void requests.reload(); void received.reload(); void review.reload(); };

  const rows: { key: string; text: string; action: React.ReactNode }[] = [];
  for (const r of review.data ?? []) rows.push({ key: `r-${r.id}`, text: `${methodLabel(r.provider)} aprobó ${r.amount_cents !== null ? formatMoney(r.amount_cents) : "un pago"} que no coincide con ningún cobro pendiente. No cuenta como cobrado.`, action: <Button size="sm" variant="secondary" onClick={() => setDismissId(r.id)}>Ya lo revisé</Button> });
  for (const r of (requests.data ?? []).filter((x) => x.display_status === "expired")) rows.push({ key: `e-${r.id}`, text: `${r.patient_ref}: el cobro de ${formatMoney(r.amount_cents)} venció.`, action: r.budget_id ? <Button size="sm" variant="secondary" asChild><Link to={`/presupuestos/${r.budget_id}`}>Ver</Link></Button> : null });
  if (rows.length === 0) return null;

  return (
    <section aria-label="Para resolver" className="mb-6 divide-y rounded-xl border border-warning/40 bg-warning/5">
      {rows.slice(0, 4).map((x) => (
        <div key={x.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1">{x.text}</p>
          {x.action}
        </div>
      ))}
      {rows.length > 4 && <p className="px-4 py-2 text-xs text-muted">Y {rows.length - 4} más.</p>}
      {dismissId && <VoidDialog open onOpenChange={() => setDismissId(null)} title="Marcar como revisado" description="Queda registrado con tu motivo. No suma dinero: si corresponde cobrarlo, registralo como pago del presupuesto." confirmLabel="Marcar como revisado" placeholder="Ej: lo devolví al pagador" tone="primary" path={`/payments/review/${dismissId}/dismiss`} onDone={reload} />}
    </section>
  );
}
