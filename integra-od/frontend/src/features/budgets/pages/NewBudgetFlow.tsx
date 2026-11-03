import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowScreen, ActionBar } from "@/components/layout/FlowScreen";
import { BackLink } from "@/components/shared/BackLink";
import { Stepper } from "@/components/shared/Stepper";
import type { PickerHandle } from "@/components/shared/PatientPicker";
import { useSettings } from "@/app/providers";
import { formatMoney } from "@/lib/currency";
import { addDays, today } from "@/lib/formatters";
import type { BudgetDetail } from "@/types";
import { ClientField, ConceptsFields, OptionalFields } from "../components/BudgetFields";
import { CollectStep, type CollectHandle } from "../components/CollectStep";
import { readDraft, useBudgetForm, writeDraft } from "../hooks/useBudgetForm";
import type { BudgetForm } from "../schemas/budget.schema";
import { createBudget } from "../services/budgets.service";

const STEPS = ["Cliente", "Conceptos", "Cómo cobrar", "Listo"];
// Lo que se le pide a la persona en cada paso (el título grande de la pantalla).
const TITLES = ["¿Para quién es?", "¿Qué vas a presupuestar?", "¿Cómo querés cobrar?", "Listo"];

/**
 * Presupuesto nuevo, paso a paso: 1) cliente, 2) conceptos, 3) cómo cobrar, 4) listo y compartir.
 * El presupuesto se guarda al pasar del 2 al 3 (para poder pedir o registrar un pago sobre él); hasta ahí lo escrito
 * se conserva si se sale y se vuelve.
 */
export function NewBudgetFlow() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { settings } = useSettings();
  const draft = useRef(readDraft()).current;
  const initial: BudgetForm = draft?.values ?? {
    patient_ref: params.get("cliente") ?? "", patient_id: "", issued_on: today(), valid_until: addDays(today(), settings?.default_validity_days ?? 30), notes: settings?.terms ?? "",
    items: [{ description: "", quantity: 1, unit_price_cents: 0, discount_pct: 0 }],
  };
  const h = useBudgetForm(initial, Boolean(draft?.open?.notes));
  const [step, setStep] = useState(1);
  const [budget, setBudget] = useState<BudgetDetail | null>(null);
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const collect = useRef<CollectHandle | null>(null);
  const picker = useRef<PickerHandle>(null);
  // Si algo no deja avanzar, se lleva la vista al primer aviso para que se vea qué falta.
  const showProblem = () => setTimeout(() => document.querySelector("[role=alert]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);

  useEffect(() => {
    if (draft || !settings) return;
    h.setValue("notes", settings.terms);
    h.setValue("valid_until", addDays(today(), settings.default_validity_days));
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  // Borrador de los pasos 1 y 2.
  useEffect(() => { if (!budget) writeDraft({ values: h.values, open: h.open }); }, [JSON.stringify(h.values), h.open, budget]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); document.querySelector("[data-flow-region]")?.scrollTo?.(0, 0); }, [step]);

  const next = async () => {
    setError("");
    if (step === 1) {
      // Un cliente nuevo a medio cargar se guarda al continuar: no hace falta tocar otro botón.
      if (picker.current?.hasDraft() && !(await picker.current.save())) return showProblem();
      if (await h.form.trigger(["patient_id", "patient_ref"])) setStep(2); else showProblem();
      return;
    }
    if (step === 2) {
      const ok = await h.form.trigger(["items", "valid_until"]);
      if (!ok) return showProblem();
      if (h.sum <= 0) { setError("Ingresá el importe: el total no puede ser cero."); return showProblem(); }
      setBusy(true);
      try {
        const saved = await createBudget(h.form.getValues());
        writeDraft(null);
        setBudget(saved);
        setStep(3);
      } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar el presupuesto."); }
      finally { setBusy(false); }
      return;
    }
    if (step === 3) {
      const result = await collect.current?.submit();
      if (result) { setOutcome(result); setStep(4); }
    }
  };

  const bar = step < 4 && (
    <ActionBar error={error}>
      {step === 1 ? <Link to="/presupuestos" className="text-sm font-medium text-secondary hover:underline">Cancelar</Link>
        : step === 2 ? <div><p className="text-xs text-muted">Total</p><p className="text-xl font-semibold tabular">{formatMoney(h.sum)}</p></div>
        : budget ? <Link to={`/presupuestos/${budget.id}/editar`} className="text-sm font-medium text-secondary hover:underline">Editar presupuesto</Link>
        : <span />}
      <div className="flex items-center gap-3">
        {step === 2 && <Button variant="ghost" className="h-11" onClick={() => setStep(1)}>Atrás</Button>}
        <Button className="h-11 px-7 text-base" disabled={busy} onClick={() => void next()}>Continuar</Button>
      </div>
    </ActionBar>
  );

  return (
    <FlowScreen top={<><div className="hidden desk:block"><BackLink to="/presupuestos">presupuestos</BackLink></div><Stepper step={step} labels={STEPS} title={TITLES[step - 1]} eyebrow="Nuevo presupuesto" /></>} bar={bar}>
      {step === 1 && <ClientField h={h} pickerRef={picker} autoFocus={!params.get("cliente")} />}
      {step === 2 && <div className="space-y-3"><ConceptsFields h={h} /><OptionalFields h={h} /></div>}
      {step === 3 && budget && settings && <CollectStep budget={budget} settings={settings} handleRef={collect} onBusy={setBusy} />}
      {step === 4 && budget && (
        <div className="space-y-4 rounded-3xl bg-success/10 p-5 text-center sm:p-8">
          <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success text-white"><CircleCheck size={30} /></span>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Presupuesto listo</h2>
            <p className="mt-1 text-muted">{budget.patient_ref} · {formatMoney(budget.total_cents)}</p>
          </div>
          <p className="text-[15px]">{outcome}</p>
          <div className="space-y-2 pt-1">
            <Button className="h-12 w-full text-base" onClick={() => navigate(`/presupuestos/${budget.id}?compartir=1`, { replace: true })}>Compartir</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(`/presupuestos/${budget.id}`, { replace: true })}>Ver el presupuesto</Button>
          </div>
        </div>
      )}
    </FlowScreen>
  );
}
