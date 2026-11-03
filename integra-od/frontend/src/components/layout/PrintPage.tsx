import type { ReactNode } from "react";

/**
 * Hoja que se imprime o se guarda como PDF. Los márgenes los pone la hoja (no el navegador): con el margen del navegador en cero
 * no escribe encima el título, la fecha ni la dirección de la página. Los espacios de arriba y abajo se repiten en cada hoja.
 */
export function PrintPage({ children }: { children: ReactNode }) {
  return (
    <article className="print-sheet hidden print:block bg-white text-[#26332F] text-[13px] leading-relaxed" aria-hidden>
      <table className="w-full border-collapse">
        <thead><tr><td className="h-[14mm] p-0" /></tr></thead>
        <tbody><tr><td className="p-0 px-[14mm] align-top">{children}</td></tr></tbody>
        <tfoot><tr><td className="h-[14mm] p-0" /></tr></tfoot>
      </table>
    </article>
  );
}
