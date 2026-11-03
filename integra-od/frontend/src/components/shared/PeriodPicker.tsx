import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { PERIODS, resolveRange, type Period, type PeriodValue } from "@/lib/period";

/** Elegir el período: uno rápido o los días que quiera, con fechas desde / hasta. */
export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const invalid = value.period === "custom" && resolveRange(value) === null;
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
      <div className="w-full sm:w-48">
        <Dropdown
          searchable={false} ariaLabel="Período" value={value.period} placeholder="Elegí un período"
          onChange={(v) => onChange({ ...value, period: v as Period })}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        />
      </div>
      {value.period === "custom" && (
        // En el celular las dos fechas van lado a lado y ocupan todo el ancho.
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <div className="sm:w-40"><span className="block text-xs text-muted mb-1">Desde</span><DatePicker ariaLabel="Desde" value={value.from} max={value.to || undefined} onChange={(v) => onChange({ ...value, from: v })} /></div>
          <div className="sm:w-40"><span className="block text-xs text-muted mb-1">Hasta</span><DatePicker ariaLabel="Hasta" value={value.to} min={value.from || undefined} onChange={(v) => onChange({ ...value, to: v })} /></div>
        </div>
      )}
      {invalid && <p role="alert" className="sm:basis-full text-xs text-danger">Elegí las dos fechas. «Desde» no puede ser posterior a «Hasta».</p>}
    </div>
  );
}
