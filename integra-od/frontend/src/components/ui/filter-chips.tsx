import { cn } from "@/lib/utils";

interface Option<T extends string> { value: T; label: string; count?: number }

/** Filtros por estado, como botones con la cantidad de cada uno. */
export function FilterChips<T extends string>({ options, value, onChange, label }: { options: Option<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={selected} onClick={() => onChange(o.value)}
            className={cn("h-9 rounded-full border px-4 text-sm font-medium cursor-pointer inline-flex items-center gap-2", selected ? "bg-primary text-white border-primary" : "bg-white hover:bg-soft")}
          >
            {o.label}
            {o.count !== undefined && <span className={cn("text-xs tabular rounded-full px-1.5 py-0.5", selected ? "bg-white/20" : "bg-soft text-muted")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
