import { describe, expect, it } from "vitest";
import { CLIENT, connectMp, makeHarness, mpWebhook } from "./helpers/payments-harness";
import { D1AuditLog } from "../src/infrastructure/repositories/d1-audit-log";

const verifyAuditChain = (db: D1Database) => new D1AuditLog(db, CLIENT).verify();

const intentBody = { reference: "bud-1", description: "Anticipo", payerLabel: "Ana", amountCents: 3_000_000, kind: "advance", dueDate: null };
const json = async (r: Response) => r.json() as Promise<any>;
const createIntent = async (h: ReturnType<typeof makeHarness>, over = {}) => (await json(await h.call("POST", "/v1/intents", { ...intentBody, ...over }))).intent;

const manual = (over = {}) => ({ idempotencyKey: crypto.randomUUID(), intentId: null, reference: "bud-1", payerLabel: "Ana", concept: "Pago", amountCents: 1_000_000, method: "cash", kind: "partial", notes: "", ...over });

describe("cobros y link de pago", () => {
  it("con el piloto activo el link va a la pantalla simulada propia", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    expect(i.provider).toBe("mock");
    expect(i.checkout_url).toBe(`/mock-checkout/${i.public_id}`);
    expect(i.public_id.length).toBeGreaterThanOrEqual(22); // 128 bits: no adivinable
  });

  it("con Mercado Pago conectado crea el checkout real y guarda su link", async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    await connectMp(h);
    const i = await createIntent(h);
    expect(i.provider).toBe("mercadopago");
    expect(i.checkout_url).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\//);
  });

  it("rechaza un link de pago que no sea del proveedor (defensa contra links falsos) y no guarda nada", async () => {
    const evil = (async (u: string) => (String(u).includes("/checkout/preferences") ? Response.json({ id: "x", init_point: "https://mercadopago.com.evil.example/pagar" }) : new Response("", { status: 500 }))) as typeof fetch;
    const h = makeHarness({ MP_MOCK: undefined, fetchImpl: evil });
    await connectMp(h);
    const res = await h.call("POST", "/v1/intents", intentBody);
    expect(res.status).toBe(502);
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM intents").first<{ n: number }>())!.n).toBe(0);
  });

  it("sin proveedor el cobro igual se crea, sin link (se cobra a mano)", async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    const i = await createIntent(h);
    expect(i.provider).toBe("none");
    expect(i.checkout_url).toBeNull();
  });

  it("valida los datos de entrada", async () => {
    const h = makeHarness();
    expect((await h.call("POST", "/v1/intents", { ...intentBody, amountCents: -5 })).status).toBe(400);
    expect((await h.call("POST", "/v1/intents", { ...intentBody, amountCents: 1.5 })).status).toBe(400);
    expect((await h.call("POST", "/v1/intents", { ...intentBody, kind: "otro" })).status).toBe(400);
  });
});

describe("pagos manuales (efectivo)", () => {
  it("es idempotente: repetir el mismo pedido no duplica el dinero", async () => {
    const h = makeHarness();
    const body = manual();
    const a = await json(await h.call("POST", "/v1/payments/manual", body));
    const b = await json(await h.call("POST", "/v1/payments/manual", body));
    expect(a.payment.id).toBe(b.payment.id);
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(1);
  });

  it("el cobro pasa a pagado al cubrirse y vuelve a pendiente al anularse", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    const p = (await json(await h.call("POST", "/v1/payments/manual", manual({ intentId: i.id, amountCents: 3_000_000 })))).payment;
    expect((await json(await h.call("GET", `/v1/intents/${i.id}`))).intent.status).toBe("paid");
    await h.call("POST", `/v1/payments/${p.id}/void`, { reason: "Error de carga" });
    expect((await json(await h.call("GET", `/v1/intents/${i.id}`))).intent.status).toBe("pending");
    expect((await h.call("POST", `/v1/payments/${p.id}/void`, { reason: "otra vez" })).status).toBe(409);
  });

  it("no acepta un cobro de otro presupuesto ni uno cancelado", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    expect((await h.call("POST", "/v1/payments/manual", manual({ intentId: i.id, reference: "bud-OTRO" }))).status).toBe(422);
    await h.call("POST", `/v1/intents/${i.id}/cancel`, {});
    expect((await h.call("POST", "/v1/payments/manual", manual({ intentId: i.id }))).status).toBe(409);
  });

  it("no se puede cancelar un cobro que ya recibió dinero", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    await h.call("POST", "/v1/payments/manual", manual({ intentId: i.id }));
    expect((await h.call("POST", `/v1/intents/${i.id}/cancel`, {})).status).toBe(409);
  });

  it("los pagos nunca se borran: la base lo impide", async () => {
    const h = makeHarness();
    await h.call("POST", "/v1/payments/manual", manual());
    await expect(h.db.prepare("DELETE FROM payments").run()).rejects.toThrow(/no se borran/);
  });
});

