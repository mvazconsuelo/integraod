import type { Budget, PaymentRequest } from "@/types";

/**
 * Los presupuestos vivos repartidos en tres grupos que no se pisan (un presupuesto está en uno solo):
 *  - Necesitan atención: tienen un pedido de pago vencido (hay que pedirlo de nuevo o registrar el pago).
 *  - En curso: ya recibieron algún pago y todavía falta.
 *  - Por responder: presupuestos sin pagos y sin ningún pedido de pago abierto (esperan la respuesta del cliente).
 * Un pedido de pago abierto no hace que un presupuesto "espere respuesta": ya se pidió el pago.
 * Solo agrupa con los estados que informa el servidor; no calcula importes.
 */
export interface WorkGroups { attention: string[]; inProgress: string[]; toAnswer: string[] }
export type WorkGroup = keyof WorkGroups;

const OPEN = ["pending", "partially_paid"];

export function groupWorks(budgets: Pick<Budget, "id" | "status">[], requests: Pick<PaymentRequest, "budget_id" | "display_status">[]): WorkGroups {
  const expired = new Set(requests.filter((r) => r.budget_id && r.display_status === "expired").map((r) => r.budget_id as string));
  const open = new Set(requests.filter((r) => r.budget_id && OPEN.includes(r.display_status)).map((r) => r.budget_id as string));
  const live = budgets.filter((b) => b.status === "sent" || b.status === "in_progress");
  const rest = live.filter((b) => !expired.has(b.id));
  return {
    attention: live.filter((b) => expired.has(b.id)).map((b) => b.id),
    inProgress: rest.filter((b) => b.status === "in_progress").map((b) => b.id),
    toAnswer: rest.filter((b) => b.status === "sent" && !open.has(b.id)).map((b) => b.id),
  };
}
