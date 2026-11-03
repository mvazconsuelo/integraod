import { AppError } from "../shared/errors";
import { logger } from "../shared/logger";
import type { CreateIntentInput, IntentRow } from "../domain/payment.types";
import { providerContext, type Deps } from "./ports";

/** Crea un cobro y, si hay proveedor, su link de pago. Si el proveedor falla o devuelve un link ajeno, no se guarda nada. */
export async function createIntent(deps: Deps, input: CreateIntentInput, actor = "core"): Promise<IntentRow> {
  const ctx = providerContext(deps);
  const id = deps.ids.uuid(), publicId = deps.ids.token(), externalReference = `int_${id}`;
  const currency = input.currency ?? "ARS";

  // En efectivo no hay proveedor ni link. Sin proveedor conectado el cobro online igual se crea: se puede cobrar a mano.
  const isCash = input.method === "cash";
  const provider = isCash ? null : await deps.providers.defaultFor(ctx);
  let providerRef: string | null = null, checkoutUrl: string | null = null;
  if (provider) {
    const r = await provider.createCheckout(ctx, { intentId: id, publicId, externalReference, title: input.description, amountCents: input.amountCents, currency, dueDate: input.dueDate });
    // Defensa contra links falsos: el destino de pago tiene que ser del proveedor.
    if (!provider.isAllowedCheckoutUrl(r.checkoutUrl)) {
      logger.error("checkout_url_rejected", { provider: provider.id });
      throw new AppError(502, "El proveedor devolvió un link de pago que no corresponde.", "bad_checkout_url");
    }
    providerRef = r.providerRef;
    checkoutUrl = r.checkoutUrl;
  }

  await deps.uow.commit(
    [deps.intents.insert({
      id, public_id: publicId, reference: input.reference, external_reference: externalReference, provider: isCash ? "cash" : (provider?.id ?? "none"), provider_ref: providerRef,
      checkout_url: checkoutUrl, description: input.description, payer_label: input.payerLabel, amount_cents: input.amountCents, currency, kind: input.kind,
      due_date: input.dueDate, created_at: deps.clock.now(),
    })],
    [{ type: "intent.created", entity: "intent", id }],
  );
  await deps.audit.record({ actor, action: "intent.created", entity: "intent", entityId: id, detail: { amount_cents: input.amountCents, kind: input.kind, provider: isCash ? "cash" : (provider?.id ?? "none"), reference: input.reference } });
  return (await deps.intents.byId(id))!;
}
