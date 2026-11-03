import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

/** Estado de un botón "Copiar": copiado, o no se pudo (y se le dice a la persona en lugar de abrir una ventana del sistema). */
export function useCopy() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async (text: string) => {
    const ok = await copyToClipboard(text);
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2500);
  };
  return { state, copy };
}
