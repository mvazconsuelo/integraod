import { AppError } from "../../utils/errors";
import type { Env } from "../../types/env";
import { signRequest } from "./signing";
import type { IntentSnapshot, Kind, PaymentSnapshot, ProviderStatus, ReviewItem } from "./types";

/**
 * Único punto por el que esta app habla con el servicio de pagos. Todo pedido va firmado y con límite de tiempo.
 * La app nunca ve credenciales de proveedores: solo pide operaciones y recibe el estado resultante.
 */
export class PaymentsClient {
  constructor(private env: Env) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const headers = await signRequest({ clientId: this.env.PAYMENTS_CLIENT_ID, secret: this.env.SVC_SECRET_CORE, method, path, body: raw });
    const init: RequestInit = { method, headers: { ...headers, "content-type": "application/json" }, body: raw || undefined, signal: AbortSignal.timeout(10_000) };

    let res: Response;
    try {
      res = this.env.PAYMENTS_URL ? await fetch(`${this.env.PAYMENTS_URL}${path}`, init) : await this.env.PAYMENTS!.fetch(`https://payments.internal${path}`, init);
    } catch {
      throw new AppError(502, "El servicio de pagos no está disponible. Intentá de nuevo en un momento.", "payments_unavailable");
    }
    const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (res.ok) return data as T;

    // Los errores de reglas (400/404/409/422) llegan con un mensaje pensado para la persona; el resto se ve como falla del servicio.
    if ([400, 404, 409, 422].includes(res.status)) throw new AppError(res.status as 400 | 404 | 409 | 422, data?.error ?? "No se pudo completar la operación.", data?.code ?? "error");
    console.error("payments_service_error", res.status, data?.code ?? "");
    throw new AppError(502, "El servicio de pagos no respondió como esperábamos.", "payments_error");
  }

  providers = () => this.call<ProviderStatus[]>("GET", "/v1/providers");
  connect = (provider: string) => this.call<{ url: string }>("POST", `/v1/providers/${encodeURIComponent(provider)}/connect`, {});
  disconnect = (provider: string) => this.call<{ ok: true }>("POST", `/v1/providers/${encodeURIComponent(provider)}/disconnect`, {});

  createIntent = (i: { method: "online" | "cash"; reference: string; description: string; payerLabel: string; amountCents: number; kind: Kind; dueDate: string | null }) =>
    this.call<{ intent: IntentSnapshot }>("POST", "/v1/intents", i);
  getIntent = (id: string) => this.call<{ intent: IntentSnapshot; payments: PaymentSnapshot[] }>("GET", `/v1/intents/${encodeURIComponent(id)}`);
  cancelIntent = (id: string) => this.call<{ intent: IntentSnapshot }>("POST", `/v1/intents/${encodeURIComponent(id)}/cancel`, {});

  recordManualPayment = (p: { idempotencyKey: string; intentId: string | null; reference: string; payerLabel: string; concept: string; amountCents: number; method: "cash" | "transfer"; kind: Kind; paidAt?: string; notes: string }) =>
    this.call<{ payment: PaymentSnapshot; intent: IntentSnapshot | null }>("POST", "/v1/payments/manual", p);
  getPayment = (id: string) => this.call<{ payment: PaymentSnapshot; intent: IntentSnapshot | null }>("GET", `/v1/payments/${encodeURIComponent(id)}`);
  voidPayment = (id: string, reason: string) => this.call<{ payment: PaymentSnapshot; intent: IntentSnapshot | null }>("POST", `/v1/payments/${encodeURIComponent(id)}/void`, { reason });

  mockPay = (publicId: string, outcome: "approved" | "rejected" | "pending") =>
    this.call<{ outcome: string; result: string; intent: IntentSnapshot; payment: PaymentSnapshot | null }>("POST", `/v1/mock/${encodeURIComponent(publicId)}/pay`, { outcome });

  review = () => this.call<ReviewItem[]>("GET", "/v1/review");
  dismissReview = (id: string, reason: string) => this.call<{ ok: true }>("POST", `/v1/review/${encodeURIComponent(id)}/dismiss`, { reason });
}
