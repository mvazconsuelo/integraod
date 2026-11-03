import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Summary } from "@/types";

interface Step { title: string; text: string; done: boolean; to: string; action: string; locked?: string }

export function onboardingSteps(s: Summary): Step[] {
  const o = s.onboarding;
  return [
    { title: "Poné el nombre y el logo de tu negocio", text: "Así salen en los presupuestos que le mandás a tus contactos.", done: o.clinic_configured, to: "/configuracion", action: "Completar mis datos" },
    { title: "Armá tu primer presupuesto", text: "Elegí los servicios del listado y el total se calcula solo.", done: o.budgets > 0, to: "/presupuestos/nuevo", action: "Crear presupuesto" },
    { title: "Pedí el anticipo o el cobro total", text: "Se genera un link para que tu contacto pague con Mercado Pago, o cargás el pago en efectivo.", done: o.collections > 0, to: "/presupuestos", action: "Ir a mis presupuestos", locked: o.budgets === 0 ? "Primero armá un presupuesto." : undefined },
  ];
}

/** Guía para quien entra por primera vez: qué hacer, en qué orden, con un botón por paso. */
export function GettingStarted({ s, welcome }: { s: Summary; welcome: boolean }) {
  const steps = onboardingSteps(s);
  const doneCount = steps.filter((x) => x.done).length;
  const next = steps.findIndex((x) => !x.done);

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <h2 className={cn("font-semibold tracking-tight", welcome ? "text-2xl" : "text-lg")}>{welcome ? "¡Te damos la bienvenida! Empecemos." : "Primeros pasos"}</h2>
        <p className="text-sm text-muted mt-1">{welcome ? "Para empezar a cobrar ordenado, seguí estos tres pasos. Te lleva unos minutos." : `Llevás ${doneCount} de ${steps.length}.`}</p>
      </div>
      <ol className="space-y-3">
        {steps.map((st, i) => (
          <li key={st.title} className={cn("flex items-start gap-4 rounded-xl border p-4", i === next ? "border-primary/40 bg-soft/50" : "bg-white", st.done && "opacity-70")}>
            <span className={cn("grid place-items-center h-8 w-8 shrink-0 rounded-full text-sm font-semibold", st.done ? "bg-primary text-white" : "border-2 border-primary/30 text-primary")}>
              {st.done ? <Check size={16} strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{st.title}</p>
              <p className="text-sm text-muted mt-0.5">{st.text}</p>
              {!st.done && (
                <div className="mt-3">
                  {st.locked
                    ? <p className="text-xs text-muted">{st.locked}</p>
                    : <Button asChild size="sm" variant={i === next ? "primary" : "secondary"}><Link to={st.to}>{st.action}</Link></Button>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
