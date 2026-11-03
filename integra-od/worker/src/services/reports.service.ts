import { listBudgets } from "./budgets.service";
import { listReceived } from "./payments.service";
import { csvMoney, toCsv, type Cell } from "../utils/csv";
import { localDay } from "../utils/dates";

const METHOD: Record<string, string> = { mercadopago: "Mercado Pago", cash: "Efectivo", transfer: "Transferencia" };
/** De dónde vino el pago. Un proveedor nuevo aparece con su propio nombre. */
const ORIGIN: Record<string, string> = { mercadopago: "Mercado Pago", mock: "Simulado (piloto)", manual: "Carga manual" };
const PAY_STATUS = { approved: "Cobrado", refunded: "Reembolsado", voided: "Anulado" } as const;
const BUDGET_STATUS = { sent: "Enviado", in_progress: "En curso", completed: "Completado", cancelled: "Cancelado" } as const;
const pad = (n: number) => String(n).padStart(4, "0");

type Fee = { source: "provider" | "manual"; amount_cents: number; fee_cents: number | null; net_cents: number | null };
/** Lo que le quedó al negocio: el neto informado; en efectivo, todo; si la billetera todavía no lo informó, no se sabe. */
const netOf = (p: Fee) => (p.net_cents ?? (p.source === "manual" ? p.amount_cents : null));
const feeCell = (p: Fee): Cell => (p.fee_cents ?? (p.source === "manual" ? 0 : null)) === null ? "" : csvMoney(p.fee_cents ?? 0);
const netCell = (p: Fee): Cell => (netOf(p) === null ? "" : csvMoney(netOf(p)!));

/** Todos los pagos del período (por día de cobro), con su estado. Las anulaciones y reembolsos se muestran, no se ocultan. */
export async function paymentsCsv(db: D1Database, from: string, to: string) {
  const { results: links } = await db
    .prepare("SELECT a.payment_id, b.number FROM payment_applications a JOIN budgets b ON b.id = a.budget_id WHERE a.voided_at IS NULL ORDER BY b.number")
    .all<{ payment_id: string; number: number }>();
  const numbers = new Map<string, Set<number>>();
  for (const l of links) numbers.set(l.payment_id, (numbers.get(l.payment_id) ?? new Set()).add(l.number));

  const rows = (await listReceived(db)).filter((p) => localDay(p.paid_at) >= from && localDay(p.paid_at) <= to).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  const body: Cell[][] = rows.map((p) => [
    localDay(p.paid_at), p.patient_ref, p.concept, METHOD[p.method] ?? p.method, csvMoney(p.amount_cents),
    feeCell(p), netCell(p), PAY_STATUS[p.status],
    ORIGIN[p.provider] ?? p.provider,
    [...(numbers.get(p.id) ?? [])].map(pad).join(", "), csvMoney(p.available_cents),
  ]);
  // Los pagos simulados del piloto se listan, pero no suman: no son dinero.
  const approved = rows.filter((p) => p.status === "approved" && p.provider !== "mock");
  const simulated = rows.filter((p) => p.status === "approved" && p.provider === "mock").reduce((s, p) => s + p.amount_cents, 0);
  const total = approved.reduce((s, p) => s + p.amount_cents, 0);
  const fees = approved.reduce((s, p) => s + (p.fee_cents ?? 0), 0);
  const net = approved.reduce((s, p) => s + (netOf(p) ?? 0), 0);
  return toCsv([
    ["Fecha", "Contacto", "Concepto", "Medio", "Importe", "Comisión", "Te quedó", "Estado", "Origen", "Presupuesto N°", "Sin usar"],
    ...body,
    ["", "", "TOTAL COBRADO", "", csvMoney(total), csvMoney(fees), csvMoney(net), "", "", "", ""],
    ...(simulated > 0 ? [["", "", "SIMULADO (piloto, no suma)", "", csvMoney(simulated), "", "", "", "", "", ""] as Cell[]] : []),
  ]);
}

/** Presupuestos emitidos en el período, con lo pagado y lo que falta. */
export async function budgetsCsv(db: D1Database, from: string, to: string) {
  const rows = (await listBudgets(db)).filter((b) => b.issued_on >= from && b.issued_on <= to).sort((a, b) => a.number - b.number);
  return toCsv([
    ["N°", "Contacto", "Fecha", "Válido hasta", "Estado", "Total", "Ya pagado", "Falta cobrar"],
    ...rows.map((b): Cell[] => [pad(b.number), b.patient_ref, b.issued_on, b.valid_until, BUDGET_STATUS[b.status], csvMoney(b.total_cents), csvMoney(b.applied_cents), csvMoney(b.balance_cents)]),
  ]);
}