describe("avisos de Mercado Pago (webhooks)", () => {
  const setup = async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    await connectMp(h);
    const i = await createIntent(h);
    const pay = (over = {}) => h.mp.set("777", { id: 777, status: "approved", transaction_amount: 30000, currency_id: "ARS", external_reference: i.external_reference, date_approved: "2026-11-02T15:00:00.000-03:00", ...over });
    return { h, i, pay };
  };

  it("registra el pago aprobado, cierra el cobro y es idempotente", async () => {
    const { h, i, pay } = await setup();
    pay();
    expect((await json(await mpWebhook(h, "777"))).outcome).toBe("registered");
    expect((await json(await mpWebhook(h, "777"))).outcome).toBe("duplicate");
    expect((await json(await h.call("GET", `/v1/intents/${i.id}`))).intent.status).toBe("paid");
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(1);
  });

  it("un aviso con firma falsa no mueve dinero y queda registrado", async () => {
    const { h, pay } = await setup();
    pay();
    const res = await mpWebhook(h, "777", { secret: "firma-inventada" });
    expect(res.status).toBe(401);
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(0);
    expect((await h.db.prepare("SELECT outcome FROM provider_events").first<{ outcome: string }>())!.outcome).toBe("invalid_signature");
  });

  it("un aviso viejo reenviado (replay) se rechaza", async () => {
    const { h, pay } = await setup();
    pay();
    expect((await mpWebhook(h, "777", { ts: Date.now() - 60 * 60_000 })).status).toBe(401);
  });

  it("quien prueba firmas sin parar es frenado", async () => {
    const { h } = await setup();
    let blocked = false;
    for (let n = 0; n < 40; n++) if ((await mpWebhook(h, String(n), { secret: "x" })).status === 429) blocked = true;
    expect(blocked).toBe(true);
  });

  it("importe distinto, moneda distinta o referencia desconocida NO se pierden: van a revisión y no cuentan como dinero", async () => {
    const { h, i, pay } = await setup();
    for (const [id, over] of [
      ["777", { transaction_amount: 100 }],
      ["778", { currency_id: "USD" }],
      ["779", { external_reference: "int_inexistente" }],
    ] as const) {
      pay();
      h.mp.set(id, { ...h.mp.get("777")!, id: Number(id), ...over });
      expect((await json(await mpWebhook(h, id))).outcome).toBe("rejected");
    }
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(0);
    const review = await json(await h.call("GET", "/v1/review"));
    expect(review).toHaveLength(3);
    const reasons = review.map((r: any) => r.reason).join(" | ");
    expect(reasons).toMatch(/importe/);
    expect(reasons).toMatch(/moneda/);
    expect(reasons).toMatch(/ningún cobro/);
    expect((await json(await h.call("GET", `/v1/intents/${i.id}`))).intent.status).toBe("pending");
    // y se puede cerrar la revisión dejando constancia
    expect((await h.call("POST", `/v1/review/${review[0].id}/dismiss`, { reason: "Era una prueba" })).status).toBe(200);
    expect(await json(await h.call("GET", "/v1/review"))).toHaveLength(2);
  });

  it("no registra pagos no aprobados", async () => {
    const { h, pay } = await setup();
    for (const status of ["pending", "in_process", "rejected", "cancelled"]) { pay({ status }); expect((await json(await mpWebhook(h, "777"))).outcome).toBe("ignored"); }
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(0);
  });

  it("un reembolso anula el pago y reabre el cobro", async () => {
    const { h, i, pay } = await setup();
    pay(); await mpWebhook(h, "777");
    pay({ status: "refunded" });
    expect((await json(await mpWebhook(h, "777"))).outcome).toBe("refunded");
    expect((await json(await h.call("GET", `/v1/intents/${i.id}`))).intent.status).toBe("pending");
    expect((await json(await mpWebhook(h, "777"))).outcome).toBe("ignored");
  });

  it("si Mercado Pago no tiene ese pago, falla de forma reintentable y no registra nada", async () => {
    const { h } = await setup();
    expect((await mpWebhook(h, "999")).status).toBe(500);
  });

  it("proveedor desconocido: 404", async () => {
    const h = makeHarness();
    const { app } = await import("../src/app");
    expect((await app.request(`/webhooks/nadie/${CLIENT}`, { method: "POST", body: "{}" }, h.env)).status).toBe(404);
  });
});

