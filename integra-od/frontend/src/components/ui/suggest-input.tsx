import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Floating } from "./floating";

interface Props { value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string; ariaLabel?: string; id?: string; className?: string }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Campo de texto libre con sugerencias propias (en lugar de las del navegador). Se puede escribir algo nuevo o elegir una. */
export function SuggestInput({ value, onChange, suggestions, placeholder, ariaLabel, id, className }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const q = norm(value.trim());
  const shown = suggestions.filter((s) => s !== value && (!q || norm(s).includes(q)));

  useEffect(() => {
    if (!open) return;
    // Esc cierra solo las sugerencias, no el formulario que las contiene.
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Input
        id={id} aria-label={ariaLabel} autoComplete="off" value={value} placeholder={placeholder} className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      />
      {open && shown.length > 0 && (
        // preventDefault en mousedown mantiene el foco en el campo mientras se elige
        <Floating anchor={root} maxHeight={192} className="p-1" onMouseDown={(e) => e.preventDefault()}>
        <ul role="listbox">
          {shown.map((s) => (
            <li key={s} role="option" aria-selected={false}>
              <button type="button" onClick={() => { onChange(s); setOpen(false); }} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-soft cursor-pointer">{s}</button>
            </li>
          ))}
        </ul>
        </Floating>
      )}
    </div>
  );
}
