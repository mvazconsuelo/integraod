import { useEffect } from "react";

/** La página ocupa exactamente la pantalla (sin scroll de documento). Al recargar vuelve al tope: Safari restaura el scroll de antes. */
export function useFixedPage() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("fixed-page");
    window.scrollTo(0, 0);
    return () => root.classList.remove("fixed-page");
  }, []);
}
