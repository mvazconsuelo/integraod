import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Buscador de las listas: por nombre, número o lo que escriba quien mira. */
export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input aria-label={label} placeholder={placeholder} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} className="pl-9" />
    </div>
  );
}

export const normText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
