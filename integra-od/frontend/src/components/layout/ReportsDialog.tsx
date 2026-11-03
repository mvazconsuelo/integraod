import { useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PeriodPicker } from "@/components/shared/PeriodPicker";
import { downloadFile } from "@/lib/download";
import { defaultPeriod, resolveRange, type PeriodValue } from "@/lib/period";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onPrint: (range: { from: string; to: string }) => void }

const FILES = [
  { id: "cobros", title: "Lista de cobros", text: "Todo lo que cobraste en esos días, con la comisión y lo que te quedó." },
  { id: "presupuestos", title: "Lista de presupuestos", text: "Cuánto tiene cada uno, cuánto se pagó y cuánto falta." },
];

/** Reportes: se elige el período y se baja lo que se necesita. Los archivos se abren directo en Excel. */
export function ReportsDialog({ open, onOpenChange, onPrint }: Props) {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const range = resolveRange(period);

  const download = async (id: string) => {
    if (!range) return;
    setBusy(id);
    setError("");
    try { await downloadFile(`/reports/${id}?from=${range.from}&to=${range.to}`, `${id}.csv`); } catch (e) { setError(e instanceof Error ? e.message : "No pudimos generar el reporte."); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Descargar reportes">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">1. ¿De qué días?</p>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">2. ¿Qué querés?</p>
          <ul className="divide-y rounded-lg border">
            {FILES.map((f) => (
              <Row key={f.id} title={f.title} text={f.text}>
                <Button size="sm" variant="secondary" className="w-full sm:w-44 sm:shrink-0 whitespace-nowrap" disabled={!range || busy !== null} onClick={() => void download(f.id)}>
                  <Download size={14} />{busy === f.id ? "Preparando…" : "Descargar Excel"}
                </Button>
              </Row>
            ))}
            <Row title="Resumen para imprimir" text="Una hoja con lo más importante de esos días.">
              <Button size="sm" variant="secondary" className="w-full sm:w-44 sm:shrink-0 whitespace-nowrap" disabled={!range} onClick={() => { if (range) { onOpenChange(false); onPrint(range); } }}>
                <Printer size={14} />Ver e imprimir
              </Button>
            </Row>
          </ul>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

/** Texto a la izquierda y la acción a la derecha; en pantallas angostas la acción baja y ocupa todo el ancho. */
function Row({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-medium">{title}</p><p className="text-sm text-muted">{text}</p></div>
      {children}
    </li>
  );
}
