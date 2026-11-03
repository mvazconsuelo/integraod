import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { ArrowDown, ArrowUp } from "lucide-react";
import { methodLabel } from "@/lib/formatters";
import { previousLabel } from "@/lib/period";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { Summary } from "@/types";

const METHOD_COLOR: Record<string, string> = { mercadopago: "#D6A66A", cash: "#FFFFFF", transfer: "#9FC1B7" };

/** Compara con el período anterior en una frase: cuánto más o menos se cobró y contra qué. */
function Comparison({ now, before, when }: { now: number; before: number; when: string }) {
  const diff = now - before;
  const base = "mt-2 flex items-center gap-1.5 text-sm tabular";
  const Cap = when.charAt(0).toUpperCase() + when.slice(1);
  if (before === 0) return <p className={cn(base, "text-white/70")}>{Cap} {now === 0 ? "tampoco cobraste nada." : "no cobraste nada."}</p>;
  if (diff === 0) return <p className={cn(base, "text-white/70")}>Igual que {when}.</p>;
  const up = diff > 0;
  return (
    <p className={cn(base, up ? "text-[#A8DCC0]" : "text-[#F0BDB7]")}>
      {up ? <ArrowUp size={14} strokeWidth={2.5} /> : <ArrowDown size={14} strokeWidth={2.5} />}
      <span><strong className="font-semibold">{formatMoney(Math.abs(diff))} {up ? "más" : "menos"}</strong> que {when} <span className="text-white/60">({formatMoney(before)})</span></span>
    </p>
  );
}

