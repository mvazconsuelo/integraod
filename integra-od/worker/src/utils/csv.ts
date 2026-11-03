// CSV pensado para Excel en español: separador ";", coma decimal y BOM para que las tildes se vean bien.

export type Cell = string | number | null | undefined;

/** Evita que un texto cargado por una persona ("=SUMA(...)") se ejecute como fórmula al abrirlo en Excel. */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

const escape = (c: Cell): string => {
  if (c === null || c === undefined) return "";
  const text = typeof c === "number" ? String(c) : safe(c);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows: Cell[][]): string => "\uFEFF" + rows.map((r) => r.map(escape).join(";")).join("\r\n") + "\r\n";

/** Centavos -> "1500,50" (un número que Excel en español reconoce y puede sumar). */
export const csvMoney = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");
