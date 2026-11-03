import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CircleCheck, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/shared/BackLink";
import { PageHeader } from "@/components/shared/PageHeader";
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
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

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

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-0">
      {step < 3 && <BackLink to="/presupuestos">presupuestos</BackLink>}
      <PageHeader title="Nuevo presupuesto" icon={FilePlus2} />
      <Stepper step={step} labels={STEPS} />

      {step === 1 && <ClientField h={h} pickerRef={picker} autoFocus={!params.get("cliente")} />}
      {step === 2 && <div className="space-y-4"><ConceptsFields h={h} /><OptionalFields h={h} /></div>}
      {step === 3 && budget && settings && <CollectStep budget={budget} settings={settings} handleRef={collect} onBusy={setBusy} />}
      {step === 4 && budget && (
        <div className="space-y-5 rounded-3xl bg-success/10 p-6 text-center sm:p-8">
          <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-white"><CircleCheck size={34} /></span>
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


      {step < 4 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t bg-white/95 px-4 py-3 backdrop-blur md:static md:z-auto md:mt-5 md:rounded-2xl md:border md:bg-white md:p-4">
          {error && <p role="alert" className="mx-auto mb-2 max-w-2xl text-sm font-medium text-danger">{error}</p>}
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            {step === 2 ? <div><p className="text-xs text-muted">Total</p><p className="text-2xl font-semibold tabular">{formatMoney(h.sum)}</p></div>
              : step === 3 && budget ? <Link to={`/presupuestos/${budget.id}/editar`} className="text-sm font-medium text-secondary hover:underline">Editar presupuesto</Link>
              : <span />}
            <div className="flex items-center gap-3">
              {step === 2 && <Button variant="ghost" className="h-12" onClick={() => setStep(1)}>Atrás</Button>}
              <Button className="h-12 px-7 text-base" disabled={busy} onClick={() => void next()}>{step === 3 ? "Continuar" : "Continuar"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
