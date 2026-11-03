import { BarChart3, Home, ListChecks, Users } from "lucide-react";

/** Las cuatro secciones. "Actividad" junta presupuestos y cobros; "Control" es donde viven las métricas. */
export const NAV = [
  { to: "/", label: "Inicio", icon: Home, match: ["/"], exact: true },
  { to: "/actividad", label: "Actividad", icon: ListChecks, match: ["/actividad", "/presupuestos", "/cobros"], exact: false },
  { to: "/control", label: "Control", icon: BarChart3, match: ["/control"], exact: false },
  { to: "/contactos", label: "Contactos", icon: Users, match: ["/contactos"], exact: false },
] as const;

export const isNavActive = (item: (typeof NAV)[number], pathname: string) =>
  item.exact ? pathname === "/" : item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
