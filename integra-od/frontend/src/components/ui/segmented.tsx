import { cn } from "@/lib/utils";

interface Option<T extends string> { value: T; label: string; disabled?: boolean }

/** Elección entre pocas opciones con botones grandes (mejor que un desplegable cuando son 2 o 3). */
export function Segmented<T extends string>({ value, onChange, options, label, wrap }: { value: T; onChange: (v: T) => void; options: Option<T>[]; label: string; /** Dos columnas en pantallas chicas: para etiquetas largas. */ wrap?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", wrap && "max-sm:!grid-cols-2")} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={selected} aria-disabled={o.disabled} disabled={o.disabled} onClick={() => onChange(o.value)}
            className={cn("min-h-10 rounded-lg border px-3 py-2 text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50", selected ? "bg-primary text-white border-primary" : "bg-white hover:bg-soft")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
