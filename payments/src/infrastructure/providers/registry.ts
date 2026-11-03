import type { PaymentProvider, ProviderContext, ProviderRegistry } from "../../domain/payment-provider.interface";
import { AppError } from "../../shared/errors";
import { mercadopago } from "./mercadopago";
import { mockProvider } from "./mock";

/**
 * Para sumar un proveedor nuevo (Mobbex, Ualá Bis, Stripe…): crear su adaptador en esta carpeta que cumpla
 * `PaymentProvider` y agregarlo a la lista. Nada más del servicio cambia.
 */
const PROVIDERS: PaymentProvider[] = [mercadopago, mockProvider];

export class StaticProviderRegistry implements ProviderRegistry {
  list = () => PROVIDERS;

  get(id: string): PaymentProvider {
    const p = PROVIDERS.find((x) => x.id === id);
    if (!p) throw new AppError(404, "Proveedor de pagos desconocido.", "unknown_provider");
    return p;
  }

  async defaultFor(ctx: ProviderContext): Promise<PaymentProvider | null> {
    if (ctx.env.MP_MOCK === "true") return mockProvider;
    for (const p of PROVIDERS.filter((x) => x.kind === "online")) if (await p.isConnected(ctx)) return p;
    return null;
  }
}
