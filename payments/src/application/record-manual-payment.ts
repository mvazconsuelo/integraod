import { AppError } from "../shared/errors";
import type { DomainEvent, ManualPaymentInput, PaymentRow } from "../domain/payment.types";
import type { Deps } from "./ports";

/** Pago registrado a mano (efectivo). La clave de idempotencia evita duplicarlo si el pedido se repite. */
export async function recordManualPayment(deps: Deps, input: ManualPaymentInput, actor = "core"): Promise<PaymentRow> {
  const existing = await deps.payments.byIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;

  if (input.intentId) {
    const intent = await deps.intents.byId(input.intentId);
    if (!intent) throw new AppError(404, "No encontramos el cobro elegido.");
    if (intent.status === "cancelled") throw new AppError(409, "Ese cobro está cancelado.");
    if (intent.reference !== input.reference) throw new AppError(422, "Ese cobro pertenece a otro presupuesto.", "reference_mismatch");
  }

  const id = deps.ids.uuid();
  const now = deps.clock.now();
  const events: DomainEvent[] = [{ type: "payment.approved", entity: "payment", id }];
  const writes = [deps.payments.insert({
    id, intent_id: input.intentId, reference: input.reference, provider: "manual", provider_payment_id: null, idempotency_key: input.idempotencyKey,
    method: input.method, source: "manual", kind: input.kind, amount_cents: input.amountCents, currency: "ARS",
    paid_at: input.paidAt ?? now, payer_label: input.payerLabel, concept: input.concept, notes: input.notes, created_at: now,
    fee_cents: null, net_cents: null, // en mano no hay comisión
  })];
  if (input.intentId) { writes.push(deps.intents.syncStatus(input.intentId)); events.push({ type: "intent.updated", entity: "intent", id: input.intentId }); }

  await deps.uow.commit(writes, events);
  await deps.audit.record({ actor, action: "payment.manual_recorded", entity: "payment", entityId: id, detail: { amount_cents: input.amountCents, method: input.method, reference: input.reference } });
  return (await deps.payments.byId(id))!;
}
