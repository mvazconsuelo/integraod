import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Parte una lista en páginas: devuelve la página (acotada) y lo que se ve en ella. */
export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { pages, current, slice: items.slice((current - 1) * size, current * size) };
}

/** Anterior / Siguiente con "página X de Y". No se muestra si cabe todo en una página. */
export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  const ref = useRef<HTMLElement>(null);
  if (pages <= 1) return null;
  // Al cambiar de página, la lista vuelve arriba (la región que scrollea o la ventana).
  const go = (p: number) => {
    onChange(p);
    for (let el = ref.current?.parentElement; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = 0;
    window.scrollTo(0, 0);
  };
  const btn = "inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border bg-white px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav ref={ref} aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={16} aria-hidden />Anterior</button>
      <span className="text-sm text-muted tabular">Página {page} de {pages}</span>
      <button type="button" className={btn} disabled={page >= pages} onClick={() => go(page + 1)}>Siguiente<ChevronRight size={16} aria-hidden /></button>
    </nav>
  );
}
