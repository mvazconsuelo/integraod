import { useState } from "react";
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
    return (
      <Dialog open onOpenChange={onClose} title="Este presupuesto tiene pagos" description={`Ya se aplicaron ${formatMoney(b.applied_cents)}. Para cancelarlo hay que resolver esos pagos primero; no se borra nada y el historial queda guardado.`}>
        <ul className="mb-4 divide-y rounded-lg border text-sm">
          {b.applications.filter((a) => !a.voided_at).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-3">
              <span>{methodLabel(a.method)} · {formatDate(a.paid_at)}</span>
              <span className="tabular font-medium">{formatMoney(a.amount_cents)}</span>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-sm text-muted">Anulá cada pago desde la lista de pagos (si hubo una devolución, queda registrada con su motivo). Cuando no quede ninguno, vas a poder cancelar.</p>
        <Button className="w-full" onClick={() => { onClose(); setTimeout(() => document.getElementById("pagos")?.scrollIntoView({ behavior: "smooth" }), 50); }}>Ver los pagos</Button>
      </Dialog>
    );
  }

  const run = async () => { setBusy(true); try { await onChange("cancelled"); } finally { setBusy(false); onClose(); } };
  return (
    <Dialog open onOpenChange={onClose} title="¿Cancelar este presupuesto?" description="Se cierran sus links de pago sin pagar y deja de recibir cobros. Queda en el historial y podés reabrirlo.">
      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onClose}>No, volver</Button>
        <Button variant="danger" className="flex-1" disabled={busy} onClick={() => void run()}>Sí, cancelar</Button>
      </div>
    </Dialog>
  );
}
