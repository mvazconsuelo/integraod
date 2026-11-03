import { createTestDb } from "./d1";
import { app } from "../../src/app";
import { hmacHex } from "../../src/shared/security/crypto";
import { encrypt } from "../../src/infrastructure/encryption/aes-gcm";
import { signRequest } from "../../src/shared/security/signing";
import type { Env } from "../../src/shared/env";

export const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
export const SECRETS = { core: "core-secret-1", events: "events-secret-1", mpWebhook: "mp-whsec" };
/** Cliente por defecto de los tests (la app "core.test"). */
export const CLIENT = "test-clinic";

interface ClientSeed { id: string; secret: string; eventsSecret: string; host: string }
const insertClient = (db: D1Database, c: ClientSeed, enc: { secret: string; events: string }) =>
  db.prepare("INSERT INTO clients (id, name, secret_enc, events_url, events_secret_enc, app_url, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(c.id, `App ${c.id}`, enc.secret, `https://${c.host}/api/internal/payment-events`, enc.events, `https://${c.host}`, new Date().toISOString()).run();

// El cliente por defecto se siembra de forma síncrona (cifrado una sola vez al cargar el módulo).
const DEFAULT_ENC = { secret: await encrypt(SECRETS.core, KEY), events: await encrypt(SECRETS.events, KEY) };

/** Suma otro cliente al servicio (otra app: peluquería, etc.) con sus propias claves y su propia dirección. */
export async function addClient(h: Harness, id: string, opts: { secret?: string; eventsSecret?: string; host?: string } = {}) {
  const c = { id, secret: opts.secret ?? `secret-of-${id}`, eventsSecret: opts.eventsSecret ?? `events-of-${id}`, host: opts.host ?? `${id}.test` };
  await insertClient(h.db, c, { secret: await encrypt(c.secret, KEY), events: await encrypt(c.eventsSecret, KEY) });
  return c;
}

export interface Harness {
  env: Env;
  db: D1Database;
  /** Avisos que el servicio le entregó a la app. */
  delivered: { url: string; headers: Headers; body: string }[];
  /** Pagos que "existen" en Mercado Pago (los consulta el servicio por API). */
  mp: Map<string, { id: number; status: string; transaction_amount: number; currency_id: string; external_reference: string | null; date_approved: string | null; fee_details?: { amount?: number; fee_payer?: string }[]; transaction_details?: { net_received_amount?: number } }>;
  /** Cuerpos de las preferencias de pago que se le pidieron a Mercado Pago. */
  prefs: Record<string, any>[];
  coreDown: { value: boolean };
  /** Si se define, los avisos hacia la app se entregan a esta función (para probar los dos servicios juntos). */
  onCore?: (req: Request) => Promise<Response>;
  call: (method: string, path: string, body?: unknown, opts?: { secret?: string; now?: number; nonce?: string; client?: string }) => Promise<Response>;
}

export function makeHarness(over: Partial<Env> = {}): Harness {
  const db = createTestDb("payments");
  const delivered: Harness["delivered"] = [];
  const mp: Harness["mp"] = new Map();
  const prefs: Harness["prefs"] = [];
  const coreDown = { value: false };
  const holder: { onCore?: Harness["onCore"] } = {};

  // Como el fetch real de Workers: si se llama como método de otro objeto (this definido), falla.
  const fetchImpl = (async function (this: unknown, url: string | URL | Request, init?: RequestInit) {
    if (this !== undefined) throw new TypeError("Illegal invocation: function called with incorrect `this` reference");
    const u = String(url);
    if (/^https:\/\/[a-z0-9-]+\.test\//.test(u) && !u.startsWith("https://pay.test/")) {
      if (coreDown.value && u.startsWith("https://core.test/")) return new Response("down", { status: 503 });
      if (holder.onCore && u.startsWith("https://core.test/")) return holder.onCore(new Request(u, init));
      delivered.push({ url: u, headers: new Headers(init?.headers), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    }
    const m = /^https:\/\/api\.mercadopago\.com\/v1\/payments\/(.+)$/.exec(u);
    if (m) { const p = mp.get(decodeURIComponent(m[1])); return p ? Response.json(p) : new Response("not found", { status: 404 }); }
    if (u === "https://api.mercadopago.com/oauth/token") return Response.json({ access_token: "APP_USR-oauth", refresh_token: "r", user_id: 42, expires_in: 3600 });
    if (u === "https://api.mercadopago.com/checkout/preferences") { prefs.push(JSON.parse(String(init?.body))); return Response.json({ id: "pref-1", init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" }); }
    return new Response("unexpected " + u, { status: 500 });
  }) as typeof fetch;

  const env: Env = {
    DB: db, MP_WEBHOOK_SECRET: SECRETS.mpWebhook, MP_CLIENT_ID: "cid", MP_CLIENT_SECRET: "csecret", PUBLIC_BASE_URL: "https://pay.test",
    TOKEN_ENC_KEY: KEY, MP_MOCK: "true", fetchImpl, ...over,
  };

  void insertClient(db, { id: CLIENT, secret: SECRETS.core, eventsSecret: SECRETS.events, host: "core.test" }, DEFAULT_ENC);

  const call: Harness["call"] = async (method, path, body, opts = {}) => {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const headers = await signRequest({ clientId: opts.client ?? CLIENT, secret: opts.secret ?? SECRETS.core, method, path, body: raw, now: opts.now, nonce: opts.nonce });
    return app.request(path, { method, headers: { ...headers, "content-type": "application/json" }, body: raw || undefined }, env);
  };
  return { env, db, delivered, mp, prefs, coreDown, call, get onCore() { return holder.onCore; }, set onCore(f) { holder.onCore = f; } };
}

/** Deja la cuenta de Mercado Pago "conectada" con un token válido (cifrado como en producción). */
export async function connectMp(h: Harness, client = CLIENT) {
  await h.db
    .prepare("INSERT INTO provider_connections (client_id, provider, account_id, access_enc, refresh_enc, expires_at, connected_at) VALUES (?,'mercadopago','1',?,?,?,?)")
    .bind(client, await encrypt("APP_USR-token", KEY), await encrypt("refresh", KEY), new Date(Date.now() + 3600_000).toISOString(), new Date().toISOString())
    .run();
}

/** Aviso de Mercado Pago bien firmado, como lo manda el proveedor. */
export async function mpWebhook(h: Harness, paymentId: string, opts: { secret?: string; ts?: number; requestId?: string; client?: string } = {}) {
  const ts = opts.ts ?? Date.now();
  const requestId = opts.requestId ?? crypto.randomUUID();
  const sig = await hmacHex(`id:${paymentId.toLowerCase()};request-id:${requestId};ts:${ts};`, opts.secret ?? SECRETS.mpWebhook);
  return app.request(
    `/webhooks/mercadopago/${opts.client ?? CLIENT}?data.id=${paymentId}&type=payment`,
    { method: "POST", headers: { "x-signature": `ts=${ts},v1=${sig}`, "x-request-id": requestId, "content-type": "application/json", "CF-Connecting-IP": "203.0.113.9" }, body: JSON.stringify({ type: "payment", data: { id: paymentId } }) },
    h.env,
  );
}
