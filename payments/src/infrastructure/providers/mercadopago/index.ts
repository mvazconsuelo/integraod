import type { PaymentFacts, PaymentProvider, ProviderContext } from "../../../domain/payment-provider.interface";
import { AppError } from "../../../shared/errors";
import { logger } from "../../../shared/logger";
import { CLIENT_ID } from "../../../domain/client";
import type { Env } from "../../../shared/env";
import { hmacHex, timingSafeEqual } from "../../../shared/security/crypto";
import { verifyMpSignature } from "./signature";

const MP_API = "https://api.mercadopago.com";
const PROVIDER = "mercadopago";

interface OAuthToken { access_token: string; refresh_token: string; user_id: number; expires_in: number }

const callback = (ctx: ProviderContext) => `${ctx.env.PUBLIC_BASE_URL}/oauth/mercadopago/callback`;

/**
 * `state` de la autorización: aleatorio + instante + cliente, todo firmado. Al volver, el cliente sale de acá
 * (la dirección de retorno es una sola para toda la plataforma) y nadie puede conectar su cuenta a otro cliente.
 */
const signState = async (env: Env, clientId: string) => {
  const payload = `${crypto.randomUUID()}.${Date.now()}.${clientId}`;
  return `${payload}.${await hmacHex(payload, env.MP_CLIENT_SECRET ?? "")}`;
};

async function readState(env: Env, state: string): Promise<string | null> {
  const i = state.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = state.slice(0, i), [, ts, clientId] = payload.split(".");
  const valid = Number(ts) && Date.now() - Number(ts) < 15 * 60_000 && CLIENT_ID.test(clientId ?? "") && timingSafeEqual(state.slice(i + 1), await hmacHex(payload, env.MP_CLIENT_SECRET ?? ""));
  return valid ? clientId : null;
}

async function oauth(ctx: ProviderContext, body: Record<string, string>): Promise<OAuthToken> {
  const res = await ctx.fetchImpl(`${MP_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: ctx.env.MP_CLIENT_ID, client_secret: ctx.env.MP_CLIENT_SECRET, ...body }),
  });
  if (!res.ok) {
    logger.error("mercadopago_oauth_error", { status: res.status });
    throw new AppError(res.status >= 500 ? 502 : 400, "No pudimos conectar con Mercado Pago.", "provider_reauth");
  }
  return res.json() as Promise<OAuthToken>;
}

const toConnection = (t: OAuthToken) => ({ accountId: String(t.user_id), accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() });

/** Access token vigente; si vence en menos de 10 minutos lo renueva. Las credenciales no salen de este servicio. */
async function accessToken(ctx: ProviderContext): Promise<string | null> {
  const c = await ctx.connections.get(PROVIDER);
  if (!c) return null;
  if (Date.parse(c.expiresAt) - Date.now() > 10 * 60_000) return c.accessToken;
  try {
    const fresh = await oauth(ctx, { grant_type: "refresh_token", refresh_token: c.refreshToken });
    await ctx.connections.save(PROVIDER, toConnection(fresh));
    return fresh.access_token;
  } catch (e) {
    if (e instanceof AppError && e.code === "provider_reauth") await ctx.connections.remove(PROVIDER); // el cliente revocó el acceso
    throw e;
  }
}

async function api<T>(ctx: ProviderContext, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await ctx.fetchImpl(`${MP_API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers } });
  if (!res.ok) {
    logger.error("mercadopago_error", { status: res.status, path: path.split("?")[0] });
    throw new AppError(502, "Mercado Pago no respondió como esperábamos.", "provider_error");
  }
  return res.json() as Promise<T>;
}

/**
 * Lo que le queda al negocio: Mercado Pago lo informa como `transaction_details.net_received_amount`; si no viene,
 * se resta del total la suma de sus comisiones (`fee_details` a cargo del vendedor). null si no hay ninguno de los dos.
 */
function netReceived(amountCents: number, p: { fee_details?: { amount?: number; fee_payer?: string }[]; transaction_details?: { net_received_amount?: number } }): number | null {
  const net = p.transaction_details?.net_received_amount;
  if (typeof net === "number" && net > 0) return Math.round(net * 100);
  const fees = (p.fee_details ?? []).filter((f) => (f.fee_payer ?? "collector") === "collector" && typeof f.amount === "number");
  return fees.length > 0 ? amountCents - fees.reduce((sum, f) => sum + Math.round((f.amount ?? 0) * 100), 0) : null;
}

