import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { useFixedPage } from "@/hooks/useFixedPage";

interface View { clinic: { name: string }; concept: string; amount_cents: number; status: string }
type Outcome = "approved" | "rejected" | "pending";

/** Imita el checkout de Mercado Pago para el piloto. No se cobra dinero real. */
export function MockCheckoutPage() {
  const { publicId = "" } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useFixedPage();

  useEffect(() => {
    api<View>(`/public/payments/${encodeURIComponent(publicId)}`, { auth: false }).then(setView).catch((e) => setError(e instanceof Error ? e.message : "No pudimos cargar el pago."));
  }, [publicId]);

  const pay = async (outcome: Outcome) => {
    setBusy(true);
    setError("");
    try {
      await api(`/mock/checkout/${encodeURIComponent(publicId)}`, { body: { outcome }, auth: false });
      navigate(`/pay/${publicId}?resultado=${outcome}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos simular el pago.");
      setBusy(false);
    }
  };

  // Misma estructura que la página de pago: ocupa la pantalla, lo que se paga arriba (scrollea si no entra) y Pagar siempre abajo.
  return (
    <main className="flex h-dvh items-stretch justify-center bg-[#EDEDED] sm:items-center sm:px-4 sm:py-8">
      <div className="flex h-full w-full max-w-md flex-col bg-white sm:h-auto sm:max-h-full sm:rounded-2xl sm:border">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:p-6">
          <p role="note" className="flex items-center gap-2 rounded-xl bg-warning/15 px-4 py-3 text-sm text-[#7a5222]">
            <FlaskConical size={18} className="shrink-0" />
            Simulación de Mercado Pago para el piloto. No se cobra dinero real.
          </p>
          <p className="text-sm font-semibold text-[#2D3277]">Mercado Pago <span className="font-normal text-muted">(simulado)</span></p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {!view && !error && <p className="text-sm text-muted">Cargando…</p>}
          {view && (
            <div>
              <p className="text-sm text-muted">Le pagás a {view.clinic.name || "el negocio"}</p>
              <p className="font-medium">{view.concept}</p>
              <p className="mt-2 text-3xl font-semibold tabular">{formatMoney(view.amount_cents)}</p>
            </div>
          )}
        </div>
        {view && (
          <footer className="shrink-0 space-y-2 border-t px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
            <button disabled={busy} onClick={() => pay("approved")} className="h-12 w-full cursor-pointer rounded-lg bg-[#3483FA] text-base font-medium text-white disabled:opacity-50">Pagar</button>
            <p className="pt-1 text-xs text-muted">Para probar otros resultados:</p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => pay("rejected")} className="h-10 cursor-pointer rounded-lg border text-sm hover:bg-soft disabled:opacity-50">Pago rechazado</button>
              <button disabled={busy} onClick={() => pay("pending")} className="h-10 cursor-pointer rounded-lg border text-sm hover:bg-soft disabled:opacity-50">Pago pendiente</button>
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}
