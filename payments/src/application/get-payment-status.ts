import { AppError } from "../shared/errors";
import type { Deps } from "./ports";

/** Estado actual de un cobro con sus pagos. */
export async function getIntentStatus(deps: Deps, id: string) {
  const intent = await deps.intents.byId(id);
  if (!intent) throw new AppError(404, "No encontramos ese cobro.");
  return { intent, payments: await deps.payments.ofIntent(intent.id) };
}

/** Estado actual de un pago, con su cobro si lo tiene. */
export async function getPaymentStatus(deps: Deps, id: string) {
  const payment = await deps.payments.byId(id);
  if (!payment) throw new AppError(404, "No encontramos ese pago.");
  return { payment, intent: payment.intent_id ? await deps.intents.byId(payment.intent_id) : null };
}
