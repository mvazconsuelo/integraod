import { describe, expect, it } from "vitest";
import { addClient, CLIENT, connectMp, KEY, makeHarness, mpWebhook, SECRETS, type Harness } from "./helpers/payments-harness";
import { encrypt } from "../src/infrastructure/encryption/aes-gcm";
import { D1AuditLog } from "../src/infrastructure/repositories/d1-audit-log";
import { deliverAllOutboxes } from "../src/infrastructure/scheduler";
import { verifyRequest } from "../src/shared/security/signing";
import { app } from "../src/app";

/** Varias apps (consultorio, peluquería…) usan el mismo servicio de pagos: ninguna puede ver ni tocar lo de otra. */
const OTHER = "peluqueria";
const json = async (r: Response) => r.json() as Promise<any>;
const intentBody = { reference: "bud-1", description: "Anticipo", payerLabel: "Ana", amountCents: 3_000_000, kind: "advance", dueDate: null };
const manual = (over = {}) => ({ idempotencyKey: "same-key-0001", intentId: null, reference: "bud-1", payerLabel: "Ana", concept: "Pago", amountCents: 1_000_000, method: "cash", kind: "partial", notes: "", ...over });

async function twoClients() {
  const h = makeHarness();
  const other = await addClient(h, OTHER, { host: "peluqueria.test" });
  const asOther = (method: string, path: string, body?: unknown, opts = {}) => h.call(method, path, body, { client: OTHER, secret: other.secret, ...opts });
  return { h, other, asOther };
}

describe("identidad del cliente", () => {
  it("un cliente desconocido, sin cabecera o suspendido recibe el mismo 401", async () => {
    const { h, other } = await twoClients();
    expect((await h.call("GET", "/v1/providers", undefined, { client: "no-existe" })).status).toBe(401);
    expect((await app.request("/v1/providers", {}, h.env)).status).toBe(401);
    expect((await h.call("GET", "/v1/providers", undefined, { client: OTHER, secret: other.secret })).status).toBe(200);
    await h.db.prepare("UPDATE clients SET status = 'suspended' WHERE id = ?").bind(OTHER).run();
    expect((await h.call("GET", "/v1/providers", undefined, { client: OTHER, secret: other.secret })).status).toBe(401);
  });

  it("firmar con la clave de otro cliente no sirve, ni haciéndose pasar por él", async () => {
    const { h, other } = await twoClients();
    expect((await h.call("GET", "/v1/providers", undefined, { client: OTHER, secret: SECRETS.core })).status).toBe(401); // clave ajena
    expect((await h.call("GET", "/v1/providers", undefined, { client: CLIENT, secret: other.secret })).status).toBe(401);
  });

  it("el cliente va dentro de lo firmado: un pedido de uno no se puede reenviar como si fuera de otro", async () => {
    const { h, other } = await twoClients();
    const { signRequest } = await import("../src/shared/security/signing");
    // Dos clientes con la MISMA clave: aun así, el pedido firmado para uno no vale para el otro.
    await h.db.prepare("UPDATE clients SET secret_enc = ? WHERE id = ?").bind(await encrypt("compartida", KEY), CLIENT).run();
    await h.db.prepare("UPDATE clients SET secret_enc = ? WHERE id = ?").bind(await encrypt("compartida", KEY), OTHER).run();
    const headers = await signRequest({ clientId: CLIENT, secret: "compartida", method: "GET", path: "/v1/providers" });
    expect((await app.request("/v1/providers", { headers }, h.env)).status).toBe(200);
    expect((await app.request("/v1/providers", { headers: { ...headers, "x-svc-client": OTHER, "x-svc-nonce": headers["x-svc-nonce"] + "x" } }, h.env)).status).toBe(401);
    expect(other.id).toBe(OTHER);
  });
});

