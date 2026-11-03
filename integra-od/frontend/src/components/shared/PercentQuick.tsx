import { cn } from "@/lib/utils";

const PRESETS = [20, 30, 50];

/** Atajos para pedir un porcentaje del presupuesto: tres botones y un campo para otro valor. */
export function PercentQuick({ selected, onPick }: { selected: number | null; onPick: (pct: number) => void }) {
  const custom = selected !== null && !PRESETS.includes(selected);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Calcular como porcentaje del presupuesto">
      {PRESETS.map((p) => (
        <button
          key={p} type="button" aria-pressed={selected === p} onClick={() => onPick(p)}
          className={cn("h-8 rounded-lg border px-3 text-sm font-medium tabular cursor-pointer", selected === p ? "border-primary bg-primary text-white" : "bg-white hover:bg-soft")}
        >{p} %</button>
      ))}
      <div className="relative w-20">
        <input
          inputMode="numeric" aria-label="Otro porcentaje" placeholder="Otro" autoComplete="off"
          onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n >= 1 && n <= 100) onPick(n); }}
          className={cn("h-8 w-full rounded-lg border bg-white pl-3 pr-6 text-sm tabular placeholder:text-muted/70", custom && "border-primary ring-1 ring-primary")}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
      </div>
    </div>
  );
}
