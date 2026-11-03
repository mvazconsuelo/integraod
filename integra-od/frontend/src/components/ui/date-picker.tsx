import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { today } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Floating } from "./floating";

interface Props {
  /** Fecha como YYYY-MM-DD, o "" si no hay. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** Permite borrar la fecha (para campos opcionales). */
  clearable?: boolean;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  ariaLabel?: string;
}

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => { const dt = new Date(Date.UTC(y, m, d)); return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`; };
const show = (v: string) => (v ? v.split("-").reverse().join("/") : "");
const monthTitle = (y: number, m: number) => {
  const t = new Date(Date.UTC(y, m, 15)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1); // "Noviembre de 2026"
};

/** Selector de fecha propio: el calendario del navegador cambia de un sistema a otro y no sigue el diseño de la app. */
export function DatePicker({ value, onChange, min, max, clearable, placeholder = "Elegí una fecha", id, invalid, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const start = value || today();
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { const t = e.target as Node; if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false); };
    // En captura y sobre window: se adelanta al cierre del formulario (Esc cierra solo el calendario).
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKey, true); };
  }, [open]);

  const toggle = () => {
    if (!open) { const s = value || today(); setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 }); }
    setOpen(!open);
  };
  const shift = (delta: number) => { const d = new Date(Date.UTC(view.y, view.m + delta, 1)); setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); };

  // 6 semanas completas, empezando el lunes
  const days = useMemo(() => {
    const offset = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const date = iso(view.y, view.m, 1 - offset + i);
      return { date, day: Number(date.slice(8)), outside: Number(date.slice(5, 7)) - 1 !== view.m };
    });
  }, [view]);
  const blocked = (d: string) => Boolean((min && d < min) || (max && d > max));
  const pick = (d: string) => { if (!blocked(d)) { onChange(d); setOpen(false); } };
  const t = today();

  return (
    <div ref={root} className="relative">
      <button
        type="button" id={id} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid} onClick={toggle}
        className={cn("w-full h-10 rounded-lg border bg-white px-3 text-sm flex items-center justify-between gap-3 text-left cursor-pointer", invalid && "border-danger")}
      >
        <span className={cn("tabular", !value && "text-muted/70")}>{value ? show(value) : placeholder}</span>
        <CalendarDays size={16} className="shrink-0 text-muted" />
      </button>

      {open && (
        <Floating anchor={root} panelRef={panel} width={288} role="dialog" aria-label="Calendario" className="rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Mes anterior" onClick={() => shift(-1)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-soft cursor-pointer"><ChevronLeft size={16} /></button>
            <p className="text-sm font-semibold">{monthTitle(view.y, view.m)}</p>
            <button type="button" aria-label="Mes siguiente" onClick={() => shift(1)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-soft cursor-pointer"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-muted mb-1">{WEEKDAYS.map((d, i) => <span key={i} className="py-1">{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map(({ date, day, outside }) => {
              const selected = date === value;
              return (
                <button
                  key={date} type="button" disabled={blocked(date)} onClick={() => pick(date)} aria-label={show(date)} aria-pressed={selected}
                  className={cn(
                    "h-9 rounded-lg text-sm tabular cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
                    outside ? "text-muted/60" : "text-foreground",
                    !selected && "hover:bg-soft",
                    date === t && !selected && "ring-1 ring-primary/40 font-semibold",
                    selected && "bg-primary text-white font-semibold",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t text-sm">
            <button type="button" disabled={blocked(t)} onClick={() => pick(t)} className="px-2 py-1 rounded-md text-secondary font-medium hover:bg-soft disabled:opacity-40 cursor-pointer">Hoy</button>
            {clearable && value && <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="px-2 py-1 rounded-md text-muted hover:bg-soft cursor-pointer">Borrar fecha</button>}
          </div>
        </Floating>
      )}
    </div>
  );
}
