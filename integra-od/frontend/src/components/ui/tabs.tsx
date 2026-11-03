import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem { id: string; label: ReactNode }

interface Props { tabs: TabItem[]; value: string; onChange: (id: string) => void; label: string; idPrefix?: string; className?: string; wrap?: boolean }

/** Pestañas accesibles: flechas, Inicio y Fin cambian de pestaña. El contenido lo renderiza quien la usa con <TabPanel>. */
export function Tabs({ tabs, value, onChange, label, idPrefix = "tab", className, wrap }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target = e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (target === null) return;
    e.preventDefault();
    onChange(tabs[target].id);
    refs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={cn("flex max-w-full rounded-lg bg-soft p-1 text-sm", wrap ? "flex-wrap gap-1 w-full" : "overflow-x-auto w-fit", className)}>
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id} type="button" ref={(el) => { refs.current[i] = el; }} role="tab" id={`${idPrefix}-${t.id}`} aria-selected={selected} aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKeyDown(e, i)}
            className={cn("px-3 h-8 rounded-md font-medium whitespace-nowrap cursor-pointer", selected ? "bg-white text-primary" : "text-muted hover:text-foreground")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, value, idPrefix = "tab", children }: { id: string; value: string; idPrefix?: string; children: ReactNode }) {
  if (id !== value) return null;
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-${id}`} className="mt-5">{children}</div>;
}
