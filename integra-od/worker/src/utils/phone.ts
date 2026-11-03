/**
 * Teléfono en el formato que pide WhatsApp: solo dígitos, con código de país y sin "+" (wa.me/5493515550123).
 * Pensado para Argentina: acepta como lo escribe la gente ("0351 15 555-0123", "351 5550123", "+54 9 351 555 0123").
 * Devuelve null si no se entiende como un teléfono.
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

  // Argentina escrito a la manera local: 0 + código de área + 15 + número
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    // código de área (2 a 4 dígitos) + "15" + número: se saca el 15
    for (const area of [2, 3, 4]) if (d.startsWith("15", area) && d.length - 2 === 10) { d = d.slice(0, area) + d.slice(area + 2); break; }
  }
  return d.length === 10 ? "549" + d : null;
}

/** Un 54… argentino: los celulares llevan un 9 después del país (54 9 …). */
function argentinaMobile(d: string): string | null {
  let rest = d.slice(2);
  if (rest.startsWith("9")) rest = rest.slice(1);
  if (rest.startsWith("0")) rest = rest.slice(1);
  // 11 15 1234 5678 -> el 15 ya no hace falta
  if (rest.length === 12) for (const area of [2, 3, 4]) if (rest.startsWith("15", area)) { rest = rest.slice(0, area) + rest.slice(area + 2); break; }
  return rest.length === 10 ? "549" + rest : null;
}

/** Para mostrar: 5493515550123 -> "+54 9 351 555 0123". Otros países, solo con "+". */
export function formatPhone(digits: string): string {
  const m = /^549(\d{10})$/.exec(digits);
  if (!m) return `+${digits}`;
  const n = m[1];
  const area = n.startsWith("11") ? 2 : 3; // Buenos Aires tiene código de 2 dígitos; las demás ciudades, en general, de 3
  const local = n.slice(area);
  return `+54 9 ${n.slice(0, area)} ${local.slice(0, -4)} ${local.slice(-4)}`;
}
