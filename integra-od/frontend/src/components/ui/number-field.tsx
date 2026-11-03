import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { value: number; onChange: (n: number) => void; min?: number; max?: number; id?: string; ariaLabel?: string; invalid?: boolean; className?: string }

/** Número con botones − y + propios (sin las flechitas del navegador ni cambios accidentales con la rueda del mouse). */
export function NumberField({ value, onChange, min = 0, max = 9999, id, ariaLabel, invalid, className }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const set = (n: number) => { const c = clamp(n); setText(String(c)); onChange(c); };

  const btn = "w-10 shrink-0 grid place-items-center text-muted hover:bg-soft disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer";
  return (
    <div className={cn("flex h-10 items-stretch overflow-hidden rounded-lg border bg-white", invalid && "border-danger", className)}>
      <button type="button" aria-label="Restar uno" className={btn} disabled={value <= min} onClick={() => set(value - 1)}><Minus size={14} /></button>
      <input
        id={id} aria-label={ariaLabel} inputMode="numeric" enterKeyHint="done" autoComplete="off" value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          if (digits === "") return setText("");
          set(Number(digits));
        }}
        onBlur={() => text === "" && setText(String(value))}
        className="min-w-0 w-full border-x text-center text-sm tabular outline-none"
      />
      <button type="button" aria-label="Sumar uno" className={btn} disabled={value >= max} onClick={() => set(value + 1)}><Plus size={14} /></button>
    </div>
  );
}
