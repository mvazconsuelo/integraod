import { addDays, today } from "./formatters";

export type Period = "today" | "week" | "month" | "last" | "quarter" | "custom";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Últimos 7 días" },
  { value: "month", label: "Este mes" },
  { value: "last", label: "Mes pasado" },
  { value: "quarter", label: "Últimos 3 meses" },
  { value: "custom", label: "Elegir fechas" },
];

export interface PeriodValue { period: Period; from: string; to: string }

export const defaultPeriod = (period: Period = "month"): PeriodValue => ({ period, from: addDays(today(), -6), to: today() });

function rangeFor(p: Exclude<Period, "custom">): { from: string; to: string } {
  const t = today();
  const [y, m] = t.split("-").map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const lastDay = (yy: number, mm: number) => addDays(first(mm === 12 ? yy + 1 : yy, mm === 12 ? 1 : mm + 1), -1);
  if (p === "today") return { from: t, to: t };
  if (p === "week") return { from: addDays(t, -6), to: t };
  if (p === "month") return { from: first(y, m), to: lastDay(y, m) };
  if (p === "last") return m === 1 ? { from: first(y - 1, 12), to: lastDay(y - 1, 12) } : { from: first(y, m - 1), to: lastDay(y, m - 1) };
  return { from: new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10), to: lastDay(y, m) };
}

/** Rango de fechas elegido, o null si las fechas personalizadas no son válidas. */
export function resolveRange(v: PeriodValue): { from: string; to: string } | null {
  if (v.period !== "custom") return rangeFor(v.period);
  return v.from && v.to && v.from <= v.to ? { from: v.from, to: v.to } : null;
}

const monthName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", timeZone: "UTC" });
const shortMonth = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");

/**
 * Cómo nombrar un período anterior para compararlo: "en octubre" si es un mes completo;
 * si no, "en el período anterior (del 01 al 15 de oct)".
 */
export function previousLabel(from: string, to: string): string {
  const lastOfMonth = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).getUTCDate();
  const fullMonth = from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && Number(to.slice(8)) === lastOfMonth;
  if (fullMonth) {
    const sameYear = from.slice(0, 4) === today().slice(0, 4);
    return `en ${monthName(from)}${sameYear ? "" : ` de ${from.slice(0, 4)}`}`;
  }
  const range = from.slice(0, 7) === to.slice(0, 7)
    ? `del ${from.slice(8)} al ${to.slice(8)} de ${shortMonth(to)}`
    : `del ${from.slice(8)} de ${shortMonth(from)} al ${to.slice(8)} de ${shortMonth(to)}`;
  return `en el período anterior (${range})`;
}

/** Las fechas de un período en palabras: "octubre de 2026" si es un mes completo; si no, "del 01 al 15 de oct". */
export function describeRange(from: string, to: string): string {
  if (from === to) return `${Number(to.slice(8))} de ${shortMonth(to)}`;
  const lastOfMonth = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).getUTCDate();
  if (from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && Number(to.slice(8)) === lastOfMonth) return `${monthName(from)} de ${from.slice(0, 4)}`;
  return from.slice(0, 7) === to.slice(0, 7)
    ? `del ${from.slice(8)} al ${to.slice(8)} de ${shortMonth(to)}`
    : `del ${from.slice(8)} de ${shortMonth(from)} al ${to.slice(8)} de ${shortMonth(to)}`;
}