describe("aislamiento de datos", () => {
  it("un cliente no ve, cancela ni anula lo de otro (siempre 404)", async () => {
    const { h, asOther } = await twoClients();
    const intent = (await json(await h.call("POST", "/v1/intents", intentBody))).intent;
    const payment = (await json(await h.call("POST", "/v1/payments/manual", manual({ intentId: intent.id })))).payment;

    expect((await asOther("GET", `/v1/intents/${intent.id}`)).status).toBe(404);
    expect((await asOther("POST", `/v1/intents/${intent.id}/cancel`, {})).status).toBe(404);
    expect((await asOther("GET", `/v1/payments/${payment.id}`)).status).toBe(404);
    expect((await asOther("POST", `/v1/payments/${payment.id}/void`, { reason: "intento" })).status).toBe(404);
    expect((await asOther("POST", `/v1/mock/${intent.public_id}/pay`, { outcome: "approved" })).status).toBe(404);
    // Intentar cobrar contra un cobro ajeno tampoco funciona.
    expect((await asOther("POST", "/v1/payments/manual", manual({ idempotencyKey: "other-key-0001", intentId: intent.id }))).status).toBe(404);

    // Y lo del dueño sigue intacto.
    expect((await json(await h.call("GET", `/v1/payments/${payment.id}`))).payment.status).toBe("approved");
  });

  it("mismas referencias y mismas claves de idempotencia en dos clientes no chocan", async () => {
    const { h, asOther } = await twoClients();
    const a = (await json(await h.call("POST", "/v1/payments/manual", manual()))).payment;
    const b = (await json(await asOther("POST", "/v1/payments/manual", manual()))).payment;
    expect(a.id).not.toBe(b.id);
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(2);
    // Repetir en el mismo cliente sí es idempotente.
    expect((await json(await h.call("POST", "/v1/payments/manual", manual()))).payment.id).toBe(a.id);
  });

  it("la cola de revisión y la bitácora son de cada cliente", async () => {
    const { h, asOther } = await twoClients();
    await h.call("POST", "/v1/intents", intentBody);
    expect(await json(await asOther("GET", "/v1/review"))).toEqual([]);
    await h.call("POST", "/v1/payments/manual", manual());
    await asOther("POST", "/v1/payments/manual", manual());
    expect(await new D1AuditLog(h.db, CLIENT).verify()).toEqual({ ok: true, count: 2 });
    expect(await new D1AuditLog(h.db, OTHER).verify()).toEqual({ ok: true, count: 1 });
  });
});

describe("avisos a cada app", () => {
  it("cada aviso va a la dirección de su cliente, firmado con SU clave", async () => {
    const { h, other } = await twoClients();
    await h.call("POST", "/v1/payments/manual", manual({ idempotencyKey: "key-core-001" }));
    await h.call("POST", "/v1/payments/manual", manual({ idempotencyKey: "key-other-01" }), { client: OTHER, secret: other.secret });
    await deliverAllOutboxes(h.env);

    const toCore = h.delivered.filter((d) => d.url.startsWith("https://core.test/"));
    const toOther = h.delivered.filter((d) => d.url.startsWith("https://peluqueria.test/"));
    expect(toCore.length).toBeGreaterThan(0);
    expect(toOther.length).toBeGreaterThan(0);
    const check = (d: Harness["delivered"][number], clientId: string, secret: string) =>
      verifyRequest({ clientId, secrets: [secret], method: "POST", path: new URL(d.url).pathname, body: d.body, headers: d.headers, seen: async () => false });
    for (const d of toCore) expect((await check(d, CLIENT, SECRETS.events)).ok).toBe(true);
    for (const d of toOther) expect((await check(d, OTHER, other.eventsSecret)).ok).toBe(true);
    // Un aviso de una app no es válido para la otra.
    expect((await check(toOther[0], OTHER, SECRETS.events)).ok).toBe(false);
    expect((await check(toOther[0], CLIENT, other.eventsSecret)).ok).toBe(false);
  });

  it("si una app está caída, las demás reciben sus avisos igual", async () => {
    const { h, other } = await twoClients();
    h.coreDown.value = true; // solo cae core.test
    await h.call("POST", "/v1/payments/manual", manual({ idempotencyKey: "key-core-001" }));
    await h.call("POST", "/v1/payments/manual", manual({ idempotencyKey: "key-other-01" }), { client: OTHER, secret: other.secret });
    await deliverAllOutboxes(h.env);
    const pending = (client: string) => h.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE client_id = ? AND delivered_at IS NULL").bind(client).first<{ n: number }>();
    expect((await pending(CLIENT))!.n).toBeGreaterThan(0);
    expect((await pending(OTHER))!.n).toBe(0);
  });
});

