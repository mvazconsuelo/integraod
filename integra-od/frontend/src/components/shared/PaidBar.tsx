/** Cuánto del presupuesto ya se pagó: barra y porcentaje con texto (no depende solo del color). */
export function PaidBar({ percent, label = "Pagado" }: { percent: number; label?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular">{percent} %</span>
      </div>
      <div role="progressbar" aria-label={`${label}: ${percent} por ciento`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
