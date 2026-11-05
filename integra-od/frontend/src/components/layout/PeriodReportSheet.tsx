import { useEffect } from "react";
import { useSettings } from "@/app/providers";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { methodLabel, formatDate, localDay } from "@/lib/formatters";
import type { Received, Summary } from "@/types";
import { printAs } from "@/lib/print";
import { PrintPage } from "./PrintPage";

const STATUS = { approved: "Cobrado", refunded: "Reembolsado", voided: "Anulado" } as const;

/** Hoja imprimible del período: se carga, abre el diálogo de imprimir (Guardar como PDF) y se retira. */
export function PeriodReportSheet({ from, to, onDone }: { from: string; to: string; onDone: () => void }) {
  const { settings } = useSettings();
  const summary = useApi<Summary>(`/dashboard?from=${from}&to=${to}`);
  const received = useApi<Received[]>("/payments/received");
  const s = summary.data;
  const rows = (received.data ?? []).filter((p) => localDay(p.paid_at) >= from && localDay(p.paid_at) <= to).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  const ready = Boolean(s && received.data && settings);
  const failed = Boolean(summary.error || received.error);

  useEffect(() => {
    if (!ready) return;
    window.addEventListener("afterprint", onDone, { once: true });
    const t = setTimeout(() => printAs(`Resumen del ${formatDate(from)} al ${formatDate(to)}`), 200);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (failed) onDone(); }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = settings?.primary_color ?? "#173B36";
  const total = rows.filter((p) => p.status === "approved").reduce((sum, p) => sum + p.amount_cents, 0);

  return (
    <>
      <p role="status" className="print:hidden fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-primary text-white text-sm px-4 py-2">Preparando el resumen…</p>
      {ready && s && settings && (
        <PrintPage>
          <header className="flex items-center justify-between pb-4 border-b-2" style={{ borderColor: settings.accent_color }}>
            <div className="flex items-center gap-3">
              {settings.logo_url && <img src={settings.logo_url} alt="" className="h-12 w-auto object-contain" />}
              <p className="text-xl font-semibold" style={{ color }}>{settings.logo_url ? "" : settings.name}</p>
            </div>
            <div className="text-right"><p className="text-lg font-semibold" style={{ color }}>Resumen del período</p><p>Del {formatDate(from)} al {formatDate(to)}</p></div>
          </header>

          <table className="w-full mt-5 border-collapse">
            <tbody>
              <Line label="Cobraste en el período" value={formatMoney(s.collected_cents)} bold />
              <Line label={`Período anterior (${formatDate(s.previous_range.from)} al ${formatDate(s.previous_range.to)})`} value={formatMoney(s.previous_collected_cents)} />
              {s.by_method.map((m) => <Line key={m.method} label={`   ${methodLabel(m.method)}`} value={formatMoney(m.total_cents)} />)}
              <Line label="Falta cobrar hoy (presupuestos con pagos)" value={formatMoney(s.budgets_balance_cents)} bold />
              <Line label="Anticipos a cobrar en el período" value={formatMoney(s.advances_requested_cents)} />
              <Line label="Anticipos cobrados en el período" value={formatMoney(s.advances_collected_cents)} />
              <Line label="Presupuestos emitidos en el período" value={`${s.budgets_issued.count} · ${formatMoney(s.budgets_issued.total)}`} />
            </tbody>
          </table>

          <h2 className="mt-6 mb-2 font-semibold" style={{ color }}>Cobros del período</h2>
          {rows.length === 0 ? <p>No hubo cobros en estas fechas.</p> : (
            <table className="w-full border-collapse">
              <thead><tr className="text-left text-white" style={{ background: color }}><th className="p-2">Fecha</th><th className="p-2">Destinatario</th><th className="p-2">Concepto</th><th className="p-2">Medio</th><th className="p-2">Estado</th><th className="p-2 text-right">Importe</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b"><td className="p-2">{formatDate(p.paid_at)}</td><td className="p-2">{p.patient_ref}</td><td className="p-2">{p.concept}</td><td className="p-2">{methodLabel(p.method)}</td><td className="p-2">{STATUS[p.status]}</td><td className="p-2 text-right">{formatMoney(p.amount_cents)}</td></tr>
                ))}
                <tr className="font-semibold"><td className="p-2" colSpan={5}>Total cobrado</td><td className="p-2 text-right">{formatMoney(total)}</td></tr>
              </tbody>
            </table>
          )}
        </PrintPage>
      )}
    </>
  );
}

const Line = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <tr className={`border-b ${bold ? "font-semibold" : ""}`}><td className="py-1.5 whitespace-pre">{label}</td><td className="py-1.5 text-right">{value}</td></tr>
);
