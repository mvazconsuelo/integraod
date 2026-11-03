import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = ["#173B36", "#437F7F", "#52796F", "#39765C", "#2F5D8A", "#5B4B8A", "#B65E58", "#D6A66A", "#E4AC3C", "#26332F"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Elegir un color: paleta de la app y, si hace falta, el código exacto. Reemplaza el selector de color del sistema. */
export function ColorField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = HEX.test(text);

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {PRESETS.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={c} type="button" role="radio" aria-checked={selected} aria-label={c} onClick={() => onChange(c)} style={{ background: c }}
              className={cn("h-8 w-8 rounded-full grid place-items-center ring-1 ring-border cursor-pointer", selected && "ring-2 ring-offset-2 ring-primary")}
            >
              {selected && <Check size={14} strokeWidth={3} className="text-white" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-10 w-10 rounded-lg border shrink-0" style={{ background: valid ? text : value }} aria-hidden />
        <Input
          aria-label={`${label}: código del color`} value={text} maxLength={7} autoComplete="off" className="w-32 tabular uppercase"
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith("#")) v = `#${v}`;
            setText(v);
            if (HEX.test(v)) onChange(v.toUpperCase());
          }}
        />
        {!valid && <span className="text-xs text-danger">Usá 6 letras o números, por ejemplo #437F7F.</span>}
      </div>
    </div>
  );
}
