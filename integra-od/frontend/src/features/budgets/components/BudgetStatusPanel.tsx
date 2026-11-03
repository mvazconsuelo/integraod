import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatMoney } from "@/lib/currency";
import { formatDate, methodLabel } from "@/lib/formatters";
import type { BudgetDetail, BudgetStatus } from "@/types";

/** Qué significa el estado, en una frase. "En curso" y "Completado" los asigna el sistema según los pagos. */
function sentence(b: BudgetDetail): string {
  switch (b.status) {
    case "in_progress": return `Ya hay pagos. Se completa solo cuando se cobre todo (faltan ${formatMoney(b.balance_cents)}).`;
    case "completed": return "Está todo cobrado. Si anulás un pago, vuelve a En curso.";
    case "cancelled": return "No recibe cobros nuevos y sus links de pago están cerrados.";
    default: return "Todavía sin pagos. Con el primer pago pasa solo a En curso.";
  }
}

/** Estado en una línea, y lo único que se puede hacer según el estado: cancelar o reabrir. */
export function BudgetStatusPanel({ budget: b, onChange }: { budget: BudgetDetail; onChange: (status: BudgetStatus) => Promise<void> }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const canCancel = b.status !== "cancelled" && b.status !== "completed";

  const run = async (status: BudgetStatus) => {
    setBusy(true);
    try { await onChange(status); } finally { setBusy(false); setConfirmCancel(false); }
  };

  return (
    <section aria-label="Estado" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4">
      <div className="min-w-0 space-y-1.5">
        <StatusBadge kind="budget" status={b.status} />
        <p className="text-sm text-muted">{sentence(b)}</p>
      </div>
      <div className="flex gap-2">
        {b.status === "cancelled" && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run("sent")}>Reabrir presupuesto</Button>}
        {canCancel && (b.applied_cents > 0
          ? <Button variant="ghost" size="sm" onClick={() => setBlocked(true)}>¿Por qué no puedo cancelarlo?</Button>
          : <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancelar presupuesto</Button>)}
      </div>

      {blocked && (
        <Dialog open onOpenChange={setBlocked} title="Este presupuesto tiene pagos" description={`Ya se aplicaron ${formatMoney(b.applied_cents)} a este presupuesto. Para cancelarlo hay que resolver esos pagos primero; no se borra nada y el historial queda guardado.`}>
          <ul className="mb-4 divide-y rounded-lg border text-sm">
            {b.applications.filter((a) => !a.voided_at).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 p-3">
                <span>{methodLabel(a.method)} · {formatDate(a.paid_at)}</span>
                <span className="tabular font-medium">{formatMoney(a.amount_cents)}</span>
              </li>
            ))}
          </ul>
          <p className="mb-4 text-sm text-muted">Anulá cada pago con el botón «Anular» de la lista de pagos (si hubo una devolución, queda registrada con su motivo). Cuando no quede ninguno, vas a poder cancelar.</p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setBlocked(false)}>Cerrar</Button>
            <Button className="flex-1" onClick={() => { setBlocked(false); setTimeout(() => document.getElementById("movimientos")?.scrollIntoView({ behavior: "smooth" }), 50); }}>Ver movimientos</Button>
          </div>
        </Dialog>
      )}

      {confirmCancel && (
        <Dialog open onOpenChange={setConfirmCancel} title="¿Cancelar este presupuesto?" description="Se cierran sus links de pago sin pagar y deja de recibir cobros. Queda en el historial y podés reabrirlo.">
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmCancel(false)}>No, volver</Button>
            <Button variant="danger" className="flex-1" disabled={busy} onClick={() => void run("cancelled")}>Sí, cancelar</Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
