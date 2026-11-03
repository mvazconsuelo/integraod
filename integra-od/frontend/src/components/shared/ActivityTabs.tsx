import { Link, useLocation } from "react-router-dom";
import { NeedsAttention } from "@/features/payments/components/NeedsAttention";
import { cn } from "@/lib/utils";

/** Arriba de Presupuestos e Historial: el cambio entre las dos vistas y, solo si hace falta, lo que hay que resolver. */
export function ActivityTabs() {
  const { pathname } = useLocation();
  const tabs = [{ to: "/presupuestos", label: "Presupuestos" }, { to: "/actividad", label: "Historial" }];
  return (
    <>
      <nav aria-label="Actividad" className="mb-6 inline-flex rounded-full bg-soft p-1">
        {tabs.map((t) => {
          const active = pathname === t.to;
          return <Link key={t.to} to={t.to} aria-current={active ? "page" : undefined} className={cn("rounded-full px-5 py-2 text-[15px] font-semibold transition", active ? "bg-primary text-white" : "text-muted hover:text-foreground")}>{t.label}</Link>;
        })}
      </nav>
      <NeedsAttention />
    </>
  );
}
