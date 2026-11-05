import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PAYMENT_MODE_LABEL } from "@/lib/formatters";
import type { BudgetDetail } from "@/types";
import { setPaymentMode } from "../services/budgets.service";

type Mode = BudgetDetail["payment_mode"];

/**
 * Cómo se acordó cobrar (pago total, anticipo + saldo, pagos parciales). Es un dato aparte del dinero recibido: se define a mano
 * y no se deduce de los pagos. Al elegir, se ve al instante y se guarda; si no se pudo guardar, vuelve a lo anterior y lo avisa.
 */
export function PaymentModeRow({ budgetId, mode }: { budgetId: string; mode: Mode }) {
  const [shown, setShown] = useState<Mode>(mode);
  const [error, setError] = useState("");
  useEffect(() => setShown(mode), [mode]);
  const options = ["total", "advance", "partial"] as const;

  const pick = async (o: (typeof options)[number]) => {
    const next = shown === o ? null : o;
    const before = shown;
    setShown(next); setError("");
    try { await setPaymentMode(budgetId, next); } catch (e) { setShown(before); setError(e instanceof Error ? e.message : "No pudimos guardar la modalidad."); }
  };

  return (
    <section aria-label="Cómo se cobra" className="mb-4 space-y-3 rounded-3xl border bg-white p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold">Cómo se cobra</h2>
        <p className="mt-0.5 text-sm text-muted">Se guarda al elegir. Tocá de nuevo para quitarla.</p>
      </div>
      <div role="radiogroup" aria-label="Modalidad de cobro" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={shown === o} onClick={() => void pick(o)}
            className={cn("h-9 cursor-pointer rounded-full border px-3.5 text-sm font-medium transition", shown === o ? "border-primary bg-primary text-white" : "border-secondary/30 bg-white text-secondary hover:bg-soft")}>{PAYMENT_MODE_LABEL[o]}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
