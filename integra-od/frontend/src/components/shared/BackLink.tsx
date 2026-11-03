import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * Volver adonde la persona estaba: si llegó navegando dentro de la app, vuelve a la pantalla anterior
 * (con su lista, filtro y posición); si abrió el enlace directo, va a `to`.
 */
export function BackLink({ to }: { to: string; /** Solo para quien lee el código: a dónde cae si no hay pantalla anterior. */ children?: string }) {
  const navigate = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <Link
      to={to}
      onClick={(e) => { if (canGoBack) { e.preventDefault(); navigate(-1); } }}
      className="-ml-2 mb-2 inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-3 text-[15px] font-medium text-secondary hover:bg-soft"
    >
      <ChevronLeft size={20} strokeWidth={2.25} aria-hidden />Volver
    </Link>
  );
}
