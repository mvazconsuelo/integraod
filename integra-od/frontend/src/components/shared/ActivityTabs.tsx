import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

/** "Actividad" junta el historial, los presupuestos y los cobros: tres pestañas arriba de cada lista. */
export function ActivityTabs() {
  const { pathname } = useLocation();
  const tabs = [{ to: "/actividad", label: "Historial" }, { to: "/presupuestos", label: "Presupuestos" }, { to: "/cobros", label: "Cobros" }];
  return (
    <nav aria-label="Actividad" className="mb-5 inline-flex rounded-xl bg-soft p-1">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return <Link key={t.to} to={t.to} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", active ? "bg-white text-primary shadow-sm" : "text-muted hover:text-foreground")}>{t.label}</Link>;
      })}
    </nav>
  );
}
