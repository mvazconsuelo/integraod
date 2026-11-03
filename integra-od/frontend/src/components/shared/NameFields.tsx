import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/Field";

/** El teléfono arranca con el código del país: solo se completa lo que sigue. */
export const PHONE_START = "+54 ";

/** El teléfono es opcional: "+54" solo (lo que viene escrito de fábrica) cuenta como vacío. */
export const phoneOrEmpty = (raw: string) => (raw.replace(/\D/g, "").replace(/^54$/, "") ? raw.trim() : "");

export const joinName = (first: string, last: string) => `${first} ${last}`.replace(/\s+/g, " ").trim();

/** Para completar los dos campos desde un nombre ya guardado: el apellido es la última palabra. */
export function splitName(full: string): { first: string; last: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { first: words[0] ?? "", last: "" };
  return { first: words.slice(0, -1).join(" "), last: words[words.length - 1] };
}

/** Nombre y apellido en dos campos, uno al lado del otro. */
export function NameFields({ first, last, onChange, autoFocus }: { first: string; last: string; onChange: (v: { first: string; last: string }) => void; autoFocus?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field required label="Nombre"><Input autoComplete="off" autoFocus={autoFocus} value={first} onChange={(e) => onChange({ first: e.target.value, last })} /></Field>
      <Field required label="Apellido"><Input autoComplete="off" value={last} onChange={(e) => onChange({ first, last: e.target.value })} /></Field>
    </div>
  );
}