describe("webhooks con varios clientes", () => {
  const setupBoth = async () => {
    const ctx = await twoClients();
    const { h } = ctx;
    h.env.MP_MOCK = undefined;
    await connectMp(h);
    await connectMp(h, OTHER);
    return ctx;
  };

  it("la preferencia de pago lleva el webhook y el retorno de ESE cliente", async () => {
    const { h, asOther } = await setupBoth();
    await h.call("POST", "/v1/intents", intentBody);
    await asOther("POST", "/v1/intents", intentBody);
    expect(h.prefs[0].notification_url).toBe(`https://pay.test/webhooks/mercadopago/${CLIENT}`);
    expect(h.prefs[0].back_urls.success).toMatch(/^https:\/\/core\.test\/pay\//);
    expect(h.prefs[1].notification_url).toBe(`https://pay.test/webhooks/mercadopago/${OTHER}`);
    expect(h.prefs[1].back_urls.success).toMatch(/^https:\/\/peluqueria\.test\/pay\//);
  });

  it("un pago de un cliente no se puede cobrar desde el webhook de otro", async () => {
    const { h } = await setupBoth();
    const intent = (await json(await h.call("POST", "/v1/intents", intentBody))).intent;
    h.mp.set("555", { id: 555, status: "approved", transaction_amount: 30000, currency_id: "ARS", external_reference: intent.external_reference, date_approved: new Date().toISOString() });

    // Llega por la dirección del otro cliente: no corresponde a ningún cobro suyo → revisión, nunca dinero.
    expect((await json(await mpWebhook(h, "555", { client: OTHER }))).outcome).toBe("rejected");
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(0);
    expect((await h.db.prepare("SELECT client_id FROM review_items").first<{ client_id: string }>())!.client_id).toBe(OTHER);

    // Por la suya, se registra.
    expect((await json(await mpWebhook(h, "555"))).outcome).toBe("registered");
    expect((await h.db.prepare("SELECT client_id FROM payments").first<{ client_id: string }>())!.client_id).toBe(CLIENT);
  });

  it("webhook hacia un cliente que no existe o está suspendido: 404", async () => {
    const { h } = await setupBoth();
    expect((await mpWebhook(h, "1", { client: "fantasma" })).status).toBe(404);
    await h.db.prepare("UPDATE clients SET status = 'suspended' WHERE id = ?").bind(OTHER).run();
    expect((await mpWebhook(h, "1", { client: OTHER })).status).toBe(404);
  });
});

describe("conectar la cuenta del proveedor", () => {
  it("la conexión queda en el cliente que la pidió y vuelve a SU app", async () => {
    const { h, asOther } = await twoClients();
    h.env.MP_MOCK = undefined;
    const { url } = await json(await asOther("POST", "/v1/providers/mercadopago/connect", {}));
    const state = new URL(url).searchParams.get("state")!;

    const res = await app.request(`/oauth/mercadopago/callback?code=abc&state=${encodeURIComponent(state)}`, {}, h.env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://peluqueria.test/configuracion?mp=ok");
    const rows = (await h.db.prepare("SELECT client_id FROM provider_connections").all<{ client_id: string }>()).results;
    expect(rows).toEqual([{ client_id: OTHER }]);
  });

  it("un state alterado para apuntar a otro cliente no sirve", async () => {
    const { h, asOther } = await twoClients();
    h.env.MP_MOCK = undefined;
    const { url } = await json(await asOther("POST", "/v1/providers/mercadopago/connect", {}));
    const state = new URL(url).searchParams.get("state")!;
    const forged = state.replace(`.${OTHER}.`, `.${CLIENT}.`);
    expect(forged).not.toBe(state);
    expect((await app.request(`/oauth/mercadopago/callback?code=abc&state=${encodeURIComponent(forged)}`, {}, h.env)).status).toBe(400);
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM provider_connections").first<{ n: number }>())!.n).toBe(0);
  });
});
