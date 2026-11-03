import { useMemo, useRef, useState } from "react";
import { Floating } from "@/components/ui/floating";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/currency";
import type { Treatment } from "@/types";

interface Props {
  /** Id del campo al que pasa el Enter del teclado. */
  nextId?: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (t: Treatment) => void;
  catalog: Treatment[];
  id: string;
  invalid?: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Campo de concepto con el listado de tratamientos adentro: una sola lista con scroll, dividida por categoría.
 * Se puede elegir scrolleando o escribir para filtrar; también vale escribir un concepto propio.
 */
export function TreatmentCombobox({ value, onChange, onPick, catalog, id, invalid, nextId }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const search = norm(value.trim());
    const exact = catalog.some((t) => norm(t.name) === search);
    // Si el texto ya es un tratamiento completo, se muestra todo el listado para poder cambiarlo.
    const items = search && !exact ? catalog.filter((t) => norm(t.name).includes(search)) : catalog;
    const order = [...new Set(catalog.map((t) => t.category))];
    return order.map((category) => ({ category, items: items.filter((t) => t.category === category) })).filter((g) => g.items.length > 0);
  }, [catalog, value]);

  // Las sugerencias aparecen al buscar (al escribir), no como una lista abierta.
  const showPanel = open && value.trim() !== "" && groups.length > 0;

  const pick = (t: Treatment) => {
    onPick(t);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <Input
        id={id} className="h-12 [@media(max-height:620px)]:h-11 text-base" value={value} autoComplete="off" placeholder="Ej.: instalación de cocina" aria-invalid={invalid} role="combobox" aria-expanded={showPanel} aria-controls={`${id}-panel`}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => setOpen(false)}
        enterKeyHint="next"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") { e.preventDefault(); setOpen(false); if (nextId) document.getElementById(nextId)?.focus(); } // sigue al importe, sin enviar nada
        }}
      />
      {showPanel && (
        // preventDefault en mousedown mantiene el foco en el campo mientras se elige o se hace scroll
        <Floating anchor={root} maxHeight={288} id={`${id}-panel`} onMouseDown={(e) => e.preventDefault()}>
          <ul role="listbox">
            {groups.map((g) => (
              <li key={g.category} role="presentation">
                <p className="sticky top-0 z-10 bg-soft px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-secondary">{g.category}</p>
                <ul>
                  {g.items.map((t) => (
                    <li key={t.id} role="option" aria-selected={t.name === value}>
                      <button type="button" onClick={() => pick(t)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-soft/60 cursor-pointer">
                        <span>{t.name}</span>
                        <span className="text-xs tabular whitespace-nowrap text-muted">{t.price_cents > 0 ? formatMoney(t.price_cents) : "Sin precio"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Floating>
      )}
    </div>
  );
}
