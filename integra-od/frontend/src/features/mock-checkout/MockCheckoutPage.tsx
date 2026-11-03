import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/currency";

interface View { clinic: { name: string }; concept: string; amount_cents: number; status: string }
type Outcome = "approved" | "rejected" | "pending";

/** Imita el checkout de Mercado Pago para el piloto. No se cobra dinero real. */
export function MockCheckoutPage() {
  const { publicId = "" } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <main className="min-h-dvh bg-[#EDEDED] px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <p role="note" className="flex items-center gap-2 rounded-xl bg-warning/15 px-4 py-3 text-sm text-[#7a5222]">
          <FlaskConical size={18} className="shrink-0" />
          Simulación de Mercado Pago para el piloto. No se cobra dinero real.
        </p>
        <div className="rounded-2xl bg-white p-6 space-y-5 border">
          <p className="text-sm font-semibold text-[#2D3277]">Mercado Pago <span className="font-normal text-muted">(simulado)</span></p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {!view && !error && <p className="text-sm text-muted">Cargando…</p>}
          {view && (
            <>
              <div>
                <p className="text-sm text-muted">Le pagás a {view.clinic.name || "el negocio"}</p>
                <p className="font-medium">{view.concept}</p>
                <p className="text-3xl font-semibold tabular mt-2">{formatMoney(view.amount_cents)}</p>
              </div>
              <div className="space-y-2">
                <button disabled={busy} onClick={() => pay("approved")} className="w-full h-11 rounded-lg bg-[#3483FA] text-white text-sm font-medium disabled:opacity-50 cursor-pointer">Pagar</button>
                <p className="text-xs text-muted pt-2">Para probar otros resultados:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy} onClick={() => pay("rejected")} className="h-10 rounded-lg border text-sm hover:bg-soft disabled:opacity-50 cursor-pointer">Pago rechazado</button>
                  <button disabled={busy} onClick={() => pay("pending")} className="h-10 rounded-lg border text-sm hover:bg-soft disabled:opacity-50 cursor-pointer">Pago pendiente</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
