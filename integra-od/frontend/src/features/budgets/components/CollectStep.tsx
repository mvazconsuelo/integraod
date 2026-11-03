import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, Clock, Link2, Wallet, type LucideIcon } from "lucide-react";
import { AmountField } from "@/components/shared/AmountField";
import { Field } from "@/components/shared/Field";
import { PercentQuick } from "@/components/shared/PercentQuick";
import { Segmented } from "@/components/ui/segmented";
import { formatMoney } from "@/lib/currency";
import { today } from "@/lib/formatters";
import { percentOfCents } from "@/lib/percent";
import { cn } from "@/lib/utils";
import { createRequest, registerManual } from "@/features/payments/services/payments.service";
import type { BudgetDetail, Settings } from "@/types";

type Mode = "link" | "paid" | "later";
const KEY = "integraod.collect";
const read = (): { mode?: Mode; pct?: number; method?: "cash" | "transfer" } => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const save = (patch: object) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* sin storage */ } };

export interface CollectHandle { submit: () => Promise<string | null>; busy: boolean; error: string }

interface Props { budget: BudgetDetail; settings: Settings; handleRef: React.MutableRefObject<CollectHandle | null>; onBusy: (b: boolean) => void }

/**
 * Paso 3: cómo se cobra. Con link de Mercado Pago (se pide, todavía no es dinero), "ya me pagaron" (efectivo o transferencia,
 * se registra ahora) o todavía no. Las mismas reglas de siempre: el servidor decide si es anticipo, parcial o final.
 * `submit` devuelve la frase del resultado, o null si algo falló (el error se muestra acá).
 */
