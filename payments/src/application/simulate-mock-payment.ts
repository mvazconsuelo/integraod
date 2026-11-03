import { AppError } from "../shared/errors";
import type { Deps } from "./ports";
import { MOCK_FEE_BPS } from "../infrastructure/providers/mock";
import { reconcileProviderPayment } from "./reconcile-provider-payment";

/** Checkout simulado: arma un pago como el que devolvería un proveedor y lo procesa por el mismo camino que un aviso real. */
export async function simulateMockPayment(deps: Deps, publicId: string, outcome: "approved" | "rejected" | "pending") {
  if (deps.env.MP_MOCK !== "true") throw new AppError(404, "No encontramos esa página.");
  const intent = await deps.intents.byPublicId(publicId);
  if (!intent) throw new AppError(404, "Este link de pago no existe o ya no está disponible.");
  if (intent.provider === "cash") throw new AppError(409, "Este cobro se paga en efectivo: no tiene pago online.");
  if (intent.status === "cancelled") throw new AppError(409, "Este cobro fue cancelado.");
  if (intent.status === "paid") throw new AppError(409, "Este cobro ya fue pagado.");
  if (intent.due_date && intent.due_date < deps.clock.todayAR()) throw new AppError(409, "Este cobro venció.");

  const result = await reconcileProviderPayment(deps, "mock", {
    providerPaymentId: `mock_${deps.ids.uuid()}`,
    status: outcome === "approved" ? "approved" : outcome === "pending" ? "pending" : "rejected",
    amountCents: intent.amount_cents, currency: intent.currency, externalReference: intent.external_reference,
    approvedAt: outcome === "approved" ? deps.clock.now() : null,
    netCents: intent.amount_cents - Math.round((intent.amount_cents * MOCK_FEE_BPS) / 10_000),
  });
  await deps.providerLog.log("mock", result.payment?.provider_payment_id ?? null, result.outcome, "simulado");
  return { outcome, result: result.outcome, intent: (await deps.intents.byId(intent.id))!, payment: result.payment ?? null };
}
