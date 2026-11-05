import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Landmark, Link2, type LucideIcon } from "lucide-react";
import { AmountField } from "@/components/shared/AmountField";
import { Field } from "@/components/shared/Field";
import { PercentQuick } from "@/components/shared/PercentQuick";
import { Segmented } from "@/components/ui/segmented";
import { formatMoney } from "@/lib/currency";
import { percentOfCents } from "@/lib/percent";
import { cn } from "@/lib/utils";
import { createRequest } from "@/features/payments/services/payments.service";
import { setCollectMethod, setPaymentMode } from "../services/budgets.service";
import type { BudgetDetail, Settings } from "@/types";

type Mode = "link" | "ask" | "later"; // link: Mercado Pago · ask: cobro pendiente sin link (transferencia o efectivo) · later: sin pedir nada
type Scope = "part" | "all";
type Way = "mercadopago" | "transfer" | "cash";
const KEY = "integraod.collect";
const read = (): { mode?: Mode; pct?: number; method?: "cash" | "transfer"; way?: Way } => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const save = (patch: object) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* sin storage */ } };

/** Lo que se hizo en este paso: el paso 4 lo cuenta tal cual. */
export interface Outcome { kind: "later" | "link" | "ask" | "paid"; cents: number; method?: "cash" | "transfer" }
export interface CollectHandle { submit: () => Promise<Outcome | null>; busy: boolean; error: string }

interface Props { budget: BudgetDetail; settings: Settings; handleRef: React.MutableRefObject<CollectHandle | null>; onBusy: (b: boolean) => void; /** Avisa si ya se puede continuar (medio elegido y, si corresponde, anticipo o total con su importe). */ onReady: (ready: boolean) => void }

/**
 * Paso 3: cómo te van a pagar. Con Mercado Pago se pide el link (todavía no es dinero); con transferencia o efectivo solo se elige el medio:
 * el pago se registra cuando llegue, desde el presupuesto. El servidor decide si es anticipo, parcial o final.
 * `submit` devuelve la frase del resultado, o null si algo falló (el error se muestra acá).
 */
