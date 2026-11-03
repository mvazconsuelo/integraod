import { cn } from "@/lib/utils";

/** "Paso 2 de 4 · Conceptos", con una barra de avance. */
export function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="mb-4 md:mb-6" role="group" aria-label={`Paso ${step} de ${labels.length}: ${labels[step - 1]}`}>
      <div className="flex gap-1.5" aria-hidden>
        {labels.map((l, i) => <span key={l} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < step ? "bg-primary" : "bg-foreground/10")} />)}
      </div>
      <p className="mt-2 text-sm text-muted">Paso {step} de {labels.length} · <strong className="font-semibold text-foreground">{labels[step - 1]}</strong></p>
    </div>
  );
}
