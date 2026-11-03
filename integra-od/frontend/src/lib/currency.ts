const fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmtCents = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

/** Centavos -> "$ 150.000". Muestra decimales solo si hacen falta. */
export const formatMoney = (cents: number) => (cents % 100 === 0 ? fmt.format(cents / 100) : fmtCents.format(cents / 100));

/** Texto escrito por una persona ("150.000", "1500,50") -> centavos. NaN si no se entiende. */
export function parseMoney(text: string): number {
  const clean = text.replace(/[^\d.,]/g, "");
  if (!clean) return NaN;
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) normalized = clean.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && clean.length - lastDot - 1 !== 3) normalized = clean.replace(/,/g, "");
  else normalized = clean.replace(/[.,]/g, "");
  return Math.round(Number(normalized) * 100);
}
