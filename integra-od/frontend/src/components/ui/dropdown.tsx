import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Floating } from "./floating";

export interface DropdownOption {
  value: string;
  label: string;
  /** Segunda línea, más chica. */
  hint?: string;
  /** Dato a la derecha (por ejemplo un saldo). */
  trailing?: string;
  /** Ícono a la derecha, para acciones como "Crear nuevo". */
  icon?: ReactNode;
  /** Queda siempre visible al final, aunque se filtre escribiendo. */
  pinned?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder: string;
  id?: string;
  invalid?: boolean;
  emptyText?: string;
  /** Con false es un botón (para pocas opciones fijas); con true, un campo donde también se puede escribir para filtrar. */
  searchable?: boolean;
  ariaLabel?: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lista en un panel, igual que la de tratamientos: se elige tocando, o se escribe para filtrar más rápido.
 * Cada fila muestra título, detalle y un dato a la derecha.
 */
export function Dropdown({ value, onChange, options, placeholder, id, invalid, emptyText = "No hay opciones disponibles.", searchable = true, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return q ? options.filter((o) => o.pinned || norm(`${o.label} ${o.hint ?? ""}`).includes(q)) : options;
  }, [options, query]);
  const noMatches = query.trim() !== "" && visible.every((o) => o.pinned);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { const t = e.target as Node; if (!root.current?.contains(t) && !panel.current?.contains(t)) close(); };
    // Esc cierra solo la lista, no el formulario que la contiene (captura sobre window: se adelanta al cierre del formulario).
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKey, true); };
  }, [open]);

  const close = () => { setOpen(false); setQuery(""); };
  const choose = (v: string) => { onChange(v); close(); };
  const openPanel = () => { setActive(0); setOpen(true); };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (!open) { if (e.key === "ArrowDown") { e.preventDefault(); openPanel(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(visible.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter") { e.preventDefault(); if (visible[active]) choose(visible[active].value); }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      {searchable ? (
        <>
          <Input
            id={id} role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-invalid={invalid} autoComplete="off"
            value={open ? query : (selected?.label ?? "")} placeholder={open && selected ? selected.label : placeholder}
            onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
            onFocus={openPanel} onClick={() => !open && openPanel()}
            className={cn("pr-9 cursor-pointer", invalid && "border-danger")}
          />
          <ChevronDown size={16} className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none transition-transform", open && "rotate-180")} />
        </>
      ) : (
        <button
          type="button" id={id} role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-invalid={invalid}
          onClick={() => (open ? close() : openPanel())}
          className={cn("w-full h-10 rounded-lg border bg-white px-3 text-sm flex items-center justify-between gap-3 text-left cursor-pointer", invalid && "border-danger")}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </button>
      )}

      {open && (
        // preventDefault en click: este selector vive dentro de un <label> y no debe reabrirse solo.
        <Floating anchor={root} panelRef={panel} maxHeight={256} className="p-1">
        <ul role="listbox" onClick={(e) => e.preventDefault()}>
          {options.length === 0 && <li className="px-3 py-3 text-sm text-muted">{emptyText}</li>}
          {noMatches && <li className="px-3 py-3 text-sm text-muted">No encontramos coincidencias.</li>}
          {visible.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value} className={o.pinned && i > 0 ? "mt-1 pt-1 border-t" : undefined}>
              <button
                type="button" onClick={() => choose(o.value)} onMouseEnter={() => setActive(i)}
                className={cn("w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm cursor-pointer", i === active && "bg-soft", o.value === value && "font-medium")}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block text-xs text-muted font-normal truncate">{o.hint}</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {o.trailing && <span className="text-xs tabular text-secondary font-medium">{o.trailing}</span>}
                  {o.icon}
                  {o.value === value && <Check size={16} className="text-primary" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
        </Floating>
      )}
    </div>
  );
}
