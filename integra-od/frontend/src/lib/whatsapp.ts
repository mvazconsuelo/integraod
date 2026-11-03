import { formatMoney } from "./currency";

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " "); // el importe trae un espacio especial: en el mensaje va uno común

/**
 * El mensaje que se le manda al cliente con el presupuesto. El presupuesto en sí va como PDF adjunto (lo adjunta quien envía).
 * Con anticipo agrega el link para reservar.
 */
export function budgetMessage(o: { patient: string; number: number; clinic: string; advance?: { amountCents: number; link: string; kind?: "advance" | "partial" | "final" } | null }): string {
  const head = `Hola ${o.patient}, te paso tu presupuesto N° ${String(o.number).padStart(4, "0")} de ${o.clinic || "nuestro negocio"}`;
  if (!o.advance) return `${head}.`;
  const money = formatMoney(o.advance.amountCents);
  // Con anticipo se reserva; un pago por el total o parcial se "paga".
  const ask = !o.advance.kind || o.advance.kind === "advance" ? `Para reservar, podés abonar el anticipo de ${money}` : `Para pagar, podés abonar ${money}`;
  return plain(`${head}:\n${ask} acá: ${o.advance.link}`);
}
