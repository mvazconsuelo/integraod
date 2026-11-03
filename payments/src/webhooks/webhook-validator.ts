import type { PaymentProvider, WebhookCheck } from "../domain/payment-provider.interface";
import { providerContext, type Deps } from "../application/ports";

export const MAX_BODY = 100_000;

/** Paso 1: verificar que el aviso viene del proveedor (firma). Nada del contenido se usa antes de esto. */
export async function validateWebhook(deps: Deps, provider: PaymentProvider, req: { headers: Headers; query: URLSearchParams; rawBody: string }): Promise<WebhookCheck> {
  if (!provider.verifyWebhook) return { ok: false, status: 400 };
  return provider.verifyWebhook(providerContext(deps), req);
}
