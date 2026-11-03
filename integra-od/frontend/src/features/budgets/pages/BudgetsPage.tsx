import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { ActivityTabs } from "@/components/shared/ActivityTabs";
import { PaidBar } from "@/components/shared/PaidBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FilterChips } from "@/components/ui/filter-chips";
import { SearchBox, normText } from "@/components/shared/SearchBox";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/formatters";
import type { Budget } from "@/types";

/** El trabajo en una frase: el primer concepto y, si hay más, cuántos. */
export const workOf = (b: Pick<Budget, "first_item" | "item_count">) => (b.first_item ? `${b.first_item}${b.item_count > 1 ? ` y ${b.item_count - 1} más` : ""}` : "Sin detalle");

export function BudgetsPage() {
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi<Budget[]>("/budgets");
  const [query, setQuery] = useState("");
  if (params.get("nuevo") === "1") return <Navigate to={`/presupuestos/nuevo${params.get("contacto") ? `?contacto=${encodeURIComponent(params.get("contacto")!)}` : ""}`} replace />; // enlaces viejos

  // Filtro por estado (queda en la dirección: /presupuestos?estado=pagados)
  type Estado = "todos" | "pendientes" | "pagados" | "cancelados";
  const estado = (["pendientes", "pagados", "cancelados"].includes(params.get("estado") ?? "") ? params.get("estado") : "todos") as Estado;
  const setEstado = (v: Estado) => setParams((p) => { const n = new URLSearchParams(p); if (v === "todos") n.delete("estado"); else n.set("estado", v); return n; }, { replace: true });
  const matches: Record<Estado, (b: Budget) => boolean> = {
    todos: () => true,
    pendientes: (b) => b.status !== "cancelled" && b.status !== "completed" && b.balance_cents > 0,
    pagados: (b) => b.status === "completed",
    cancelados: (b) => b.status === "cancelled",
  };
  const all = data ?? [];
  const q = normText(query.trim());
  const found = (b: Budget) => !q || normText(b.patient_ref).includes(q) || normText(workOf(b)).includes(q) || String(b.number).padStart(4, "0").includes(q.replace(/^0+/, "") || q);
  const shown = all.filter((b) => matches[estado](b) && found(b));
  const chips = [
    { value: "todos" as const, label: "Todos", count: all.length },
    { value: "pendientes" as const, label: "Pendientes", count: all.filter(matches.pendientes).length },
    { value: "pagados" as const, label: "Pagados", count: all.filter(matches.pagados).length },
    { value: "cancelados" as const, label: "Cancelados", count: all.filter(matches.cancelados).length },
  ];

  const newButton = <Button asChild><Link to="/presupuestos/nuevo"><Plus size={16} />Nuevo presupuesto</Link></Button>;
  return (
    <>
      <ActivityTabs />
      <PageHeader title="Presupuestos" subtitle="Lo que presupuestaste y cuánto falta cobrar." action={newButton} mobileAction={<Button asChild size="sm"><Link to="/presupuestos/nuevo"><Plus size={14} />Nuevo</Link></Button>} />
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data?.length === 0 && <EmptyState message="Todavía no creaste presupuestos. Armá el primero y compartilo en segundos." action={newButton} />}
      {data && data.length > 0 && (
        <div className="mb-5 space-y-3">
          <SearchBox label="Buscar presupuesto" placeholder="Buscar por nombre o trabajo" value={query} onChange={setQuery} />
          <FilterChips label="Filtrar presupuestos por estado" options={chips} value={estado} onChange={setEstado} />
        </div>
      )}
      {data && data.length > 0 && shown.length === 0 && <EmptyState message={query.trim() ? "No encontramos presupuestos con esa búsqueda." : estado === "pendientes" ? "No hay presupuestos pendientes de cobro." : estado === "pagados" ? "Todavía no hay presupuestos pagados por completo." : "No hay presupuestos cancelados."} />}
      {shown.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Presupuestos">
          {shown.map((b) => <BudgetCard key={b.id} b={b} />)}
        </ul>
      )}
    </>
  );
}

function BudgetCard({ b }: { b: Budget }) {
  const open = b.status !== "cancelled" && b.status !== "completed";
  const hasBalance = b.status !== "cancelled" && b.balance_cents > 0;
  return (
    <li className="flex min-w-0 flex-col rounded-2xl border bg-white shadow-[0_8px_24px_-18px_rgba(23,59,54,0.3)]">
      <Link to={`/presupuestos/${b.id}`} className="block space-y-3 p-4 hover:bg-soft/30 rounded-t-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold leading-tight">{b.patient_ref}</p>
            <p className="mt-0.5 truncate text-sm text-muted">{workOf(b)}</p>
          </div>
          <StatusBadge kind="budget" status={b.status} />
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight tabular">{formatMoney(b.total_cents)}</p>
          {b.status === "cancelled" ? null : hasBalance
            ? <p className="text-sm tabular"><span className="text-muted">Falta cobrar </span><strong>{formatMoney(b.balance_cents)}</strong></p>
            : <p className="text-sm font-medium text-success">Todo cobrado</p>}
        </div>
        {open && b.applied_cents > 0 && <PaidBar percent={b.paid_percent} />}
        <p className="text-xs text-muted">N° {String(b.number).padStart(4, "0")} · {formatDate(b.issued_on)}</p>
      </Link>
      {/* Acciones según el estado: no se ofrece lo imposible */}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-3 py-2">
        <Button asChild size="sm" variant="ghost"><Link to={`/presupuestos/${b.id}`}><ChevronRight size={14} />Ver detalle</Link></Button>
        {b.status !== "cancelled" && <Button asChild size="sm" variant="ghost"><Link to={`/presupuestos/${b.id}?compartir=1`}>Compartir</Link></Button>}
        {hasBalance && <Button asChild size="sm" variant="ghost"><Link to={`/presupuestos/${b.id}?pagar=1`}>Registrar pago</Link></Button>}
      </div>
    </li>
  );
}
