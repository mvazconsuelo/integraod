import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Floating } from "./floating";

export interface MenuAction { label: string; onClick: () => void; tone?: "danger"; hidden?: boolean }

/** Botón "⋯" con lo ocasional: así la pantalla muestra una sola acción principal. */
export function ActionMenu({ actions, label = "Más acciones" }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const shown = actions.filter((a) => !a.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [open]);

  if (shown.length === 0) return null;
  return (
    <>
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-foreground/15 bg-white text-foreground shadow-sm transition hover:bg-soft active:scale-95 aria-expanded:bg-primary aria-expanded:text-white">
        <MoreHorizontal size={24} strokeWidth={2.5} />
      </button>
      {open && (
        <Floating anchor={button} panelRef={panel} width={230} className="p-1">
          <ul role="menu">
            {shown.map((a) => (
              <li key={a.label} role="none">
                <button type="button" role="menuitem" onClick={() => { setOpen(false); a.onClick(); }} className={cn("w-full cursor-pointer rounded-md px-3 py-2.5 text-left text-sm hover:bg-soft", a.tone === "danger" && "text-danger")}>{a.label}</button>
              </li>
            ))}
          </ul>
        </Floating>
      )}
    </>
  );
}