describe("checkout simulado (piloto)", () => {
  it("aprobar registra el pago por el mismo camino; no se puede pagar dos veces", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    const r = await json(await h.call("POST", `/v1/mock/${i.public_id}/pay`, { outcome: "approved" }));
    expect(r.result).toBe("registered");
    expect(r.payment.provider_payment_id).toMatch(/^mock_/);
    expect((await h.call("POST", `/v1/mock/${i.public_id}/pay`, { outcome: "approved" })).status).toBe(409);
  });
  it("rechazado o pendiente no mueve dinero", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    for (const outcome of ["rejected", "pending"]) expect((await json(await h.call("POST", `/v1/mock/${i.public_id}/pay`, { outcome }))).result).toBe("ignored");
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(0);
  });
  it("sin MP_MOCK la pantalla simulada no existe", async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    const i = await createIntent(h);
    expect((await h.call("POST", `/v1/mock/${i.public_id}/pay`, { outcome: "approved" })).status).toBe(404);
  });
});

describe("avisos hacia la app (outbox)", () => {
  it("cada cambio genera avisos firmados que la app puede verificar", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    await h.call("POST", "/v1/payments/manual", manual({ intentId: i.id, amountCents: 3_000_000 }));
    expect(h.delivered.length).toBeGreaterThanOrEqual(3); // intent.created, payment.approved, intent.updated
    const { verifyRequest } = await import("../src/shared/security/signing");
    for (const d of h.delivered) {
      const v = await verifyRequest({ clientId: CLIENT, secrets: ["events-secret-1"], method: "POST", path: new URL(d.url).pathname, body: d.body, headers: d.headers, seen: async () => false });
      expect(v.ok).toBe(true);
    }
    expect(h.delivered.map((d) => JSON.parse(d.body).type)).toEqual(expect.arrayContaining(["intent.created", "payment.approved", "intent.updated"]));
  });

  it("si la app no responde, el aviso no se pierde: queda pendiente y se reintenta", async () => {
    const h = makeHarness();
    h.coreDown.value = true;
    const i = await createIntent(h);
    const pending = await h.db.prepare("SELECT COUNT(*) AS n, MAX(attempts) AS a FROM outbox WHERE delivered_at IS NULL").first<{ n: number; a: number }>();
    expect(pending!.n).toBeGreaterThan(0);
    expect(pending!.a).toBeGreaterThanOrEqual(1);
    expect(h.delivered).toHaveLength(0);

    h.coreDown.value = false;
    await h.db.prepare("UPDATE outbox SET next_attempt_at = '2000-01-01T00:00:00Z'").run(); // pasó la espera
    const { deliverAllOutboxes } = await import("../src/infrastructure/scheduler");
    expect(await deliverAllOutboxes(h.env)).toBeGreaterThan(0);
    expect(JSON.parse(h.delivered[0].body).entityId).toBe(i.id);
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE delivered_at IS NULL").first<{ n: number }>())!.n).toBe(0);
  });
});

