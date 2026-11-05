import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { FlowScreen } from "@/components/layout/FlowScreen";
import { PageHeader } from "@/components/shared/PageHeader";
import { NeedsAttention } from "@/features/payments/components/NeedsAttention";
import { PaidBar } from "@/components/shared/PaidBar";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Segmented } from "@/components/ui/segmented";
import { Pager, paginate } from "@/components/shared/Pager";
import { SearchBox, normText } from "@/components/shared/SearchBox";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { formatMoney } from "@/lib/currency";
import { groupWorks, type WorkGroup } from "@/lib/work-groups";
import type { Budget } from "@/types";

// Los grupos del Inicio, tal como viajan en la dirección (?grupo=…).
const GROUPS: Record<string, { key: WorkGroup; label: string }> = {
  "en-curso": { key: "inProgress", label: "En curso" },
  "esperando-pago": { key: "awaitingPayment", label: "Por pagar" },
  "por-responder": { key: "toAnswer", label: "En espera" },
  atencion: { key: "attention", label: "Vencidos" },
};

const PAGE_SIZE = 8;

/** El concepto en una frase: el primer concepto y, si hay más, cuántos. */
export const workOf = (b: Pick<Budget, "first_item" | "item_count">) => (b.first_item ? `${b.first_item}${b.item_count > 1 ? ` y ${b.item_count - 1} más` : ""}` : "Sin detalle");

/** Presupuestos: lo que falta cobrar primero. Tocar uno abre todo lo suyo (pagos, pedidos e historial). */
export function BudgetsPage() {
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi<Budget[]>("/budgets");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  if (params.get("nuevo") === "1") return <Navigate to={`/presupuestos/nuevo${params.get("cliente") ? `?cliente=${encodeURIComponent(params.get("cliente")!)}` : ""}`} replace />; // enlaces viejos

  const all = data ?? [];
  const owing = all.filter((b) => b.status !== "cancelled" && b.balance_cents > 0);
  // "Falta cobrar" si hay algo; si no, todo. La elección queda en la dirección (?estado=todos).
  const view = (params.get("estado") === "todos" ? "todos" : params.get("estado") === "pendientes" ? "pendientes" : owing.length > 0 ? "pendientes" : "todos") as "pendientes" | "todos";
  const setView = (v: "pendientes" | "todos") => { setPage(1); setParams((p) => { const n = new URLSearchParams(p); n.set("estado", v); return n; }, { replace: true }); };
  const q = normText(query.trim());
  const found = (b: Budget) => !q || normText(b.patient_ref).includes(q) || normText(workOf(b)).includes(q) || String(b.number).padStart(4, "0").includes(q.replace(/^0+/, "") || q);
  const group = GROUPS[params.get("grupo") ?? ""];
  const inGroup = group ? new Set(groupWorks(all)[group.key]) : null;
  const shown = (inGroup ? all.filter((b) => inGroup.has(b.id)) : view === "pendientes" ? owing : all).filter(found);
  const paged = paginate(shown, page, PAGE_SIZE);

  const newButton = <Button asChild><Link to="/presupuestos/nuevo">Nuevo presupuesto</Link></Button>;
  const controls = all.length > 0 && (
    <div className="mb-4 space-y-3.5">
      {group ? <p className="text-sm text-muted">Mostrando: <strong className="text-foreground">{group.label}</strong> · <button type="button" onClick={() => { setPage(1); setParams({}, { replace: true }); }} className="cursor-pointer font-medium text-secondary hover:underline">Ver todos</button></p>
      : <div className="max-w-xs"><Segmented label="Qué ver" value={view} onChange={setView} options={[{ value: "pendientes", label: `Falta cobrar${owing.length ? ` · ${owing.length}` : ""}` }, { value: "todos", label: "Todos" }]} /></div>}
      {all.length > 8 && <SearchBox label="Buscar" placeholder="Buscar por destinatario o concepto" value={query} onChange={(v) => { setQuery(v); setPage(1); }} />}
    </div>
  );
  // Ventana fija: arriba lo que no se mueve (pestañas, título y filtros); la lista scrollea sola en su región.
  return (
    <FlowScreen className="max-w-none" top={<div className="shrink-0 pt-3 sm:pt-0"><PageHeader title="Presupuestos" icon={FileText} action={newButton} mobileAction={<Button asChild size="sm"><Link to="/presupuestos/nuevo">Nuevo</Link></Button>} />{controls}</div>}>
      <NeedsAttention />
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data?.length === 0 && <EmptyState message="Todavía no creaste presupuestos. Armá el primero y compartilo en segundos." action={newButton} />}
      {all.length > 0 && shown.length === 0 && <EmptyState message={q ? "No encontramos nada con esa búsqueda." : group ? "No hay presupuestos en este grupo." : "No hay nada que falte cobrar. Buen presupuesto."} />}
      {shown.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-3xl border bg-white" aria-label="Presupuestos">
          {paged.slice.map((b) => <Row key={b.id} b={b} />)}
        </ul>
      )}
      <Pager page={paged.current} pages={paged.pages} onChange={setPage} />
    </FlowScreen>
  );
}

function Row({ b }: { b: Budget }) {
  const cancelled = b.status === "cancelled";
  const owing = !cancelled && b.balance_cents > 0;
  return (
    <li>
      <Link to={`/presupuestos/${b.id}`} className="flex items-center gap-3.5 px-4 py-4 transition hover:bg-soft/50 sm:px-5">
        <Avatar name={b.patient_ref} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-tight [overflow-wrap:anywhere]">{b.patient_ref}</p>
          <p className="mt-0.5 text-sm text-muted [overflow-wrap:anywhere]">{workOf(b)}</p>
          {owing && b.applied_cents > 0 && <div className="mt-2"><PaidBar percent={b.paid_percent} label={`Cobrado ${formatMoney(b.applied_cents)}`} /></div>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-semibold tabular">{formatMoney(owing ? b.balance_cents : b.total_cents)}</p>
          <p className="mt-0.5 text-xs text-muted">{cancelled ? "Cancelado" : owing ? "falta cobrar" : "Cobrado"}</p>
        </div>
      </Link>
    </li>
  );
}
