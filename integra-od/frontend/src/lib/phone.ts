/**
 * Teléfono en el formato que pide WhatsApp: solo dígitos, con código de país y sin "+" (wa.me/5493515550123).
 * Es el mismo cálculo que hace el servidor (worker/src/utils/phone.ts): acá sirve para avisar mientras se escribe.
 * Pensado para Argentina: acepta "0351 15 555-0123", "351 5550123", "+54 9 351 555 0123".
 */
export function normalizePhone(raw: string): string | null {
  const text = raw.trim();
  if (!text || /[A-Za-z]/.test(text)) return null;
  let d = text.replace(/\D/g, "");
  if (!d) return null;
  const international = text.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);

  if (international) return d.length >= 8 && d.length <= 15 ? (d.startsWith("54") ? argentinaMobile(d) : d) : null;
  if (d.startsWith("54")) return argentinaMobile(d);

  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    for (const area of [2, 3, 4]) if (d.startsWith("15", area) && d.length - 2 === 10) { d = d.slice(0, area) + d.slice(area + 2); break; }
  }
  return d.length === 10 ? "549" + d : null;
}

function argentinaMobile(d: string): string | null {
  let rest = d.slice(2);
  if (rest.startsWith("9")) rest = rest.slice(1);
  if (rest.startsWith("0")) rest = rest.slice(1);
  if (rest.length === 12) for (const area of [2, 3, 4]) if (rest.startsWith("15", area)) { rest = rest.slice(0, area) + rest.slice(area + 2); break; }
  return rest.length === 10 ? "549" + rest : null;
}

/** Para mostrar: 5493515550123 -> "+54 9 351 555 0123". */
export function formatPhone(digits: string): string {
  const m = /^549(\d{10})$/.exec(digits);
  if (!m) return `+${digits}`;
  const n = m[1];
  const area = n.startsWith("11") ? 2 : 3;
  const local = n.slice(area);
  return `+54 9 ${n.slice(0, area)} ${local.slice(0, -4)} ${local.slice(-4)}`;
}

/** Link que abre WhatsApp con el mensaje escrito. Con teléfono, abre directo el chat de esa persona. */
export const whatsappUrl = (phone: string | null | undefined, text: string) => `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;

/** Por qué no se entiende un teléfono, dicho con claridad (o null si está bien). Para Argentina: código de área + número = 10 cifras. */
export function phoneError(raw: string): string | null {
  if (normalizePhone(raw)) return null;
  if (/[A-Za-z]/.test(raw)) return "El teléfono tiene que tener solo números.";
  let local = raw.replace(/\D/g, "");
  if (local.startsWith("00")) local = local.slice(2);
  if (local.startsWith("54")) local = local.slice(2);
  if (local.startsWith("9") && local.length > 10) local = local.slice(1);
  if (local.startsWith("0")) local = local.slice(1);
  if (local.length < 10) return `Faltan números: con el código de área son 10 (sin el 0 ni el 15) y escribiste ${local.length}. Ej.: 261 334 4477.`;
  if (local.length > 10) return `Sobran números: con el código de área son 10 (sin el 0 ni el 15) y escribiste ${local.length}.`;
  return "No entendimos ese teléfono. Escribilo con el código de área, por ejemplo 261 334 4477.";
}
