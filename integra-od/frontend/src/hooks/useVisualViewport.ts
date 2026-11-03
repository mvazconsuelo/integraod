import { useEffect } from "react";

const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select";
export const isEditable = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.matches(EDITABLE);

/** Safari en iPhone/iPad dibuja encima del teclado una tira (dirección + ✓) que se superpone con el borde de abajo de la página. */
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const IOS_KEYBOARD_STRIP = 30;

/**
 * Mantiene en :root el área que realmente se ve (la del teclado abierto incluida):
 *   --vvh    alto visible (VisualViewport.height)      --vvtop  desfase vertical que mete Safari al abrir el teclado
 *   --kb     alto estimado del teclado   --kb-extra  tira de Safari sobre el teclado (iOS)                  .kb-open  hay un campo enfocado y el teclado ocupa lugar
 * En iOS y en Chrome de Android el teclado achica el viewport visual pero no el de layout, por eso no alcanza con innerHeight.
 * La referencia "sin teclado" se toma mientras no hay un campo enfocado (así sirve también al rotar el celular).
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let base = Math.max(window.innerHeight, vv?.height ?? 0);
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const h = vv?.height ?? window.innerHeight;
      const typing = isEditable(document.activeElement);
      base = typing ? Math.max(base, window.innerHeight) : Math.max(h, window.innerHeight);
      const kb = Math.max(0, base - h);
      root.style.setProperty("--vvh", `${Math.round(h)}px`);
      root.style.setProperty("--vvtop", `${Math.round(vv?.offsetTop ?? 0)}px`);
      root.style.setProperty("--kb", `${Math.round(kb)}px`);
      const open = typing && kb > 120;
      root.classList.toggle("kb-open", open);
      root.style.setProperty("--kb-extra", `${open && IOS ? IOS_KEYBOARD_STRIP : 0}px`);
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(update, 120); }; // al soltar el foco el teclado tarda en bajar
    update();
    vv?.addEventListener("resize", update); vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update); window.addEventListener("orientationchange", later);
    document.addEventListener("focusin", update); document.addEventListener("focusout", later);
    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", update); vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update); window.removeEventListener("orientationchange", later);
      document.removeEventListener("focusin", update); document.removeEventListener("focusout", later);
      root.classList.remove("kb-open"); root.style.removeProperty("--vvh"); root.style.removeProperty("--vvtop"); root.style.removeProperty("--kb"); root.style.removeProperty("--kb-extra");
    };
  }, []);
}
