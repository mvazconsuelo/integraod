import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isEditable } from "@/hooks/useVisualViewport";

/**
 * Pantalla de un flujo en el celular: ocupa exactamente el área visible y el documento no scrollea.
 *   top      lo fijo de arriba (pasos)           children  la región con scroll PROPIO (solo si no entra)
 *   bar      la acción principal, siempre abajo
 * Cuando aparece el teclado el área se achica (ver useVisualViewport) y la región mantiene a la vista el campo enfocado.
 * En pantallas grandes es una columna normal que fluye con la página.
 */
/** Marca la página como "pantalla completa" en el celular: el documento no scrollea (ver .flow-screen en index.css). */
export function useFlowScreen(keepChrome = false) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("flow-screen");
    root.classList.toggle("keep-chrome", keepChrome); // el Inicio conserva la cabecera y el aviso; los flujos no
    // Al recargar, Safari restaura el scroll de antes; con la página fija ya no se puede volver a subir y el contenido queda corrido hacia arriba.
    window.scrollTo(0, 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [keepChrome]);
  useEffect(() => {
    const root = document.documentElement;
    return () => root.classList.remove("flow-screen", "keep-chrome");
  }, [keepChrome]);
}

export function FlowScreen({ top, bar, children, className }: { top?: ReactNode; bar?: ReactNode; children: ReactNode; /** Para cambiar el ancho máximo (por defecto, una columna angosta). */ className?: string }) {
  const region = useRef<HTMLDivElement>(null);

  useFlowScreen();

  // El campo enfocado queda siempre visible: al enfocarlo y cada vez que el teclado cambia el espacio.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const keep = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const el = document.activeElement;
        if (isEditable(el) && region.current?.contains(el)) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 200);
    };
    const vv = window.visualViewport;
    document.addEventListener("focusin", keep); vv?.addEventListener("resize", keep);
    return () => { clearTimeout(timer); document.removeEventListener("focusin", keep); vv?.removeEventListener("resize", keep); };
  }, []);

  return (
    <div className={cn("mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col", className)}>
      {top}
      <div ref={region} data-flow-region className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 desk:pb-4">{children}</div>
      {bar}
    </div>
  );
}

/** La acción principal del flujo: pegada abajo en el celular, a continuación del contenido en pantallas grandes. */
export function ActionBar({ error, children, className }: { error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-4 shrink-0 border-t bg-white px-4 py-2.5 desk:mx-0 desk:mb-6 desk:mt-2 desk:rounded-2xl desk:border desk:p-4", className)}>
      {error && <p role="alert" className="mb-2 text-sm font-medium text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-4">{children}</div>
    </div>
  );
}
