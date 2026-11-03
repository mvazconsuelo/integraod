import type { DomainEvent, PaymentRow } from "../domain/payment.types";
import type { Deps } from "./ports";

/** Anula o reembolsa un pago: no se borra, queda con su motivo y se avisa a la app. Devuelve false si ya estaba anulado. */
export async function reversePayment(deps: Deps, p: PaymentRow, status: "refunded" | "voided", reason: string, actor: string): Promise<boolean> {
  const writes = [deps.payments.reverse(p.id, status, reason, deps.clock.now())];
  const events: DomainEvent[] = [{ type: "payment.reversed", entity: "payment", id: p.id }];
  if (p.intent_id) { writes.push(deps.intents.syncStatus(p.intent_id)); events.push({ type: "intent.updated", entity: "intent", id: p.intent_id }); }
  const [first] = await deps.uow.commit(writes, events);
  const changed = first.changes > 0;
  if (changed) await deps.audit.record({ actor, action: `payment.${status}`, entity: "payment", entityId: p.id, detail: { reason, amount_cents: p.amount_cents } });
  return changed;
}
