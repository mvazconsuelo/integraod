import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "primary" | "warning";

/** Un número importante con su título. "primary" es el dato principal de la pantalla: uno solo, el que hay que mirar primero. */
export function StatTile({ label, value, hint, tone = "default", className }: { label: string; value: string; hint?: string; tone?: Tone; className?: string }) {
  return (
    <Card className={cn("p-4 sm:p-5", tone === "primary" && "bg-primary text-white border-primary", tone === "warning" && "border-warning/50", className)}>
      <p className={cn("text-sm", tone === "primary" ? "text-white/80" : "text-muted")}>{label}</p>
      <p className={cn("mt-1 text-2xl sm:text-3xl font-semibold tracking-tight tabular", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</p>
      {hint && <p className={cn("mt-1 text-xs", tone === "primary" ? "text-white/70" : "text-muted")}>{hint}</p>}
    </Card>
  );
}
