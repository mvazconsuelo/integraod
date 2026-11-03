import { createContext, useContext, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Capa donde se dibujan los desplegables cuando están dentro de un diálogo. Está fuera de la zona con scroll del diálogo,
 * así el calendario o la lista nunca quedan cortados por su borde.
 */
const LayerContext = createContext<HTMLElement | null>(null);
export const FloatingLayerProvider = LayerContext.Provider;

const MARGIN = 8;
const GAP = 4;

interface Pos { top: number; left: number; width: number; maxHeight: number }
const same = (a: Pos | null, b: Pos) => a !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.maxHeight === b.maxHeight;

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Elemento al que se ancla (el campo o botón que abre el panel). */
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** "anchor": mismo ancho que el campo; o un ancho fijo en px. */
  width?: "anchor" | number;
  /** Alto máximo deseado; si no hay lugar en pantalla, se achica y hace scroll. */
  maxHeight?: number;
  /** Para saber si un clic cayó dentro del panel (cuando se cierra al hacer clic afuera). */
  panelRef?: RefObject<HTMLDivElement | null>;
}

/** Panel flotante pegado a un campo: no lo recorta ningún contenedor, se abre hacia arriba si abajo no hay lugar y no se sale de la pantalla. */
export function Floating({ anchor, children, width = "anchor", maxHeight: cap = 9999, panelRef, className, style, ...rest }: Props) {
  const layer = useContext(LayerContext);
  const el = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current, p = el.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      const w = width === "anchor" ? r.width : width;
      const natural = p.scrollHeight + (p.offsetHeight - p.clientHeight); // alto sin recortar, con bordes
      // El borde de abajo es el del área VISIBLE: con el teclado abierto no es el de la ventana.
      const vv = window.visualViewport;
      const extra = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-extra")) || 0;
      const bottomEdge = (vv ? vv.offsetTop + vv.height : window.innerHeight) - extra;
      const below = bottomEdge - r.bottom - GAP - MARGIN;
      const above = r.top - GAP - MARGIN;
      const up = natural > below && above > below;
      const maxHeight = Math.max(120, Math.min(cap, up ? above : below));
      const shown = Math.min(natural, maxHeight);
      const left = Math.min(Math.max(MARGIN, r.left), Math.max(MARGIN, window.innerWidth - w - MARGIN));
      const top = up ? r.top - GAP - shown : r.bottom + GAP;
      const origin = layer ? layer.getBoundingClientRect() : { left: 0, top: 0 };
      const next = { top: Math.round(top - origin.top), left: Math.round(left - origin.left), width: Math.round(w), maxHeight: Math.round(maxHeight) };
      setPos((prev) => (same(prev, next) ? prev : next));
    };
    place();
    const observer = new ResizeObserver(place);
    if (el.current) observer.observe(el.current);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.addEventListener("scroll", place, true); // también el scroll del diálogo
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, layer, width, cap]);

  const panel = (
    <div
      {...rest}
      ref={(node) => { el.current = node; if (panelRef) panelRef.current = node; }}
      style={{ ...style, position: layer ? "absolute" : "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.width ?? (width === "anchor" ? undefined : width), maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}
      className={cn("z-[70] pointer-events-auto overflow-y-auto rounded-lg border bg-white shadow-[0_10px_28px_-10px_rgba(23,59,54,0.25)]", className)}
    >
      {children}
    </div>
  );
  return createPortal(panel, layer ?? document.body);
}
