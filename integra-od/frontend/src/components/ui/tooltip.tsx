import type { ReactNode } from "react";

/** Globito propio para íconos sin texto (el del navegador no sigue el diseño). Aparece al pasar el mouse o con el teclado. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{label}</span>
    </span>
  );
}
