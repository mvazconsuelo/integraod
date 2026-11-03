import { formatMoney } from "@/lib/currency";
import { KIND_LABEL, methodLabel, formatDate } from "@/lib/formatters";
import type { BudgetDetail, Settings } from "@/types";
import { PrintPage } from "@/components/layout/PrintPage";

/** Documento que se imprime o guarda como PDF (Imprimir > Guardar como PDF). */
export function BudgetSheet({ budget, settings }: { budget: BudgetDetail; settings: Settings }) {
  const active = budget.applications.filter((a) => !a.voided_at);
  const color = settings.primary_color;
  return (
    <PrintPage>
      <header className="flex justify-between items-start pb-4 border-b-2" style={{ borderColor: settings.accent_color }}>
        <div className="flex min-w-0 items-center gap-4">
          {settings.logo_data_url && <img src={settings.logo_data_url} alt="" className="h-20 w-auto max-w-[200px] shrink-0 object-contain" />}
          <div className="min-w-0">
            <p className="text-xl font-semibold" style={{ color }}>{settings.name}</p>
            <p>{settings.professional_info}</p>
            <p>{[settings.phone, settings.email, settings.address].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold" style={{ color }}>Presupuesto N° {String(budget.number).padStart(4, "0")}</p>
          <p>Emitido: {formatDate(budget.issued_on)}</p>
          {budget.valid_until && <p>Válido hasta: {formatDate(budget.valid_until)}</p>}
        </div>
      </header>

      <p className="mt-5">Contacto: <strong>{budget.patient_ref}</strong></p>

      <table className="w-full mt-4 border-collapse">
        <thead>
          <tr className="text-left text-white" style={{ background: color }}>
            <th className="p-2">Concepto</th><th className="p-2 text-right">Cant.</th><th className="p-2 text-right">Precio</th><th className="p-2 text-right">Desc.</th><th className="p-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {budget.items.map((i) => (
            <tr key={i.id} className="border-b">
              <td className="p-2">{i.description}</td><td className="p-2 text-right">{i.quantity}</td>
              <td className="p-2 text-right">{formatMoney(i.unit_price_cents)}</td><td className="p-2 text-right">{i.discount_pct ? `${i.discount_pct}%` : "—"}</td>
              <td className="p-2 text-right">{formatMoney(i.total_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-72 space-y-1">
        <Row label="Total" value={formatMoney(budget.total_cents)} bold />
        {active.length > 0 && <Row label="Pagos realizados" value={formatMoney(budget.applied_cents)} />}
        {active.length > 0 && <Row label="Falta pagar" value={formatMoney(budget.balance_cents)} bold />}
      </div>

      {active.length > 0 && (
        <section className="mt-5">
          <p className="font-semibold mb-1">Detalle de pagos</p>
          {active.map((a) => <p key={a.id}>{formatDate(a.paid_at)} · {KIND_LABEL[a.kind]} · {methodLabel(a.method)} · {formatMoney(a.amount_cents)}</p>)}
        </section>
      )}

      {budget.notes && <section className="mt-5"><p className="font-semibold mb-1">Condiciones</p><p className="whitespace-pre-line">{budget.notes}</p></section>}
    </PrintPage>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <p className={`flex justify-between ${bold ? "font-semibold" : ""}`}><span>{label}</span><span>{value}</span></p>
);
