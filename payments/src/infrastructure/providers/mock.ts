import type { PaymentProvider } from "../../domain/payment-provider.interface";

/** Comisión que simula el piloto (en puntos base: 600 = 6%). Sirve para ver cómo se muestran las comisiones; no es la tarifa real. */
export const MOCK_FEE_BPS = 600;

/** Checkout simulado para el piloto: no mueve dinero. Solo existe con MP_MOCK=true. */
export const mockProvider: PaymentProvider = {
  id: "mock",
  label: "Simulado (piloto)",
  kind: "test",
  isAllowedCheckoutUrl: (url) => /^\/mock-checkout\/[A-Za-z0-9_-]{16,}$/.test(url),
  isConnected: async ({ env }) => env.MP_MOCK === "true",
  createCheckout: async (_ctx, req) => ({ providerRef: "mock", checkoutUrl: `/mock-checkout/${req.publicId}` }),
};
