import type { Budget } from "@/types";

/**
 * Los presupuestos vivos repartidos en grupos que no se pisan (cada uno está en uno solo).
 * La situación de cada presupuesto la decide el servidor, con una prioridad fija; acá solo se cuentan.
 *  - Necesitan atención: un pedido de pago venció.
 *  - Esperando pago: hay un pedido de pago vigente, o el cliente aceptó y todavía no pagó.
 *  - En curso: ya hay pagos y falta cobrar.
 *  - Por responder: se compartió y el cliente no contestó.
 * Los que solo se crearon (sin compartir), los completados, rechazados y cancelados no están en estos grupos,
 * pero siguen en la lista general de presupuestos.
 */
export interface WorkGroups { attention: string[]; awaitingPayment: string[]; inProgress: string[]; toAnswer: string[] }
export type WorkGroup = keyof WorkGroups;

export function groupWorks(budgets: Pick<Budget, "id" | "situation">[]): WorkGroups {
  const ids = (s: Budget["situation"]) => budgets.filter((b) => b.situation === s).map((b) => b.id);
  return { attention: ids("attention"), awaitingPayment: ids("awaiting_payment"), inProgress: ids("in_progress"), toAnswer: ids("to_answer") };
}
