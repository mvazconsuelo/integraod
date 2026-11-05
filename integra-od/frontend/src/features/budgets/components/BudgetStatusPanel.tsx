import { useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/currency";
import { formatDate, methodLabel } from "@/lib/formatters";
import type { BudgetDetail, BudgetStatus } from "@/types";

export type CancelMode = "confirm" | "blocked" | null;

/**
 * Los diálogos de cancelar: confirmar, o explicar por qué no se puede todavía (hay pagos aplicados que se resuelven primero).
 * No cancela nada solo y no desasocia pagos: el historial se conserva.
 */
export function BudgetCancelFlow({ budget: b, mode, onClose, onChange }: { budget: BudgetDetail; mode: CancelMode; onClose: () => void; onChange: (status: BudgetStatus) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!mode) return null;

  if (mode === "blocked") {
    const paid = b.applications.filter((a) => !a.voided_at);
    return (
      <Dialog open onOpenChange={onClose} title="No se puede cancelar" description="Tiene pagos cobrados: primero hay que anularlos.">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-warning/15 p-4">
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-warning/25 text-[#8a5d2b]"><TriangleAlert size={22} /></span>
            <div className="min-w-0">
              <p className="text-sm text-muted">Ya cobraste</p>
              <p className="text-2xl font-semibold leading-tight tabular">{formatMoney(b.applied_cents)}</p>
            </div>
          </div>

          <ol className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-medium">
            <li className="rounded-xl bg-primary px-3 py-2.5 text-center text-white"><span className="mr-1.5 opacity-70">1</span>Anulá los pagos</li>
            <ChevronRight size={16} aria-hidden className="text-muted" />
            <li className="rounded-xl bg-soft px-3 py-2.5 text-center text-muted"><span className="mr-1.5 opacity-70">2</span>Cancelá</li>
          </ol>

          <ul className="divide-y rounded-2xl border text-sm">
            {paid.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <span className="min-w-0"><span className="block font-medium">{methodLabel(a.method)}</span><span className="block text-xs text-muted">{formatDate(a.paid_at)}</span></span>
                <span className="shrink-0 text-base font-semibold tabular">{formatMoney(a.amount_cents)}</span>
              </li>
            ))}
          </ul>

          <Button className="w-full" onClick={() => { onClose(); setTimeout(() => document.getElementById("pagos")?.scrollIntoView({ behavior: "smooth" }), 50); }}>Ver los pagos</Button>
        </div>
      </Dialog>
    );
  }

  const run = async () => { setBusy(true); try { await onChange("cancelled"); } finally { setBusy(false); onClose(); } };
  return (
    <Dialog open onOpenChange={onClose} title="¿Cancelar este presupuesto?" description="Se cierran sus links de pago y queda en el historial. Podés reabrirlo cuando quieras.">
      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onClose}>No, volver</Button>
        <Button variant="danger" className="flex-1" disabled={busy} onClick={() => void run()}>Sí, cancelar</Button>
      </div>
    </Dialog>
  );
}
