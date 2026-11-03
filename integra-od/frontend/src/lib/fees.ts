import { formatMoney } from "./currency";

/** Lo que se llevó la billetera de un pago y lo que le quedó al negocio, en una frase. null si todavía no se sabe (o es efectivo). */
export function feeLine(p: { fee_cents: number | null; net_cents: number | null }): string | null {
  return p.fee_cents == null || p.net_cents == null ? null : `Comisión ${formatMoney(p.fee_cents)} · te llegan ${formatMoney(p.net_cents)}`;
}
