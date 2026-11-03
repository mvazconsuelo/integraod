import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { AmountField } from "@/components/shared/AmountField";
import { Field } from "@/components/shared/Field";
import { PercentQuick } from "@/components/shared/PercentQuick";
import { formatMoney } from "@/lib/currency";
import { percentOfCents } from "@/lib/percent";
import { createRequest } from "@/features/payments/services/payments.service";
import type { BudgetDetail, Settings } from "@/types";

type Mode = "online" | "cash" | "later";
const KEY = "integraod.collect";

// El consultorio suele cobrar siempre igual: se recuerda cómo y cuánto para no repetir la elección.
const readPrefs = (): { mode?: Mode; pct?: number } => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
};
const savePrefs = (p: { mode: Mode; pct: number }) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sin storage */ } };

interface Props { budget: BudgetDetail; settings: Settings; onChanged: () => void; onShare: () => void; onClose: () => void }

/**
 * Continuación natural de crear un presupuesto: cómo se cobra. Va dentro de la misma pantalla (no es una ventana)
 * y se puede dejar para después: el presupuesto ya está guardado, se pague o no.
 */
export function CollectPanel({ budget: b, settings, onChanged, onShare, onClose }: Props) {
  const onlineReady = settings.mp_connected || settings.mp_mock;
  const prefs = readPrefs();
  const [mode, setMode] = useState<Mode>(prefs.mode === "online" && !onlineReady ? "cash" : prefs.mode ?? (onlineReady ? "online" : "cash"));
  const [pct, setPct] = useState<number | null>(prefs.pct ?? 30);
  const limit = b.requestable_cents;
  const pick = (v: number) => Math.min(percentOfCents(b.total_cents, v), limit);
  const [cents, setCents] = useState(() => pick(prefs.pct ?? 30));
  const [amountKey, setAmountKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ cents: number; mode: Mode } | null>(null);

  const choosePct = (v: number) => { setPct(v); setCents(pick(v)); setAmountKey((k) => k + 1); };

  const confirm = async () => {
    setError("");
    if (mode === "later") { onShare(); return; }
    if (cents <= 0) return setError("Ingresá cuánto vas a pedir.");
    if (cents > limit) return setError(`Lo máximo que podés pedir es ${formatMoney(limit)}.`);
    setBusy(true);
    try {
      await createRequest({ method: mode, patient_ref: b.patient_ref, amount_cents: cents, budget_id: b.id, conditions: "", due_date: null });
      savePrefs({ mode, pct: pct ?? prefs.pct ?? 30 });
      setDone({ cents, mode });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos crear el cobro.");
    } finally { setBusy(false); }
  };

  if (!done && limit <= 0) return null; // ya se pidió todo lo que falta: no hay nada que configurar

  if (done) {
    return (
      <Card className="space-y-4 border-success/40 p-4 sm:p-5" role="status">
        <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 size={20} />{done.mode === "online" ? `Pediste ${formatMoney(done.cents)} con link de pago` : `Anotaste un cobro de ${formatMoney(done.cents)}`}</p>
        <p className="text-sm text-muted">{done.mode === "online" ? "Todavía no es dinero recibido: figura como pendiente hasta que el pago se confirme. Compartilo para que lo pague." : "Figura como pendiente en Cobros. Cuando te paguen, registrás el pago."}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onShare}>Compartir</Button>
          <Button variant="ghost" onClick={onClose}>Listo</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 border-primary/30 p-4 sm:p-5" role="region" aria-label="Cómo cobrar">
      <div>
        <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 size={18} />Presupuesto guardado</p>
        <h2 className="mt-1 text-lg font-semibold">¿Cómo querés cobrar?</h2>
      </div>
      <Segmented
        label="Cómo cobrar" value={mode} onChange={setMode}
        options={[
          { value: "online", label: "Con link de pago", disabled: !onlineReady },
          { value: "cash", label: "Efectivo o transferencia" },
          { value: "later", label: "Más tarde" },
        ]}
      />
      {!onlineReady && <p className="text-xs text-muted">Para cobrar con link, conectá Mercado Pago en Configuración.</p>}

      {mode !== "later" && (
        <div className="space-y-3">
          <PercentQuick selected={pct} onPick={choosePct} />
          <Field required label={mode === "online" ? "Anticipo a pedir" : "Importe a cobrar"} hint={`Máx. ${formatMoney(limit)}. Pedir no es cobrar: figura pendiente hasta que se pague.`}>
            <AmountField key={amountKey} valueCents={cents} onChange={(c) => { setCents(c); setPct(null); }} />
          </Field>
        </div>
      )}
      {mode === "later" && <p className="text-sm text-muted">Compartí el presupuesto sin pedir plata ahora. El cobro lo podés pedir cuando quieras desde acá.</p>}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void confirm()}>{mode === "later" ? "Compartir sin cobrar" : mode === "online" ? `Pedir ${formatMoney(cents)}` : `Anotar ${formatMoney(cents)}`}</Button>
        <Button variant="ghost" onClick={onClose}>Ahora no</Button>
      </div>
    </Card>
  );
}
