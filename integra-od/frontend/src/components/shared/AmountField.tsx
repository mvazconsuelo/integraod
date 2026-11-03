import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatMoney, parseMoney } from "@/lib/currency";

interface Props { valueCents: number; onChange: (cents: number) => void; id?: string; placeholder?: string; autoFocus?: boolean }

/** Campo de importe en pesos: la persona escribe "30.000" y el sistema guarda centavos. */
export function AmountField({ valueCents, onChange, id, placeholder = "0", autoFocus }: Props) {
  const [text, setText] = useState(valueCents ? formatMoney(valueCents).replace(/[^\d.,]/g, "") : ""); // precargado ya con puntos: "10.000"
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
      <Input
        id={id} inputMode="decimal" autoFocus={autoFocus} className="pl-7 tabular" placeholder={placeholder} value={text}
        onChange={(e) => { setText(e.target.value); const c = parseMoney(e.target.value); onChange(Number.isNaN(c) ? 0 : c); }}
        onBlur={() => { if (valueCents) setText(formatMoney(valueCents).replace(/[^\d.,]/g, "")); }}
      />
    </div>
  );
}
