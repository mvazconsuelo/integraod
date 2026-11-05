import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PeriodPicker } from "@/components/shared/PeriodPicker";
import { downloadFile } from "@/lib/download";
import { defaultPeriod, resolveRange, type PeriodValue } from "@/lib/period";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onPrint: (range: { from: string; to: string }) => void }

const KINDS = [
  { id: "cobros", label: "Cobros", text: "Todo lo que cobraste en esos días, con la comisión y lo que te quedó. Se baja en Excel." },
  { id: "presupuestos", label: "Presupuestos", text: "Cuánto tiene cada uno, cuánto se pagó y cuánto falta. Se baja en Excel." },
  { id: "resumen", label: "Resumen", text: "Una hoja con lo más importante de esos días, para imprimir." },
] as const;
type Kind = (typeof KINDS)[number]["id"];

/** Reportes: se elige el período, qué reporte y un solo botón. Las listas se abren directo en Excel. */
export function ReportsDialog({ open, onOpenChange, onPrint }: Props) {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod());
  const [kind, setKind] = useState<Kind>("cobros");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const range = resolveRange(period);
  const current = KINDS.find((k) => k.id === kind)!;

  const go = async () => {
    if (!range) return;
    if (kind === "resumen") { onOpenChange(false); onPrint(range); return; }
    setBusy(true);
    setError("");
    try { await downloadFile(`/reports/${kind}?from=${range.from}&to=${range.to}`, `${kind}.csv`); } catch (e) { setError(e instanceof Error ? e.message : "No pudimos generar el reporte."); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Descargar reportes"
      footer={<Button className="w-full" disabled={!range || busy} onClick={() => void go()}>{kind === "resumen" ? <Printer size={16} /> : <Download size={16} />}{busy ? "Preparando…" : kind === "resumen" ? "Ver e imprimir" : "Descargar Excel"}</Button>}>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">¿De qué días?</p>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">¿Qué querés?</p>
          <Segmented label="Reporte" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} />
          <p className="text-sm text-muted">{current.text}</p>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
