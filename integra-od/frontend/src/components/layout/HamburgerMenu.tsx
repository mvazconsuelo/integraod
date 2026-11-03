import { useEffect, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileSpreadsheet, LogOut, Menu, Settings, UserRound, X } from "lucide-react";
import { NAV, isNavActive } from "@/app/navigation";
import { setToken } from "@/lib/api";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ size?: number }>;
type Item = { to: string; label: string; icon: Icon };

// Las mismas secciones de la barra de abajo.
const SECTIONS: Item[] = NAV.map((n) => ({ to: n.to, label: n.label, icon: n.icon as Icon }));

/** A la derecha de la barra superior: en el celular es el perfil (las secciones ya están abajo); en escritorio, el menú completo. */
export function MenuButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} onClick={onToggle} className="p-2 rounded-lg text-muted hover:bg-soft cursor-pointer shrink-0">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-soft text-primary md:hidden"><UserRound size={16} /></span>
      <Menu size={22} className="hidden md:block" />
    </button>
  );
}

/**
 * Panel lateral derecho que se abre encima del contenido, sin moverlo. Ordenado por importancia:
 * dónde estoy y a dónde ir, lo que hago seguido, y lo que uso de vez en cuando.
 */
export function MenuPanel({ onClose, onReports }: { onClose: () => void; onReports: () => void }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isActive = (i: Item) => { const n = NAV.find((x) => x.label === i.label); return n ? isNavActive(n, pathname) : pathname.startsWith(i.to); };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-primary/25" onClick={onClose} aria-hidden />
      <aside aria-label="Menú" className="fixed inset-y-0 right-0 z-50 flex w-[85%] max-w-xs flex-col border-l bg-white md:w-72 md:max-w-none">
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <p className="text-base font-semibold"><span className="md:hidden">Mi cuenta</span><span className="hidden md:inline">Menú</span></p>
          <button aria-label="Cerrar menú" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-soft cursor-pointer"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-3">
          {/* En el celular las secciones están en la barra de abajo: acá no se repiten */}
          <div className="hidden space-y-6 md:block">
          <Section title="Ir a">
            {SECTIONS.map((i) => <NavRow key={i.label} item={i} active={isActive(i)} />)}
          </Section>

          </div>

          <Section title="Más">
            <MoreRow item={{ to: "", label: "Descargar reportes", icon: FileSpreadsheet }} onClick={() => { onClose(); onReports(); }} />
            <MoreRow item={{ to: "/configuracion", label: "Configuración", icon: Settings }} />
          </Section>
        </div>

        <div className="shrink-0 border-t p-3">
          <a href="/" onClick={() => setToken("")} className="flex h-10 items-center gap-3 rounded-lg px-2 text-sm text-muted hover:bg-soft hover:text-foreground">
            <LogOut size={18} />Cerrar sesión
          </a>
        </div>
      </aside>
    </>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h2 className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
    <div className="space-y-1">{children}</div>
  </section>
);

/** Navegación: lo más grande; la pantalla en la que estás va resaltada. */
function NavRow({ item: { to, label, icon: Icon }, active }: { item: Item; active: boolean }) {
  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={cn("flex h-12 items-center gap-3 rounded-xl px-2 text-[15px] font-semibold", active ? "bg-primary text-white" : "text-foreground hover:bg-soft")}>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", active ? "bg-white/15 text-white" : "bg-soft text-primary")}><Icon size={18} /></span>
      {label}
    </Link>
  );
}

/** Acciones: ícono de color lleno, para distinguirlas de la navegación. */
function ActionRow({ item: { to, label, icon: Icon } }: { item: Item }) {
  return (
    <Link to={to} className="flex h-11 items-center gap-3 rounded-xl px-2 text-sm font-medium hover:bg-soft">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-soft text-primary"><Icon size={16} /></span>
      {label}
    </Link>
  );
}

/** Lo que se usa de vez en cuando: más discreto. */
function MoreRow({ item: { to, label, icon: Icon }, onClick }: { item: Item; onClick?: () => void }) {
  const cls = "flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-muted hover:bg-soft hover:text-foreground cursor-pointer";
  const content = <><Icon size={18} />{label}</>;
  return onClick ? <button type="button" onClick={onClick} className={cls}>{content}</button> : <Link to={to} className={cls}>{content}</Link>;
}
