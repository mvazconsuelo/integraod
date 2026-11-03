import type { Env } from "../shared/env";
import type { Client } from "./client";

/** Credenciales de un proveedor, ya descifradas (el cifrado es asunto de la infraestructura). */
export interface ProviderConnection { accountId: string; accessToken: string; refreshToken: string; expiresAt: string }

/** Dónde se guardan las conexiones a proveedores (de UN cliente: cada app conecta su propia cuenta). */
export interface ConnectionStore {
  get(provider: string): Promise<ProviderConnection | null>;
  has(provider: string): Promise<boolean>;
  save(provider: string, connection: ProviderConnection): Promise<void>;
  remove(provider: string): Promise<void>;
}

export interface ProviderContext { env: Env; client: Client; connections: ConnectionStore; fetchImpl: typeof fetch }

/** Lo único que el resto del servicio necesita saber de un pago de cualquier proveedor. */
export interface PaymentFacts {
  providerPaymentId: string;
  status: "approved" | "pending" | "rejected" | "refunded" | "chargeback" | "other";
  amountCents: number;
  currency: string;
  externalReference: string | null;
  approvedAt: string | null;
  /** Lo que le queda al negocio después de la comisión del proveedor (null si todavía no lo informa). */
  netCents?: number | null;
}

export interface CheckoutRequest {
  intentId: string; publicId: string; externalReference: string; title: string; amountCents: number; currency: string; dueDate: string | null;
}

export interface WebhookInput { headers: Headers; query: URLSearchParams; rawBody: string }
export type WebhookCheck = { ok: true; paymentId: string } | { ok: true; ignore: true } | { ok: false; status: 400 | 401 };

/**
 * Contrato de un proveedor de pagos. Para sumar uno nuevo (Mobbex, Ualá Bis, Stripe…) se escribe un adaptador
 * en infrastructure/providers/ que cumpla esto y se agrega al registro: el resto del servicio no cambia.
 */
export interface PaymentProvider {
  id: string;
  label: string;
  /** "online": cobra con un link. "test": solo para pruebas. */
  kind: "online" | "test";
  /** Dominios permitidos para el link de pago. Si el proveedor devolviera otro, se rechaza (defensa contra links falsos). */
  isAllowedCheckoutUrl(url: string): boolean;
  isConnected(ctx: ProviderContext): Promise<boolean>;
  createCheckout(ctx: ProviderContext, req: CheckoutRequest): Promise<{ providerRef: string; checkoutUrl: string }>;

  // Notificaciones: se verifica la autenticidad y se consulta el pago real al proveedor (nunca se confía en el aviso).
  verifyWebhook?(ctx: ProviderContext, input: WebhookInput): Promise<WebhookCheck>;
  fetchPayment?(ctx: ProviderContext, providerPaymentId: string): Promise<PaymentFacts>;

  // Conexión de la cuenta del consultorio (OAuth u otro mecanismo)
  connectUrl?(ctx: ProviderContext): Promise<string>;
  /** Vuelta de la autorización: de qué cliente es (lo dice el `state` firmado). null si no es válido. */
  oauthClientId?(env: Env, params: URLSearchParams): Promise<string | null>;
  completeConnection?(ctx: ProviderContext, params: URLSearchParams): Promise<void>;
  disconnect?(ctx: ProviderContext): Promise<void>;
}

export interface ProviderRegistry {
  get(id: string): PaymentProvider;
  list(): PaymentProvider[];
  /** Proveedor con el que se crea un cobro nuevo: el simulado en el piloto; si no, el primero online que esté conectado. */
  defaultFor(ctx: ProviderContext): Promise<PaymentProvider | null>;
}
