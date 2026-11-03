import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useCopy } from "@/hooks/useCopy";
import { publicLink } from "../services/payments.service";

export function CopyLinkButton({ publicId, iconOnly }: { publicId: string; iconOnly?: boolean }) {
  const { state, copy } = useCopy();
  const label = state === "copied" ? "Copiado" : state === "failed" ? "No se pudo copiar" : "Copiar link";
  const onClick = () => void copy(publicLink(publicId));
  const icon = state === "copied" ? <Check size={iconOnly ? 16 : 14} className={iconOnly ? "text-success" : undefined} /> : <Copy size={iconOnly ? 16 : 14} />;
  if (iconOnly) {
    return <Tooltip label={label}><Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onClick} aria-label="Copiar link de pago">{icon}</Button></Tooltip>;
  }
  return <Button size="sm" variant="secondary" onClick={onClick}>{icon}{label}</Button>;
}
