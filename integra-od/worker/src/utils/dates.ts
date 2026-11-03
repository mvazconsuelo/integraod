// Todos los días, períodos y vencimientos se calculan en la zona horaria del consultorio (Configuración).
// Argentina no tiene horario de verano; en zonas que sí lo tienen, el desfase en las consultas SQL es el vigente hoy.
export const DEFAULT_TIME_ZONE = "America/Argentina/Mendoza";

let zone = DEFAULT_TIME_ZONE;

export const isValidTimeZone = (tz: string): boolean => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};
export const setTimeZone = (tz: string) => { zone = isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE; };
export const getTimeZone = () => zone;

/** Minutos de diferencia de la zona respecto de UTC en ese instante (Argentina: -180). */
export function offsetMinutes(at = new Date(), tz = zone): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** Para fechar en SQL: date(campo, <esto>) da el día del consultorio. */
export const tzOffsetSql = () => `${offsetMinutes()} minutes`;

export const nowIso = () => new Date().toISOString();

/** Día (YYYY-MM-DD) del consultorio de un instante ISO. */
export const localDay = (iso: string): string => {
  const t = Date.parse(iso);
  return new Date(t + offsetMinutes(new Date(t)) * 60_000).toISOString().slice(0, 10);
};

export const todayLocal = (now = new Date()): string => localDay(now.toISOString());

/** El mediodía de un día del consultorio, como instante ISO (para cargar un pago "de ese día"). */
export function localNoon(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 12);
  return new Date(guess - offsetMinutes(new Date(guess)) * 60_000).toISOString();
}

export function monthRange(today = todayLocal()): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Período anterior para comparar. Si el rango son meses completos (ej. 1/11 a 30/11) devuelve los mismos
 * meses hacia atrás (1/10 a 31/10); si no, un tramo de la misma cantidad de días justo antes.
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  const wholeMonths = d1 === 1 && to === monthRange(`${y2}-${String(m2).padStart(2, "0")}-01`).to;
  if (wholeMonths) {
    const n = (y2 * 12 + m2) - (y1 * 12 + m1) + 1;
    const start = new Date(Date.UTC(y1, m1 - 1 - n, 1));
    const prevFrom = start.toISOString().slice(0, 10);
    return { from: prevFrom, to: addDays(from, -1) };
  }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(days - 1)), to: prevTo };
}
