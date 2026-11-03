// Todos los importes son enteros en centavos.

export interface ItemInput {
  quantity: number;
  unit_price_cents: number;
  discount_pct: number;
}

export function itemTotal(item: ItemInput): number {
  const gross = item.quantity * item.unit_price_cents;
  return Math.round((gross * (100 - item.discount_pct)) / 100);
}

export function budgetTotal(items: ItemInput[]): number {
  return items.reduce((sum, item) => sum + itemTotal(item), 0);
}

/** Saldo pendiente = total del presupuesto - pagos aplicados. */
export function budgetBalance(totalCents: number, appliedCents: number): number {
  return totalCents - appliedCents;
}

/** Disponible = importe recibido - importe ya aplicado a presupuestos. */
export function paymentAvailable(amountCents: number, appliedCents: number): number {
  return amountCents - appliedCents;
}

/** Cuánto se puede aplicar de un pago a un presupuesto sin pasarse de ninguno de los dos límites. */
export function applicableAmount(availableCents: number, balanceCents: number): number {
  return Math.max(0, Math.min(availableCents, balanceCents));
}

export type RequestStatus = "pending" | "partially_paid" | "paid" | "cancelled";

export function requestStatusFor(requestedCents: number, paidCents: number): "pending" | "partially_paid" | "paid" {
  if (paidCents <= 0) return "pending";
  return paidCents >= requestedCents ? "paid" : "partially_paid";
}

/** "Vencido" se deriva de la fecha: nunca se guarda, así no queda desactualizado. */
export function displayStatus(status: RequestStatus, dueDate: string | null, today: string): RequestStatus | "expired" {
  if ((status === "pending" || status === "partially_paid") && dueDate && dueDate < today) return "expired";
  return status;
}

/** Pesos (decimal de Mercado Pago) a centavos, sin errores de punto flotante. */
export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** Para mensajes de error: 150000 centavos -> "$ 1.500". */
export const formatArs = (cents: number) => ars.format(cents / 100).replace(/\s/g, "\u00a0"); // sin espacio cortable: "$ 6.000" no se parte en dos renglones

/**
 * Cuánto se puede pedir todavía de un presupuesto: su saldo menos lo ya pedido y aún sin pagar.
 * Los cobros vencidos o cancelados no cuentan: ya no se pueden pagar.
 */
export function requestableCents(balanceCents: number, requests: { display_status: string; pending_cents: number }[]): number {
  const committed = requests
    .filter((r) => r.display_status === "pending" || r.display_status === "partially_paid")
    .reduce((sum, r) => sum + r.pending_cents, 0);
  return Math.max(0, balanceCents - committed);
}

// ------------------------------------------------------------------------------------------------ modelo único
// Estados y reglas del dinero: viven acá y solo acá. El frontend muestra lo que devuelve el backend.
//
//   Presupuesto:  Enviado (sin pagos) → En curso (con pagos y saldo) → Completado (saldo 0).  Cancelado es manual.
//   Cobro:        Pendiente → Pagado | Cancelado; "Vencido" se deduce de la fecha.
//   Pago:         solo se guardan los aprobados (y después, anulados o reembolsados); un pago pendiente o rechazado no es dinero.
//
// El presupuesto "se acepta" cuando entra su primer pago: no hay un estado de aceptación aparte.

export type BudgetStatus = "sent" | "in_progress" | "completed" | "cancelled";
export type PaymentKind = "advance" | "partial" | "final";

/** Estado que le corresponde a un presupuesto según lo ya aplicado. Cancelado no cambia solo. */
export function deriveBudgetStatus(current: string, totalCents: number, appliedCents: number): BudgetStatus {
  if (current === "cancelled") return "cancelled";
  if (totalCents > 0 && appliedCents >= totalCents) return "completed";
  return appliedCents > 0 ? "in_progress" : "sent";
}

/** Estados a los que se puede pasar a mano. "En curso" y "Completado" los asigna el sistema según los pagos. */
export const MANUAL_TRANSITIONS: Record<BudgetStatus, BudgetStatus[]> = {
  sent: ["cancelled"],
  in_progress: ["cancelled"],
  completed: [],
  cancelled: ["sent"],
};

export const BUDGET_STATUS_NAME: Record<BudgetStatus, string> = { sent: "Enviado", in_progress: "En curso", completed: "Completado", cancelled: "Cancelado" };

/** Porcentaje pagado (0 a 100, entero hacia abajo: 100 solo si está todo cobrado). */
export const paidPercent = (totalCents: number, appliedCents: number): number =>
  totalCents <= 0 ? 0 : Math.min(100, Math.floor((appliedCents * 100) / totalCents));

const KIND_LABEL: Record<PaymentKind, string> = { advance: "Anticipo", partial: "Pago parcial", final: "Pago final" };

interface Treated { applied_cents: number; balance_cents: number; has_advance: boolean; first_item: string | null; item_count: number }

/**
 * Tipo y texto de un cobro o pago. Lo decide el sistema, no quien lo pide:
 * el que cubre todo lo que falta es el pago final (o "Pago total" si es el primero), el primero es el anticipo
 * (una sola vez por presupuesto) y el resto, pagos parciales. El texto nombra el tratamiento.
 */
export function describePayment(amountCents: number, b: Treated): { kind: PaymentKind; concept: string } {
  const first = b.applied_cents === 0 && !b.has_advance;
  const coversAll = amountCents >= b.balance_cents;
  const kind: PaymentKind = coversAll ? "final" : first ? "advance" : "partial";
  const base = coversAll && first ? "Pago total" : KIND_LABEL[kind];
  const name = b.first_item?.trim().slice(0, 60);
  const more = b.item_count > 1 ? ` y ${b.item_count - 1} más` : "";
  return { kind, concept: name ? `${base} · ${name}${more}` : base };
}