/** Lo cobrado en el período, con el período anterior como referencia y de dónde vino el dinero. */
export function CollectedCard({ s }: { s: Summary }) {
  const total = s.by_method.reduce((sum, m) => sum + m.total_cents, 0);
  return (
    <Card className="p-5 sm:p-6 bg-primary text-white border-primary lg:col-span-2 flex flex-col justify-between gap-6">
      <div>
        <p className="text-sm text-white/80">Cobraste en el período</p>
        <p className="mt-1 text-4xl sm:text-5xl font-semibold tracking-tight tabular">{formatMoney(s.collected_cents)}</p>
        {s.fees_cents > 0 && (
          <p className="mt-2 text-sm text-white/80 tabular">
            La billetera se llevó <strong className="font-semibold text-white">{formatMoney(s.fees_cents)}</strong> de comisión · te quedan <strong className="font-semibold text-white">{formatMoney(s.collected_cents - s.fees_cents)}</strong>
          </p>
        )}
        <Comparison now={s.collected_cents} before={s.previous_collected_cents} when={previousLabel(s.previous_range.from, s.previous_range.to)} />
        {s.simulated.payments_count > 0 && (
          <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90 tabular">
            Además hay <strong className="font-semibold text-white">{formatMoney(s.simulated.total_cents)}</strong> en pagos simulados del piloto. Sirven para probar: no son dinero y no suman acá.
          </p>
        )}
      </div>
      {total > 0 ? (
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15" role="img" aria-label="Ingresos por medio de pago">
            {s.by_method.map((m) => <div key={m.method} style={{ width: `${(m.total_cents / total) * 100}%`, background: METHOD_COLOR[m.method] }} />)}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {s.by_method.map((m) => (
              <li key={m.method} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: METHOD_COLOR[m.method] }} />
                <span className="text-white/80">{methodLabel(m.method)}</span>
                <span className="tabular font-medium">{formatMoney(m.total_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/** Lo que falta cobrar hoy. Los links pendientes son una parte de este monto, no algo aparte. */
export function ToCollectCard({ s }: { s: Summary }) {
  const asked = s.pending_requests.pending_cents;
  return (
    <Card className="p-5 sm:p-6 flex flex-col justify-between gap-6">
      <div>
        <p className="text-sm text-muted">Por cobrar</p>
        <p className="mt-1 text-3xl sm:text-4xl font-semibold tracking-tight tabular">{formatMoney(s.budgets_balance_cents)}</p>
        <p className="mt-2 text-sm text-muted">Lo que falta cobrar de tus presupuestos en curso.</p>
      </div>
      <p className="text-sm border-t pt-4">
        {asked > 0
          ? <>Ya pediste <strong className="tabular">{formatMoney(asked)}</strong> en {plural(s.pending_requests.count, "cobro", "cobros")} sin pagar.</>
          : "No tenés cobros pendientes."}
      </p>
    </Card>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="mt-4 divide-y text-sm">{children}</dl>;
}
function Row({ label, value, sub, tone, link, hint }: { label: string; value: string; sub?: string; tone?: "warning"; link?: { to: string; text: string }; /** Cómo se calcula, en una línea. */ hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}{link && <> · <Link to={link.to} className="text-secondary font-medium hover:underline">{link.text}</Link></>}{hint && <span className="block text-xs">{hint}</span>}</dt>
      <dd className={cn("tabular font-medium text-right whitespace-nowrap shrink-0", tone === "warning" && "text-warning")}>{value}{sub && <span className="block text-xs text-muted font-normal">{sub}</span>}</dd>
    </div>
  );
}

/** Lo que pasó dentro del período elegido con los anticipos y los pagos. */
export function PeriodCard({ s }: { s: Summary }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Anticipos y pagos</h2>
      <Rows>
        <Row label="Anticipos pedidos" hint="Anticipos que pediste en el período, estén pagos o no." value={formatMoney(s.advances_requested_cents)} />
        <Row label="Anticipos recibidos" hint="Anticipos ya pagados en el período." value={formatMoney(s.advances_collected_cents)} />
        <Row label="Pagos parciales recibidos" hint="Pagos intermedios (ni el anticipo ni el que cierra el presupuesto)." value={formatMoney(s.partials_collected_cents)} />
      </Rows>
    </Card>
  );
}

/** Los presupuestos emitidos en el período y cuánto se concretan. */
export function BudgetsStatsCard({ s }: { s: Summary }) {
  const a = s.acceptance;
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Presupuestos</h2>
      <Rows>
        <Row label="Presupuestado" hint="Total de los presupuestos emitidos en el período, sin los cancelados." value={formatMoney(s.budgets_issued.total)} sub={`${plural(s.budgets_issued.count, "presupuesto", "presupuestos")}`} />
        <Row label="Ticket promedio" hint="Presupuestado dividido la cantidad emitida." value={s.average_ticket_cents === null ? "—" : formatMoney(s.average_ticket_cents)} />
        <Row label="Aceptación" hint="De los emitidos, cuántos ya recibieron un pago: se acepta pagando." value={a.rate_pct === null ? "—" : `${a.rate_pct} %`} sub={a.issued > 0 ? `${a.accepted} de ${a.issued}` : undefined} />
      </Rows>
    </Card>
  );
}

// Cada estado dicho como se diría en voz alta (no el nombre interno).
const PIPELINE_LABEL: Record<string, string> = { sent: "Esperando que el contacto responda", in_progress: "Ya pagó una parte, falta el resto" };

/** Presupuestos abiertos hoy (no dependen del período elegido) y plata recibida que todavía no se asignó. */
export function OpenBudgetsCard({ s }: { s: Summary }) {
  const order = ["sent", "in_progress"];
  const rows = order.map((st) => s.pipeline.find((p) => p.status === st)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Presupuestos abiertos</h2>
        <Link to="/presupuestos" className="text-sm text-secondary font-medium hover:underline">Ver todos</Link>
      </div>
      <Rows>
        {rows.length === 0 && <p className="py-2.5 text-muted">No hay presupuestos abiertos.</p>}
        {rows.map((p) => (
          <Row key={p.status} label={PIPELINE_LABEL[p.status]} value={String(p.count)} sub={p.status === "sent" ? formatMoney(p.total_cents) : `Falta ${formatMoney(p.balance_cents)}`} />
        ))}
        {s.advances_unapplied_cents > 0 && (
          <Row label="Recibido, todavía sin presupuesto" value={formatMoney(s.advances_unapplied_cents)} tone="warning" link={{ to: "/cobros?tab=recibidos", text: "Elegir presupuesto" }} />
        )}
      </Rows>
    </Card>
  );
}
