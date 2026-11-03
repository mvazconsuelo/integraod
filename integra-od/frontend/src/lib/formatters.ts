import { clinicTimeZone, dayOf } from "./time-zone";
const fmt = (timeZone: string) => new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone });

/** Acepta "2026-11-02" o un ISO completo. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Un día suelto es una fecha de calendario (no se corre por la zona); un instante se muestra en la zona del consultorio.
  const day = value.length === 10;
  return fmt(day ? "UTC" : clinicTimeZone()).format(day ? new Date(`${value}T12:00:00Z`) : new Date(value)).replace(".", "");
}

export const today = () => dayOf(new Date());

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const METHOD_LABEL: Record<string, string> = { mercadopago: "Mercado Pago", cash: "Efectivo", transfer: "Transferencia" };
export const methodLabel = (m: string) => METHOD_LABEL[m] ?? m;
export const KIND_LABEL: Record<string, string> = { advance: "Anticipo", partial: "Pago parcial", final: "Pago final" };
export const BUDGET_STATUS_LABEL: Record<string, string> = {
  sent: "Sin pagos", in_progress: "Con pagos", completed: "Cobrado", cancelled: "Cancelado",
};
export const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "Esperando pago", paid: "Pagado", expired: "Vencido", cancelled: "Cancelado", partially_paid: "Pagó una parte",
};

/** Día (YYYY-MM-DD) del consultorio de un instante ISO. */
export const localDay = (iso: string) => dayOf(new Date(iso));
