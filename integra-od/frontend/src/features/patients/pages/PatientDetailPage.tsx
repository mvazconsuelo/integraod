import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/shared/Avatar";
import { Amount } from "@/components/shared/Amount";
import { BackLink } from "@/components/shared/BackLink";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/formatters";
import { patientPath } from "@/lib/patients";
import { whatsappUrl } from "@/lib/phone";
import { workOf } from "@/features/budgets/pages/BudgetsPage";
import { ContactDialog } from "../components/ContactDialog";
import type { PatientDetail } from "@/types";

/** Un cliente: cómo contactarlo, cuánto debe y sus presupuestos. Nada más. */
export function PatientDetailPage() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const { data: p, error, loading, reload } = useApi<PatientDetail>(`/patients/detail?name=${encodeURIComponent(name)}`);
  const [editing, setEditing] = useState(false);

  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorMessage message={error ?? "No encontramos a ese destinatario."} onRetry={reload} />;
  const owes = p.totals.balance_cents;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <BackLink to="/clientes">destinatarios</BackLink>
        <div className="flex items-center gap-3.5">
          <Avatar name={p.name} size="lg" />
          <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{p.name}</h1>
        {p.contact && (
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {p.contact.phone ? <span className="tabular">{p.contact.phone_display}</span> : <span>Sin teléfono</span>}
            {p.contact.phone && <a href={whatsappUrl(p.contact.phone, "")} target="_blank" rel="noreferrer" className="font-medium text-secondary hover:underline">Escribirle por WhatsApp</a>}
            <button type="button" onClick={() => setEditing(true)} className="cursor-pointer font-medium text-secondary hover:underline">{p.contact.phone ? "Editar" : "Agregar teléfono"}</button>
          </p>
        )}
          </div>
        </div>
      </div>

      <section aria-label="Lo que debe" className={`rounded-3xl p-5 sm:p-6 ${owes > 0 ? "bg-warning/10" : "bg-success/10"}`}>
        <p className="text-sm font-medium">{owes > 0 ? "Debe" : "Al día"}</p>
        <Amount value={formatMoney(owes)} mobile={40} desktop={52} className="mt-1" />
        <Button className="mt-4 h-12 w-full text-base sm:w-auto sm:px-8" onClick={() => navigate(`/presupuestos/nuevo?cliente=${encodeURIComponent(p.name)}`)}>Nuevo presupuesto</Button>
      </section>

      <section aria-label="Presupuestos">
        <h2 className="mb-1 text-sm font-medium text-muted">Presupuestos</h2>
        {p.budgets.length === 0 ? <p className="py-3 text-sm text-muted">Todavía no tiene presupuestos.</p> : (
          <ul className="divide-y overflow-hidden rounded-3xl border bg-white">
            {p.budgets.map((b) => (
              <li key={b.id}>
                <Link to={`/presupuestos/${b.id}`} className="flex items-baseline justify-between gap-4 px-5 py-3.5 hover:bg-soft/50">
                  <span className="min-w-0"><span className="block truncate font-medium">{workOf(b)}</span><span className="block text-xs text-muted">{formatDate(b.issued_on)} · <StatusBadge kind="budget" status={b.status} /></span></span>
                  <span className="shrink-0 tabular font-semibold">{formatMoney(b.status === "cancelled" || b.balance_cents === 0 ? b.total_cents : b.balance_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && p.contact && <ContactDialog open onOpenChange={setEditing} contact={p.contact} onSaved={(c) => { if (c.name !== p.name) navigate(patientPath(c.name), { replace: true }); else void reload(); }} />}
    </div>
  );
}
