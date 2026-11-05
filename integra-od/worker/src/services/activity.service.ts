import { formatArs } from "../utils/money";

/**
 * Historial cronológico: lo que pasó, dicho en una frase y con el lugar al que lleva.
 * No inventa nada: cada línea sale de un presupuesto, un cobro, un pago o un cambio de estado que existe.
 * (Compartir un presupuesto por WhatsApp no se registra: ocurre fuera del sistema.)
 */
export interface ActivityEvent {
  id: string;
  at: string;
  type: "budget" | "request" | "payment" | "adjustment";
  text: string;
  detail?: string;
  /** Pantalla con el contexto de este movimiento. */
  to: string;
  /** Pago o cobro del piloto: no es dinero real. */
  simulated?: boolean;
}

const KIND_WORD: Record<string, string> = { advance: "Anticipo pendiente", partial: "Pago pendiente", final: "Pago final pendiente" };

export async function listActivity(db: D1Database, limit = 60): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];

  const { results: budgets } = await db.prepare("SELECT id, patient_ref, total_cents, created_at FROM budgets").all<{ id: string; patient_ref: string; total_cents: number; created_at: string }>();
  const byId = new Map(budgets.map((b) => [b.id, b]));
  for (const b of budgets) events.push({ id: `b-${b.id}`, at: b.created_at, type: "budget", text: `Creaste un presupuesto para ${b.patient_ref}`, detail: formatArs(b.total_cents), to: `/presupuestos/${b.id}` });

  const { results: audit } = await db.prepare("SELECT seq, at, entity_id, detail FROM audit_log WHERE action = 'budget.status' ORDER BY seq").all<{ seq: number; at: string; entity_id: string; detail: string }>();
  for (const a of audit) {
    const b = byId.get(a.entity_id);
    const d = JSON.parse(a.detail || "{}") as { from?: string; to?: string };
    if (!b) continue;
    if (d.to === "completed") events.push({ id: `s-${a.seq}`, at: a.at, type: "budget", text: `El presupuesto de ${b.patient_ref} quedó completado`, detail: "Se cobró todo", to: `/presupuestos/${b.id}` });
    else if (d.to === "cancelled") events.push({ id: `s-${a.seq}`, at: a.at, type: "budget", text: `Cancelaste el presupuesto de ${b.patient_ref}`, to: `/presupuestos/${b.id}` });
    else if (d.from === "cancelled" && d.to === "sent") events.push({ id: `s-${a.seq}`, at: a.at, type: "budget", text: `Reabriste el presupuesto de ${b.patient_ref}`, to: `/presupuestos/${b.id}` });
  }

  const { results: requests } = await db.prepare("SELECT id, patient_ref, amount_cents, kind, provider, budget_id, created_at, cancelled_at, status FROM payment_requests").all<{ id: string; patient_ref: string; amount_cents: number; kind: string; provider: string; created_at: string; cancelled_at: string | null; status: string }>();
  for (const r of requests) {
    const how = r.provider === "cash" ? ", sin link de pago" : "";
    events.push({ id: `r-${r.id}`, at: r.created_at, type: "request", text: `${KIND_WORD[r.kind] ?? "Pago pendiente"} de ${formatArs(r.amount_cents)} de ${r.patient_ref}${how}`, detail: "Todavía no es dinero recibido", to: `/cobros/${r.id}`, simulated: r.provider === "mock" });
    if (r.status === "cancelled") events.push({ id: `rc-${r.id}`, at: r.cancelled_at ?? r.created_at, type: "request", text: `Cancelaste el cobro de ${formatArs(r.amount_cents)} a ${r.patient_ref}`, to: `/cobros/${r.id}`, simulated: r.provider === "mock" });
  }

  // Pagos recibidos: con lo que queda pendiente del presupuesto en ese momento (total − lo aplicado hasta ese pago).
  const { results: payments } = await db.prepare("SELECT id, patient_ref, amount_cents, method, provider, paid_at, status, voided_at, void_reason, request_id FROM payments").all<{ id: string; patient_ref: string; amount_cents: number; method: string; provider: string; paid_at: string; status: string; voided_at: string | null; void_reason: string | null; request_id: string | null }>();
  const { results: apps } = await db.prepare("SELECT payment_id, budget_id, amount_cents, created_at FROM payment_applications WHERE voided_at IS NULL ORDER BY created_at, rowid").all<{ payment_id: string; budget_id: string; amount_cents: number; created_at: string }>();
  const running = new Map<string, number>();
  const pendingAfter = new Map<string, { budget_id: string; pending: number }>();
  for (const a of apps) {
    const total = byId.get(a.budget_id)?.total_cents ?? 0;
    const applied = (running.get(a.budget_id) ?? 0) + a.amount_cents;
    running.set(a.budget_id, applied);
    pendingAfter.set(a.payment_id, { budget_id: a.budget_id, pending: Math.max(0, total - applied) });
  }
  for (const p of payments) {
    const link = pendingAfter.get(p.id);
    const sim = p.provider === "mock";
    const to = link ? `/presupuestos/${link.budget_id}` : "/cobros?tab=recibidos";
    events.push({ id: `p-${p.id}`, at: p.paid_at, type: "payment", text: `Recibiste ${formatArs(p.amount_cents)} de ${p.patient_ref}`, detail: link ? (link.pending > 0 ? `Quedan ${formatArs(link.pending)} pendientes` : "Ya no queda nada pendiente") : "Todavía sin presupuesto asignado", to, simulated: sim });
    if (p.status !== "approved") events.push({ id: `pv-${p.id}`, at: p.voided_at ?? p.paid_at, type: "adjustment", text: `${p.status === "refunded" ? "Se reembolsó" : "Anulaste"} el pago de ${formatArs(p.amount_cents)} de ${p.patient_ref}`, detail: p.void_reason ?? undefined, to, simulated: sim });
  }

  return events.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit);
}
