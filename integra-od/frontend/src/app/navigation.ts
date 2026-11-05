import { BarChart3, FileText, Home, Users } from "lucide-react";

/** Cuatro secciones: Inicio, Presupuestos (y su historial), Destinatarios y Métricas (las métricas). */
export const NAV = [
  { to: "/", label: "Inicio", icon: Home, match: ["/"], exact: true },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText, match: ["/presupuestos"], exact: false },
  { to: "/clientes", label: "Destinatarios", icon: Users, match: ["/clientes"], exact: false },
  { to: "/control", label: "Métricas", icon: BarChart3, match: ["/control", "/actividad"], exact: false },
] as const;

export const isNavActive = (item: (typeof NAV)[number], pathname: string) =>
  item.exact ? pathname === "/" : item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