export function CollectStep({ budget: b, settings, handleRef, onBusy, onReady }: Props) {
  const onlineReady = settings.mp_connected || settings.mp_mock;
  const prefs = read();
  const [way, setWay] = useState<Way | null>(null); // no viene ninguno elegido: lo decide quien cobra
  // ¿Anticipo o total? Con Mercado Pago y con transferencia hay que elegir (no viene ninguno marcado); en efectivo no hay: se cobra en mano.
  const [scope, setScope] = useState<Scope | null>(null);
  const mode: Mode = way === "mercadopago" ? "link" : way === "transfer" ? "ask" : "later";
  const [pct, setPct] = useState<number | null>(prefs.pct ?? 30);
  const [cents, setCents] = useState(() => Math.min(percentOfCents(b.total_cents, prefs.pct ?? 30), b.requestable_cents));
  const [amountKey, setAmountKey] = useState(0);
  const [error, setError] = useState("");

  const limitFor = (m: Mode) => (m === "link" ? b.requestable_cents : b.balance_cents);
  const setAmount = (c: number, p: number | null) => { setCents(c); setPct(p); setAmountKey((k) => k + 1); };
  const chooseScope = (v: Scope) => { setScope(v); setError(""); if (v === "all") setAmount(limitFor(mode), null); else setAmount(Math.min(percentOfCents(b.total_cents, pct ?? 30), limitFor(mode)), pct ?? 30); };
  const chooseWay = (w: Way) => {
    setWay(w); setError("");
    const m: Mode = w === "mercadopago" ? "link" : "ask";
    if (w === "cash") return setScope(null);
    if (scope === "all") setAmount(limitFor(m), null); else if (scope === "part") setAmount(Math.min(percentOfCents(b.total_cents, pct ?? 30), limitFor(m)), pct ?? 30);
  };
  const pick = (v: number) => setAmount(Math.min(percentOfCents(b.total_cents, v), b.requestable_cents), v);

  const ready = way === "cash" || (way !== null && scope !== null && cents > 0);
  useEffect(() => { onReady(ready); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const hint = way === null ? "Elegí cómo te van a pagar." : !ready ? (scope === null ? "Elegí si es anticipo o total." : "Ingresá el importe del anticipo.") : "";

  handleRef.current = {
    busy: false, error,
    submit: async () => {
      setError("");
      if (!way) { setError("Elegí cómo te van a pagar."); return null; }
      const chosen = () => setCollectMethod(b.id, way).catch(() => undefined); // el medio elegido queda en el presupuesto
      if (mode === "later") { await chosen(); save({ mode, way }); return { kind: "later", cents: 0 }; }
      if (!scope) { setError("Elegí si es anticipo o total."); return null; }
      if (cents <= 0) { setError("Ingresá el importe del anticipo."); return null; }
      if (cents > b.requestable_cents && mode === "link") { setError(`Lo máximo que podés cobrar ahora es ${formatMoney(b.requestable_cents)}.`); return null; }
      if (cents > b.balance_cents) { setError(`Al presupuesto le faltan ${formatMoney(b.balance_cents)}.`); return null; }
      // Lo que se eligió acá es cómo se acordó cobrar: todo junto, o un anticipo y después el saldo. Informativo.
      const agreed = () => setPaymentMode(b.id, cents >= b.balance_cents ? "total" : "advance").catch(() => undefined);
      onBusy(true);
      try {
        if (mode === "link") {
          await createRequest({ method: "online", patient_ref: b.patient_ref, amount_cents: cents, budget_id: b.id, conditions: "", due_date: null });
          await agreed(); await chosen();
          save({ mode, way, ...(pct ? { pct } : {}) });
          return { kind: "link", cents };
        }
        // Transferencia o efectivo: queda un pedido sin link. Todavía no es dinero: se registra cuando llegue.
        await createRequest({ method: "cash", patient_ref: b.patient_ref, amount_cents: cents, budget_id: b.id, conditions: "", due_date: null });
        await agreed(); await chosen();
        save({ mode, way, ...(pct ? { pct } : {}) });
        return { kind: "ask", cents, method: way === "transfer" ? "transfer" : "cash" };
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos completar el cobro.");
        return null;
      } finally { onBusy(false); }
    },
  };

  return (
    <div className="space-y-4 pt-4 sm:pt-2">
      <div role="radiogroup" aria-label="Cómo te van a pagar" className="grid grid-cols-3 gap-2 sm:gap-3">
        <Option icon={Link2} short="Mercado Pago" title="Mercado Pago" text={onlineReady ? "Le mandás un link y paga desde su celular." : "Primero conectá Mercado Pago en Configuración."} selected={way === "mercadopago"} disabled={!onlineReady} onSelect={() => chooseWay("mercadopago")} />
        <Option icon={Landmark} short="Transferencia" title="Transferencia" text="Le mandás tus datos bancarios. Registrás el pago cuando llega." selected={way === "transfer"} onSelect={() => chooseWay("transfer")} />
        <Option icon={Banknote} short="Efectivo" title="Efectivo" text="Cobrás en mano y registrás el pago cuando lo recibís." selected={way === "cash"} onSelect={() => chooseWay("cash")} />
      </div>
      <p className="px-1 text-sm leading-snug text-muted sm:hidden">{way === "mercadopago" ? "Le mandás un link y paga desde su celular." : way === "transfer" ? "Le mandás tus datos bancarios y registrás el pago cuando llega." : way === "cash" ? "Cobrás en mano y registrás el pago." : "Elegí cómo te van a pagar."}</p>
      {!onlineReady && <p className="text-xs text-muted">Para cobrar con Mercado Pago, conectalo en <Link to="/configuracion?seccion=mercadopago" className="font-medium text-secondary underline">Configuración</Link>.</p>}
      {way === "transfer" && !settings.bank_cbu && !settings.bank_alias && <p className="text-xs text-muted">Sin tus datos bancarios, el mensaje no los lleva. Cargalos en Configuración, desde la computadora.</p>}

      {mode !== "later" && (
        <div className="space-y-3 sm:space-y-4 sm:rounded-3xl sm:border sm:bg-white sm:p-6">
          <p className="text-[13px] font-semibold">¿Anticipo o total?</p>
          <Segmented label="Anticipo o total" value={(scope ?? "") as Scope} onChange={chooseScope}
            options={[{ value: "part", label: "Anticipo" }, { value: "all", label: "Total" }]} />

          {scope === "part" && (
            <>
              <PercentQuick selected={pct} onPick={pick} />
              <AmountField key={amountKey} valueCents={cents} onChange={(c) => { setCents(c); setPct(null); }} />
            </>
          )}
          {scope === "all" && <p className="text-[15px]">Total a cobrar: <strong className="tabular">{formatMoney(limitFor(mode))}</strong></p>}

          {scope && (
            <p className="text-sm text-muted">
              {cents > 0 && cents < b.balance_cents
                ? <>Anticipo de <strong className="tabular text-foreground">{formatMoney(cents)}</strong> · quedan <strong className="tabular text-foreground">{formatMoney(b.balance_cents - cents)}</strong></>
                : cents >= b.balance_cents && cents > 0 ? <>Queda <strong className="text-foreground">todo</strong> pendiente de pago</> : "Ingresá un importe."}
              <span className="hidden sm:inline"> · Figura pendiente hasta que se pague.</span>
            </p>
          )}
        </div>
      )}
      {hint && !error && <p className="px-1 text-sm text-muted">{hint}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Option({ icon: Icon, title, short, text, selected, disabled, onSelect }: { icon: LucideIcon; title: string; short: string; text: string; selected: boolean; disabled?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-disabled={disabled} disabled={disabled} onClick={onSelect}
      className={cn("flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl border bg-white px-2 py-3.5 text-center sm:gap-2 sm:p-4 transition disabled:cursor-not-allowed disabled:opacity-55", selected ? "border-primary ring-2 ring-primary/25" : "hover:bg-soft/60")}>
      <span aria-hidden className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", selected ? "bg-primary text-white" : "bg-primary/10 text-primary")}><Icon size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-tight sm:text-base">{short}</span><span className="mt-1 hidden text-sm leading-snug text-muted sm:block">{text}</span></span>
          </button>
  );
}
