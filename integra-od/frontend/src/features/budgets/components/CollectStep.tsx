import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Link2, Wallet, type LucideIcon } from "lucide-react";
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
            <div role="radiogroup" aria-label="Cómo vas a cobrar" className="grid grid-cols-3 gap-2 sm:gap-3">
        <Option icon={Link2} short="Con link" title="Con link de Mercado Pago" text={onlineReady ? "Se lo mandás y paga desde el celular." : "Primero conectá Mercado Pago en Configuración."} selected={mode === "link"} disabled={!onlineReady} onSelect={() => chooseMode("link")} />
        <Option icon={Wallet} short="Ya me pagaron" title="Ya me pagaron" text="Efectivo o transferencia: lo registrás ahora." selected={mode === "paid"} onSelect={() => chooseMode("paid")} />
        <Option icon={Clock} short="Todavía no" title="Todavía no cobro" text="Lo compartís y cobrás después." selected={mode === "later"} onSelect={() => chooseMode("later")} />
      </div>
      {/* En el celular las tres opciones van en una fila: la explicación de la elegida va debajo */}
      {(mode === "later" || (mode === "link" && !onlineReady)) && <p className="text-[13px] text-muted sm:hidden">{mode === "link" ? "Primero conectá Mercado Pago." : "Lo compartís y cobrás después."}</p>}
      {!onlineReady && <p className="text-xs text-muted">Para cobrar con link, conectá Mercado Pago en <Link to="/configuracion?seccion=mercadopago" className="font-medium text-secondary underline">Configuración</Link>.</p>}

      {mode !== "later" && (
        <div className="space-y-3 sm:space-y-4 sm:rounded-3xl sm:border sm:bg-white sm:p-6">
          <Segmented label="Una parte o todo" value={scope} onChange={chooseScope}
            options={[{ value: "part", label: mode === "link" ? "Anticipo" : "Una parte" }, { value: "all", label: mode === "link" ? "Total" : "Todo" }]} />

          {scope === "part" ? (
            <>
              <PercentQuick selected={pct} onPick={pick} />
              <Field plain label={mode === "link" ? "Importe del anticipo" : "Importe cobrado"}>
                <AmountField key={amountKey} valueCents={cents} onChange={(c) => { setCents(c); setPct(null); }} />
              </Field>
            </>
          ) : (
            <p className="text-[15px]">{mode === "link" ? "Pedís" : "Cobraste"} el total: <strong className="tabular">{formatMoney(limitFor(mode))}</strong></p>
          )}

          {mode === "paid" && <Segmented label="Cómo te pagó" value={method} onChange={setMethod} options={[{ value: "cash", label: "Efectivo" }, { value: "transfer", label: "Transferencia" }]} />}

          {/* Una línea: qué se pide o se cobra y qué queda */}
          <p className="text-sm text-muted">
            {cents > 0 && cents < b.balance_cents
              ? <>{mode === "link" ? "Pedís" : "Registrás"} <strong className="tabular text-foreground">{formatMoney(cents)}</strong> · quedan <strong className="tabular text-foreground">{formatMoney(b.balance_cents - cents)}</strong></>
              : cents >= b.balance_cents && cents > 0 ? <>Queda {mode === "link" ? "pedido" : "cobrado"} <strong className="text-foreground">completo</strong></> : "Ingresá un importe."}
            {mode === "link" && <span className="hidden sm:inline"> · Pedir no es cobrar: figura pendiente hasta que se pague.</span>}
          </p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Option({ icon: Icon, title, short, text, selected, disabled, onSelect }: { icon: LucideIcon; title: string; short: string; text: string; selected: boolean; disabled?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-disabled={disabled} disabled={disabled} onClick={onSelect}
      className={cn("flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl border bg-white p-2.5 text-center sm:gap-2 sm:p-4 transition disabled:cursor-not-allowed disabled:opacity-55", selected ? "border-primary ring-2 ring-primary/25" : "hover:bg-soft/60")}>
      <span aria-hidden className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", selected ? "bg-primary text-white" : "bg-primary/10 text-primary")}><Icon size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-tight sm:text-base">{short}</span><span className="mt-1 hidden text-sm leading-snug text-muted sm:block">{text}</span></span>
          </button>
  );
}
