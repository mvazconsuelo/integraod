import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FloatingLayerProvider } from "./floating";

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode;
  /** Botón(es) principal(es): quedan fijos abajo, siempre a la vista, sin tener que scrollear el formulario. */
  footer?: ReactNode;
  /** Ocupa toda la pantalla (celular, tablet y escritorio), con la altura real visible: el teclado la achica y el botón queda a la vista. */
  fullScreen?: boolean;
}

/**
 * En el celular es una hoja que sube desde abajo: el título queda fijo arriba, el botón principal fijo abajo y solo el
 * contenido del medio se desplaza. Usa la altura real de la pantalla (dvh), que en iPhone cambia con la barra del navegador.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, fullScreen }: Props) {
  // Capa para los desplegables (calendario, listas): fuera de la zona con scroll, así no se cortan.
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-primary/30" />
        <D.Content
          className={fullScreen ? "fixed left-0 top-0 z-50 flex w-full flex-col bg-background" : "fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-lg max-h-[94dvh] sm:max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border"}
          style={fullScreen ? { height: "calc(var(--vvh, 100dvh) - var(--kb-extra, 0px))", transform: "translateY(var(--vvtop, 0px))" } : undefined}>
          <div className={fullScreen ? "mx-auto flex w-full max-w-2xl shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6" : "flex shrink-0 items-start justify-between gap-3 px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3"}>
            <div>
              <D.Title className="text-lg font-semibold leading-tight">{title}</D.Title>
              {/* En el celular la descripción no se muestra (la pantalla es chica); sigue disponible para lectores de pantalla. */}
              <D.Description className={description ? "sr-only sm:not-sr-only sm:block text-sm text-muted mt-1" : "sr-only"}>{description ?? title}</D.Description>
            </div>
            <D.Close className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted hover:bg-soft cursor-pointer" aria-label="Cerrar"><X size={18} /></D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className={fullScreen ? "mx-auto w-full max-w-2xl px-4 pb-4 sm:px-6 sm:pb-6" : "px-4 pb-4 sm:px-6 sm:pb-6"}>
              <FloatingLayerProvider value={layer}>{children}</FloatingLayerProvider>
            </div>
          </div>
          {footer && <div className={fullScreen ? "shrink-0 border-t bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 desk:pb-10 desk:pt-4" : "shrink-0 rounded-b-2xl border-t bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4"}>{fullScreen ? <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">{footer}</div> : footer}</div>}
          <div ref={setLayer} aria-hidden className="pointer-events-none absolute inset-0" />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
