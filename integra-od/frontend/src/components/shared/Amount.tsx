import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Un importe grande que no se desborda: si tiene muchas cifras o decimales ($ 12.345.678,50) la letra se achica sola
 * para que entre en una línea. Con importes comunes se ve al tamaño completo.
 */
export function Amount({ value, mobile = 28, desktop = 36, className }: { value: string; /** Tamaño en px en celular y en pantallas grandes. */ mobile?: number; desktop?: number; className?: string }) {
  const len = value.replace(/\s/g, "").length;
  const k = len <= 8 ? 1 : len <= 10 ? 0.86 : len <= 12 ? 0.74 : len <= 14 ? 0.64 : 0.54;
  const style = { "--amt-m": `${Math.round(mobile * k)}px`, "--amt-d": `${Math.round(desktop * k)}px` } as CSSProperties;
  return <span style={style} className={cn("block whitespace-nowrap font-semibold leading-none tracking-tight tabular text-[length:var(--amt-m)] sm:text-[length:var(--amt-d)]", className)}>{value}</span>;
}
