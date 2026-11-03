import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/shared/BackLink";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatTile } from "@/components/shared/StatTile";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { KIND_LABEL, methodLabel, formatDate } from "@/lib/formatters";
import { patientPath } from "@/lib/patients";
import { whatsappUrl } from "@/lib/phone";
import { ContactDialog } from "../components/ContactDialog";
import type { PatientDetail } from "@/types";

const pad = (n: number) => String(n).padStart(4, "0");

export function PatientDetailPage() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const { data: p, error, loading, reload } = useApi<PatientDetail>(`/patients/detail?name=${encodeURIComponent(name)}`);
  const [editing, setEditing] = useState(false);

  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorMessage message={error ?? "No encontramos a ese contacto."} onRetry={reload} />;
  const t = p.totals;

  return (
    <>
      <BackLink to="/contactos">agenda</BackLink>
      <PageHeader title={p.name} subtitle="Resumen económico del contacto. No incluye información médica."
        action={<Button onClick={() => navigate(`/presupuestos/nuevo?contacto=${encodeURIComponent(p.name)}`)}><Plus size={16} />Nuevo presupuesto</Button>} />
      {p.contact && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {p.contact.phone ? <span className="tabular">{p.contact.phone_display}</span> : <span className="text-warning">Sin teléfono</span>}
          {p.contact.phone && <a href={whatsappUrl(p.contact.phone, "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-secondary hover:underline">Escribir por WhatsApp<MessageCircle size={14} /></a>}
          <button type="button" onClick={() => setEditing(true)} className="inline-flex cursor-pointer items-center gap-1 font-medium text-secondary hover:underline">Editar<Pencil size={14} /></button>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Presupuestado" value={formatMoney(t.budgeted_cents)} />
          <StatTile label="Pagado" value={formatMoney(t.applied_cents)} tone="success" />
          <StatTile label="Falta cobrar" value={formatMoney(t.balance_cents)} tone="primary" className="col-span-2 lg:col-span-1 order-first lg:order-none" />
          <StatTile label="Dinero sin presupuesto" value={formatMoney(t.unassigned_cents)} tone={t.unassigned_cents > 0 ? "warning" : "default"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2 items-start">
        <Section wide title="Presupuestos" empty="Este contacto no tiene presupuestos." items={p.budgets.length}>
          {p.budgets.map((b) => (
            <li key={b.id} className="py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div><Link to={`/presupuestos/${b.id}`} className="font-medium hover:underline">Presupuesto N° {pad(b.number)}</Link><p className="text-xs text-muted">Emitido el {formatDate(b.issued_on)}</p></div>
              <div className="flex items-center gap-3"><StatusBadge kind="budget" status={b.status} /><div className="text-right"><p className="tabular font-medium">{formatMoney(b.total_cents)}</p><p className="text-xs text-muted tabular">Falta {formatMoney(b.balance_cents)}</p></div></div>
            </li>
          ))}
        </Section>

        <Section title="Cobros solicitados" empty="No se pidió ningún cobro a este contacto." items={p.requests.length}>
          {p.requests.map((r) => (
            <li key={r.id} className="py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div><Link to={`/cobros/${r.id}`} className="font-medium hover:underline">{r.concept}</Link><p className="text-xs text-muted">Pedido el {formatDate(r.created_at)}</p></div>
              <div className="flex items-center gap-3"><StatusBadge status={r.display_status} /><div className="text-right"><p className="tabular font-medium">{formatMoney(r.amount_cents)}</p><p className="text-xs text-muted tabular">Pagado {formatMoney(r.paid_cents)}</p></div></div>
            </li>
          ))}
        </Section>

        <Section title="Pagos recibidos" empty="Todavía no recibió pagos." items={p.payments.length}>
          {p.payments.map((pay) => (
            <li key={pay.id} className={`py-3 flex items-center justify-between gap-3 text-sm ${pay.status !== "approved" ? "opacity-60" : ""}`}>
              <div><p className="font-medium">{KIND_LABEL[pay.kind]} · {methodLabel(pay.method)}</p><p className="text-xs text-muted">{formatDate(pay.paid_at)}{pay.status !== "approved" && ` · ${pay.status === "refunded" ? "Reembolsado" : "Anulado"}`}</p></div>
              <div className="text-right"><p className="tabular font-medium">{formatMoney(pay.amount_cents)}</p>{pay.status === "approved" && pay.available_cents > 0 && <p className="text-xs text-warning tabular">{formatMoney(pay.available_cents)} sin presupuesto</p>}</div>
            </li>
          ))}
        </Section>

        </div>
      </div>
      {editing && p.contact && <ContactDialog open onOpenChange={setEditing} contact={p.contact} onSaved={(c) => { if (c.name !== p.name) navigate(patientPath(c.name), { replace: true }); else void reload(); }} />}
    </>
  );
}

function Section({ title, empty, items, children, wide }: { title: string; empty: string; items: number; children: React.ReactNode; wide?: boolean }) {
  return (
    <Card className={`p-5 ${wide ? "xl:col-span-2" : ""}`}>
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      {items === 0 ? <p className="text-sm text-muted">{empty}</p> : <ul className="divide-y">{children}</ul>}
    </Card>
  );
}