const STATUS: Record<string, PaymentFacts["status"]> = { approved: "approved", pending: "pending", in_process: "pending", rejected: "rejected", cancelled: "rejected", refunded: "refunded", charged_back: "chargeback" };

export const mercadopago: PaymentProvider = {
  id: PROVIDER,
  label: "Mercado Pago",
  kind: "online",
  // Solo dominios de Mercado Pago (incluye sandbox). Cualquier otro destino se rechaza.
  isAllowedCheckoutUrl: (url) => /^https:\/\/([a-z0-9-]+\.)*mercadopago\.(com(\.[a-z]{2})?|cl)\//.test(url),
  isConnected: (ctx) => ctx.connections.has(PROVIDER),

  async createCheckout(ctx, r) {
    const token = await accessToken(ctx);
    if (!token) throw new AppError(409, "Mercado Pago no está conectado.", "provider_not_connected");
    const back = `${ctx.client.appUrl}/pay/${r.publicId}`;
    const pref = await api<{ id: string; init_point: string }>(ctx, token, "/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: r.intentId, title: r.title.slice(0, 250), quantity: 1, currency_id: r.currency, unit_price: r.amountCents / 100 }],
        external_reference: r.externalReference,
        notification_url: `${ctx.env.PUBLIC_BASE_URL}/webhooks/${PROVIDER}/${ctx.client.id}`,
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
        ...(r.dueDate ? { expires: true, expiration_date_to: `${r.dueDate}T23:59:59.000-03:00` } : {}),
      }),
    });
    return { providerRef: pref.id, checkoutUrl: pref.init_point };
  },

  async verifyWebhook(ctx, { headers, query, rawBody }) {
    let body: { type?: string; data?: { id?: string | number } } = {};
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { return { ok: false, status: 400 }; }
    const dataId = query.get("data.id") ?? (body.data?.id !== undefined ? String(body.data.id) : undefined);
    const valid = await verifyMpSignature({ signatureHeader: headers.get("x-signature"), requestId: headers.get("x-request-id"), dataId, secret: ctx.env.MP_WEBHOOK_SECRET });
    if (!valid) return { ok: false, status: 401 };
    const topic = body.type ?? query.get("type");
    if (topic !== "payment" || !dataId) return { ok: true, ignore: true };
    return { ok: true, paymentId: dataId };
  },

  // Fuente de verdad: el estado del pago siempre se consulta a la API, nunca al aviso ni al navegador.
  async fetchPayment(ctx, id) {
    const token = await accessToken(ctx);
    if (!token) throw new AppError(409, "Mercado Pago no está conectado.", "provider_not_connected");
    const p = await api<{ id: number; status: string; transaction_amount: number; currency_id: string; external_reference: string | null; date_approved: string | null; fee_details?: { amount?: number; fee_payer?: string }[]; transaction_details?: { net_received_amount?: number } }>(ctx, token, `/v1/payments/${encodeURIComponent(id)}`);
    const amountCents = Math.round(p.transaction_amount * 100);
    return {
      providerPaymentId: String(p.id),
      status: STATUS[p.status] ?? "other",
      amountCents,
      currency: p.currency_id,
      externalReference: p.external_reference,
      approvedAt: p.date_approved ? new Date(p.date_approved).toISOString() : null,
      netCents: netReceived(amountCents, p),
    };
  },

  async connectUrl(ctx) {
    const q = new URLSearchParams({ client_id: ctx.env.MP_CLIENT_ID ?? "", response_type: "code", platform_id: "mp", state: await signState(ctx.env, ctx.client.id), redirect_uri: callback(ctx) });
    return `https://auth.mercadopago.com.ar/authorization?${q}`;
  },

  oauthClientId: (env, params) => readState(env, params.get("state") ?? ""),

  async completeConnection(ctx, params) {
    const code = params.get("code");
    // El state tiene que ser válido Y de este cliente.
    if (!code || (await readState(ctx.env, params.get("state") ?? "")) !== ctx.client.id) throw new AppError(400, "La conexión no es válida o venció.", "bad_state");
    await ctx.connections.save(PROVIDER, toConnection(await oauth(ctx, { grant_type: "authorization_code", code, redirect_uri: callback(ctx) })));
  },

  disconnect: (ctx) => ctx.connections.remove(PROVIDER),
};