export function CollectStep({ budget: b, settings, handleRef, onBusy }: Props) {
  const onlineReady = settings.mp_connected || settings.mp_mock;
  const prefs = read();
  const [mode, setMode] = useState<Mode>(prefs.mode === "link" && !onlineReady ? "later" : prefs.mode ?? "later");
  // ¿Una parte (anticipo) o todo? Es lo primero que se decide, para que el importe no quede sin explicar.
  const [scope, setScope] = useState<"part" | "all">("part");
  const [pct, setPct] = useState<number | null>(prefs.pct ?? 30);
  const [cents, setCents] = useState(() => Math.min(percentOfCents(b.total_cents, prefs.pct ?? 30), b.requestable_cents));
  const [amountKey, setAmountKey] = useState(0);
  const [method, setMethod] = useState<"cash" | "transfer">(prefs.method ?? "cash");
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID()); // un doble toque no registra dos veces

  const limitFor = (m: Mode) => (m === "link" ? b.requestable_cents : b.balance_cents);
  const setAmount = (c: number, p: number | null) => { setCents(c); setPct(p); setAmountKey((k) => k + 1); };
  const chooseScope = (v: "part" | "all") => { setScope(v); if (v === "all") setAmount(limitFor(mode), null); else setAmount(Math.min(percentOfCents(b.total_cents, pct ?? 30), limitFor(mode)), pct ?? 30); };
  const chooseMode = (m: Mode) => { setMode(m); if (scope === "all") setAmount(limitFor(m), null); };
  const pick = (v: number) => setAmount(Math.min(percentOfCents(b.total_cents, v), b.requestable_cents), v);

  handleRef.current = {
    busy: false, error,
    submit: async () => {
      setError("");
      if (mode === "later") { save({ mode }); return "Sin cobro por ahora. Cuando te paguen, usás Registrar pago."; }
      if (cents <= 0) { setError(mode === "link" ? "Ingresá cuánto vas a pedir." : "Ingresá cuánto te pagaron."); return null; }
      if (cents > b.requestable_cents && mode === "link") { setError(`Lo máximo que podés pedir es ${formatMoney(b.requestable_cents)}.`); return null; }
      if (cents > b.balance_cents) { setError(`Al presupuesto le faltan ${formatMoney(b.balance_cents)}.`); return null; }
      onBusy(true);
      try {
        if (mode === "link") {
          await createRequest({ method: "online", patient_ref: b.patient_ref, amount_cents: cents, budget_id: b.id, conditions: "", due_date: null });
          save({ mode, ...(pct ? { pct } : {}) });
          return `Pediste ${formatMoney(cents)} con link de Mercado Pago. Todavía no es dinero recibido: queda esperando hasta que se pague.`;
        }
        await registerManual({ patient_ref: b.patient_ref, amount_cents: cents, method, paid_on: today(), budget_id: b.id, request_id: null, notes: "", idempotency_key: key.current });
        save({ mode, method, ...(pct ? { pct } : {}) });
        return `Registraste ${formatMoney(cents)} recibidos ${method === "cash" ? "en efectivo" : "por transferencia"}.`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos completar el cobro.");
        return null;
      } finally { onBusy(false); }
    },
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <p className="flex items-center gap-2 text-sm font-medium text-success"><CircleCheck size={18} />Presupuesto guardado · {formatMoney(b.total_cents)}</p>

      <div role="radiogroup" aria-label="Cómo vas a cobrar" className="space-y-2 sm:space-y-3">
        <Option icon={Link2} title="Con link de Mercado Pago" text={onlineReady ? "Se lo mandás y paga desde el celular." : "Primero conectá Mercado Pago en Configuración."} selected={mode === "link"} disabled={!onlineReady} onSelect={() => chooseMode("link")} />
        <Option icon={Wallet} title="Ya me pagaron" text="Efectivo o transferencia: lo registrás ahora." selected={mode === "paid"} onSelect={() => chooseMode("paid")} />
        <Option icon={Clock} title="Todavía no cobro" text="Lo compartís y cobrás después." selected={mode === "later"} onSelect={() => chooseMode("later")} />
      </div>
      {!onlineReady && <p className="text-xs text-muted">Para cobrar con link, conectá Mercado Pago en <Link to="/configuracion?seccion=mercadopago" className="font-medium text-secondary underline">Configuración</Link>.</p>}

      {mode !== "later" && (
        <div className="space-y-4 rounded-3xl border bg-white p-4 sm:space-y-5 sm:p-6">
          <Field plain label={mode === "link" ? "¿Qué le pedís?" : "¿Qué te pagaron?"}>
            <Segmented label="Una parte o todo" value={scope} onChange={chooseScope}
              options={[{ value: "part", label: mode === "link" ? "Un anticipo" : "Una parte" }, { value: "all", label: mode === "link" ? "El total" : "Todo" }]} />
          </Field>

          {scope === "part" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted">{mode === "link" ? "Un anticipo es una parte del total, para reservar. El resto lo cobrás después." : "Una parte del total. El resto lo cobrás después."}</p>
              <PercentQuick selected={pct} onPick={pick} />
              <Field label={mode === "link" ? "Importe del anticipo" : "Importe que te pagaron"} hint={`Hasta ${formatMoney(limitFor(mode))}.`}>
                <AmountField key={amountKey} valueCents={cents} onChange={(c) => { setCents(c); setPct(null); }} />
              </Field>
            </div>
          ) : (
            <p className="rounded-2xl bg-soft px-4 py-3 text-[15px]">{mode === "link" ? "Le pedís todo el presupuesto: " : "Te pagaron todo el presupuesto: "}<strong className="tabular">{formatMoney(limitFor(mode))}</strong>.</p>
          )}

          {mode === "paid" && (
            <Field plain label="¿Cómo te pagó?"><Segmented label="Cómo te pagó" value={method} onChange={setMethod} options={[{ value: "cash", label: "Efectivo" }, { value: "transfer", label: "Transferencia" }]} /></Field>
          )}

          {/* Qué queda después: lo que se pide o se cobra no es lo mismo que lo que falta */}
          <p className="border-t pt-4 text-sm text-muted">
            {cents > 0 && cents < b.balance_cents
              ? <>{mode === "link" ? "Pedís" : "Registrás"} <strong className="tabular text-foreground">{formatMoney(cents)}</strong> de {formatMoney(b.total_cents)}. Después te quedan <strong className="tabular text-foreground">{formatMoney(b.balance_cents - cents)}</strong> por cobrar.</>
              : cents >= b.balance_cents && cents > 0 ? <>Con esto el presupuesto queda <strong className="text-foreground">{mode === "link" ? "pedido completo" : "cobrado completo"}</strong>.</> : "Ingresá un importe."}
            {mode === "link" && " Pedir no es cobrar: figura pendiente hasta que se pague."}
          </p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Option({ icon: Icon, title, text, selected, disabled, onSelect }: { icon: LucideIcon; title: string; text: string; selected: boolean; disabled?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-disabled={disabled} disabled={disabled} onClick={onSelect}
      className={cn("flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-white p-3 text-left sm:gap-4 sm:p-4 transition disabled:cursor-not-allowed disabled:opacity-55", selected ? "border-primary ring-2 ring-primary/25" : "hover:bg-soft/60")}>
      <span aria-hidden className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", selected ? "bg-primary text-white" : "bg-primary/10 text-primary")}><Icon size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block font-semibold leading-tight">{title}</span><span className="mt-0.5 block text-[13px] leading-snug text-muted sm:text-sm">{text}</span></span>
      <span aria-hidden className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", selected ? "border-primary bg-primary text-white" : "border-foreground/25")}>{selected && <CircleCheck size={14} />}</span>
    </button>
  );
}
