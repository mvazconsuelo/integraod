import { formatMoney } from "./currency";

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " "); // el importe trae un espacio especial: en el mensaje va uno común

/**
 * El mensaje que se le manda al cliente por su presupuesto. No dice que va algo adjunto: WhatsApp no deja adjuntar desde un enlace,
 * así que el mensaje se explica solo (número y total). Con un cobro online agrega el link para pagar; con transferencia, los datos bancarios.
 */
export function budgetMessage(o: { patient: string; totalCents: number; number: number; clinic: string; advance?: { amountCents: number; link: string; kind?: "advance" | "partial" | "final" } | null; bank?: { holder: string; cbu: string; alias: string } | null; /** Anticipo o pago pedido sin link (transferencia o efectivo). */ manualAsk?: { amountCents: number; kind?: "advance" | "partial" | "final" } | null }): string {
  const head = `Hola ${o.patient}, te escribo por tu presupuesto N° ${String(o.number).padStart(4, "0")} de ${o.clinic || "nuestro negocio"}, por un total de ${formatMoney(o.totalCents)}`;
  if (!o.advance) {
    // Cobro por transferencia: van los datos para transferir (solo los que están cargados).
    const lines = o.bank ? [o.bank.holder && `Titular: ${o.bank.holder}`, o.bank.cbu && `CBU/CVU: ${o.bank.cbu}`, o.bank.alias && `Alias: ${o.bank.alias}`].filter(Boolean) : [];
    const money = o.manualAsk ? formatMoney(o.manualAsk.amountCents) : "";
    const ask = !o.manualAsk ? "" : !o.manualAsk.kind || o.manualAsk.kind === "advance" ? `Para reservar, podés abonar el anticipo de ${money}` : `Para pagar, podés abonar ${money}`;
    if (!lines.length) return plain(ask ? `${head}.\n${ask}.` : `${head}.`);
    return plain(`${head}.\n${ask ? `${ask}, transfiriendo a:` : "Podés transferir a:"}\n${lines.join("\n")}`);
  }
  const money = formatMoney(o.advance.amountCents);
  // Con anticipo se reserva; un pago por el total o parcial se "paga".
  const ask = !o.advance.kind || o.advance.kind === "advance" ? `Para reservar, podés abonar el anticipo de ${money}` : `Para pagar, podés abonar ${money}`;
  return plain(`${head}:\n${ask} acá: ${o.advance.link}`);
}