describe("bitácora de auditoría", () => {
  it("registra cada operación crítica y la cadena es consistente", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    const p = (await json(await h.call("POST", "/v1/payments/manual", manual({ intentId: i.id })))).payment;
    await h.call("POST", `/v1/payments/${p.id}/void`, { reason: "Error" });
    const log = (await h.db.prepare("SELECT action FROM audit_log ORDER BY seq").all<{ action: string }>()).results.map((r) => r.action);
    expect(log).toEqual(["intent.created", "payment.manual_recorded", "payment.voided"]);
    expect(await verifyAuditChain(h.db)).toEqual({ ok: true, count: 3 });
    expect(await json(await h.call("GET", "/v1/audit/verify"))).toMatchObject({ ok: true });
  });

  it("no se puede editar ni borrar (triggers) y, si alguien igual lo logra, se detecta", async () => {
    const h = makeHarness();
    await createIntent(h);
    await expect(h.db.prepare("UPDATE audit_log SET actor = 'otro'").run()).rejects.toThrow(/solo agregar/);
    await expect(h.db.prepare("DELETE FROM audit_log").run()).rejects.toThrow(/solo agregar/);
    // Atacante con acceso directo a la base: quita la protección y edita
    await h.db.prepare("DROP TRIGGER audit_log_no_update").run();
    await h.db.prepare("UPDATE audit_log SET detail = '{\"amount_cents\":1}'").run();
    expect((await verifyAuditChain(h.db)).ok).toBe(false);
  });
});

describe("conexión de proveedores", () => {
  it("el callback de OAuth rechaza un state falso: no conecta nada y no redirige a ningún lado", async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    const { app } = await import("../src/app");
    const res = await app.request("/oauth/mercadopago/callback?code=abc&state=falso.123.456", {}, h.env);
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM provider_connections").first<{ n: number }>())!.n).toBe(0);
  });

  it("las credenciales se guardan cifradas, nunca en texto plano", async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    await connectMp(h);
    const row = await h.db.prepare("SELECT access_enc, refresh_enc FROM provider_connections").first<{ access_enc: string; refresh_enc: string }>();
    expect(row!.access_enc).not.toContain("APP_USR");
    expect(row!.refresh_enc).not.toContain("refresh");
  });
});


