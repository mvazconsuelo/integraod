import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/** Volver a la lista: bien visible, porque es la salida de cada ficha. */
export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3.5 mb-3 sm:h-9 sm:pl-3 sm:pr-4 sm:mb-4 rounded-lg border bg-white text-sm font-medium text-primary hover:bg-soft">
      <ArrowLeft size={16} strokeWidth={2.5} />Volver a {children}
    </Link>
  );
}
