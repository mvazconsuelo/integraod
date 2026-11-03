import type { PaymentProvider } from "../domain/payment-provider.interface";
import { providerContext, type Deps } from "../application/ports";
import { reconcileProviderPayment } from "../application/reconcile-provider-payment";

/**
 * Pasos 2 y 3: se consulta el pago real a la API del proveedor (no se confía en el aviso) y se concilia:
 * importe, moneda y referencia tienen que coincidir con el cobro. Es idempotente, así que el proveedor puede reintentar.
 */
export async function processWebhook(deps: Deps, provider: PaymentProvider, paymentId: string) {
  const facts = await provider.fetchPayment!(providerContext(deps), paymentId);
  const result = await reconcileProviderPayment(deps, provider.id, facts);
  await deps.providerLog.log(provider.id, paymentId, result.outcome, result.detail);
  return result;
}
