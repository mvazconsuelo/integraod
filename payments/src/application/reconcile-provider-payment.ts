import type { PaymentFacts } from "../domain/payment-provider.interface";
import type { Outcome, PaymentRow } from "../domain/payment.types";
import type { Deps } from "./ports";
import { reversePayment } from "./reverse-payment";

export interface ReconcileResult { outcome: Outcome; detail: string; payment?: PaymentRow }

async function flagForReview(deps: Deps, providerId: string, f: PaymentFacts, reason: string) {
  await deps.review.flag({ provider: providerId, providerPaymentId: f.providerPaymentId, reason, amountCents: f.amountCents, currency: f.currency, externalReference: f.externalReference }, deps.clock.now());
  await deps.audit.record({ actor: `provider:${providerId}`, action: "payment.flagged_for_review", entity: "provider_payment", entityId: f.providerPaymentId, detail: { reason, amount_cents: f.amountCents } });
}

/**
 * Procesa un pago YA consultado al proveedor (nunca datos del navegador ni del aviso).
 * Idempotente: repetir el mismo pago no duplica dinero. Lo que no coincide NO se descarta: va a revisión.
 */
export async function reconcileProviderPayment(deps: Deps, providerId: string, f: PaymentFacts): Promise<ReconcileResult> {
  const existing = await deps.payments.byProviderPayment(providerId, f.providerPaymentId);
  const actor = `provider:${providerId}`;

  if (f.status === "refunded" || f.status === "chargeback") {
    if (existing && existing.status === "approved") {
      await reversePayment(deps, existing, "refunded", f.status === "refunded" ? "Reembolsado en el proveedor" : "Contracargo en el proveedor", actor);
      return { outcome: "refunded", detail: f.status, payment: (await deps.payments.byId(existing.id))! };
    }
    return { outcome: "ignored", detail: `estado ${f.status} sin pago previo` };
  }
  if (f.status !== "approved") return { outcome: "ignored", detail: `estado ${f.status}` };
  if (existing) return { outcome: "duplicate", detail: "ya registrado", payment: existing };

  const intent = f.externalReference ? await deps.intents.byExternalReference(f.externalReference) : null;
  if (!intent) { await flagForReview(deps, providerId, f, "El pago no corresponde a ningún cobro (referencia desconocida)."); return { outcome: "rejected", detail: "referencia desconocida" }; }
  if (f.currency !== intent.currency) { await flagForReview(deps, providerId, f, "El pago llegó en otra moneda."); return { outcome: "rejected", detail: "moneda distinta" }; }
  if (f.amountCents !== intent.amount_cents) { await flagForReview(deps, providerId, f, "El importe pagado no coincide con el solicitado."); return { outcome: "rejected", detail: "importe distinto al solicitado" }; }

  const id = deps.ids.uuid();
  const [ins] = await deps.uow.commit(
    [
      deps.payments.insert({
        id, intent_id: intent.id, reference: intent.reference, provider: providerId, provider_payment_id: f.providerPaymentId, idempotency_key: null,
        method: providerId === "mock" ? "mercadopago" : providerId, source: "provider", kind: intent.kind, amount_cents: intent.amount_cents, currency: intent.currency,
        paid_at: f.approvedAt ?? deps.clock.now(), payer_label: intent.payer_label, concept: intent.description, notes: "", created_at: deps.clock.now(),
        // Comisión = lo que pagó la persona menos lo que le queda al negocio (si el proveedor ya lo informó).
        fee_cents: f.netCents != null && f.netCents <= intent.amount_cents ? intent.amount_cents - f.netCents : null,
        net_cents: f.netCents != null && f.netCents <= intent.amount_cents ? f.netCents : null,
      }),
      deps.intents.syncStatus(intent.id),
    ],
    [{ type: "payment.approved", entity: "payment", id }, { type: "intent.updated", entity: "intent", id: intent.id }],
  );
  if (ins.changes === 0) return { outcome: "duplicate", detail: "ya registrado (concurrente)" };
  await deps.audit.record({ actor, action: "payment.provider_confirmed", entity: "payment", entityId: id, detail: { provider_payment_id: f.providerPaymentId, amount_cents: f.amountCents, intent_id: intent.id } });
  return { outcome: "registered", detail: "ok", payment: (await deps.payments.byId(id))! };
}
