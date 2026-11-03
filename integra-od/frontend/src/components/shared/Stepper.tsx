import { cn } from "@/lib/utils";

/** La barra de avance y el título del paso: lo que se le pide a la persona, grande; "Paso 2 de 4" en chico. */
export function Stepper({ step, labels, title, eyebrow }: { step: number; labels: string[]; title?: string; /** Encima del título, solo en pantallas grandes. */ eyebrow?: string }) {
  return (
    <div className="mb-3 shrink-0 md:mb-5" role="group" aria-label={`Paso ${step} de ${labels.length}: ${labels[step - 1]}`}>
      <div className="flex gap-1.5" aria-hidden>
        {labels.map((l, i) => <span key={l} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < step ? "bg-primary" : "bg-foreground/10")} />)}
      </div>
      {eyebrow && <p className="mt-4 hidden text-sm font-medium text-muted desk:block">{eyebrow}</p>}
      <div className="mt-3 [@media(max-height:620px)]:mt-1.5 flex items-baseline justify-between gap-3 desk:mt-1">
        <h2 className="text-xl [@media(max-height:620px)]:text-lg font-semibold leading-tight tracking-tight desk:text-3xl">{title ?? labels[step - 1]}</h2>
        <span className="shrink-0 text-sm text-muted">Paso {step} de {labels.length}</span>
      </div>
    </div>
  );
}