describe("comisiones del proveedor", () => {
  const setup = async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    await connectMp(h);
    const i = await createIntent(h); // $ 30.000
    const pay = (over = {}) => h.mp.set("777", { id: 777, status: "approved", transaction_amount: 30000, currency_id: "ARS", external_reference: i.external_reference, date_approved: "2026-11-02T15:00:00.000-03:00", ...over });
    const stored = async () => (await h.db.prepare("SELECT fee_cents, net_cents, amount_cents FROM payments").first<{ fee_cents: number | null; net_cents: number | null; amount_cents: number }>())!;
    return { h, pay, stored };
  };

  it("guarda lo que Mercado Pago informa que le queda al negocio, y de ahí la comisión", async () => {
    const { h, pay, stored } = await setup();
    pay({ transaction_details: { net_received_amount: 28113 } });
    await mpWebhook(h, "777");
    expect(await stored()).toEqual({ amount_cents: 3_000_000, net_cents: 2_811_300, fee_cents: 188_700 });
  });

  it("si no informa el neto, resta las comisiones a cargo del vendedor", async () => {
    const { h, pay, stored } = await setup();
    pay({ fee_details: [{ amount: 1500, fee_payer: "collector" }, { amount: 387, fee_payer: "collector" }, { amount: 999, fee_payer: "payer" }] });
    await mpWebhook(h, "777");
    expect(await stored()).toEqual({ amount_cents: 3_000_000, fee_cents: 188_700, net_cents: 2_811_300 });
  });

  it("si todavía no informa nada, queda sin dato (no se inventa una comisión)", async () => {
    const { h, pay, stored } = await setup();
    pay();
    await mpWebhook(h, "777");
    expect(await stored()).toEqual({ amount_cents: 3_000_000, fee_cents: null, net_cents: null });
  });

  it("un neto mayor al importe (dato imposible) se descarta", async () => {
    const { h, pay, stored } = await setup();
    pay({ transaction_details: { net_received_amount: 31000 } });
    await mpWebhook(h, "777");
    expect(await stored()).toMatchObject({ fee_cents: null, net_cents: null });
  });

  it("el efectivo no tiene comisión", async () => {
    const h = makeHarness();
    await h.call("POST", "/v1/payments/manual", manual());
    const row = await h.db.prepare("SELECT fee_cents, net_cents FROM payments").first<{ fee_cents: number | null; net_cents: number | null }>();
    expect(row).toEqual({ fee_cents: null, net_cents: null });
  });

  it("el checkout simulado muestra una comisión simulada del 6%", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    await h.call("POST", `/v1/mock/${i.public_id}/pay`, { outcome: "approved" });
    const row = await h.db.prepare("SELECT amount_cents, fee_cents, net_cents FROM payments").first<{ amount_cents: number; fee_cents: number; net_cents: number }>();
    expect(row).toEqual({ amount_cents: 3_000_000, fee_cents: 180_000, net_cents: 2_820_000 });
  });

  it("la comisión viaja en el pago que se le informa a la app", async () => {
    const h = makeHarness();
    const i = await createIntent(h);
    const res = await json(await h.call("POST", `/v1/mock/${i.public_id}/pay`, { outcome: "approved" }));
    expect(res.payment).toMatchObject({ fee_cents: 180_000, net_cents: 2_820_000 });
  });
});

describe("cobros en efectivo (sin proveedor ni link)", () => {
  it("se crean sin proveedor y sin link, aunque haya un proveedor conectado", async () => {
    const h = makeHarness({ MP_MOCK: undefined });
    await connectMp(h);
    const i = await createIntent(h, { method: "cash" });
    expect(i).toMatchObject({ provider: "cash", checkout_url: null, provider_ref: null, status: "pending" });
    expect(h.prefs).toHaveLength(0); // no se le pidió nada a Mercado Pago
  });

  it("con el piloto activado tampoco hay checkout simulado: no se puede 'pagar' online", async () => {
    const h = makeHarness(); // MP_MOCK=true
    const i = await createIntent(h, { method: "cash" });
    expect(i.checkout_url).toBeNull();
    expect((await h.call("POST", `/v1/mock/${i.public_id}/pay`, { outcome: "approved" })).status).toBe(409);
  });

  it("el pago en mano lo cierra, como cualquier otro cobro", async () => {
    const h = makeHarness();
    const i = await createIntent(h, { method: "cash" });
    await h.call("POST", "/v1/payments/manual", manual({ intentId: i.id, amountCents: 3_000_000, kind: "advance" }));
    expect((await json(await h.call("GET", `/v1/intents/${i.id}`))).intent.status).toBe("paid");
  });

  it("se pueden cancelar si no recibieron pagos", async () => {
    const h = makeHarness();
    const i = await createIntent(h, { method: "cash" });
    expect((await json(await h.call("POST", `/v1/intents/${i.id}/cancel`, {}))).intent.status).toBe("cancelled");
  });

  it("un método desconocido se rechaza", async () => {
    const h = makeHarness();
    expect((await h.call("POST", "/v1/intents", { ...intentBody, method: "cheque" })).status).toBe(400);
  });

  it("si no se indica el método, es online (como antes)", async () => {
    const h = makeHarness();
    expect((await createIntent(h)).provider).toBe("mock");
  });
});
