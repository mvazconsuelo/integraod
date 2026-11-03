import { beforeEach, describe, expect, it } from "vitest";
import { makeStack, type Stack } from "./helpers/stack";
import { CLIENT, connectMp, mpWebhook, SECRETS } from "../../payments/tests/helpers/payments-harness";
import { app as coreApp } from "../worker/src/app";
import { signRequest } from "../../payments/src/shared/security/signing";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import * as repo from "../worker/src/repositories/payments.repository";

/** La app y el servicio de pagos juntos, cada uno con su base de datos. */
let s: Stack;
beforeEach(() => { s = makeStack(); });

const budget = async (total = 10_000_000, patient = "Ana") => {
  const b = await budgets.createBudget(s.core.DB, { patient_ref: patient, issued_on: "2026-11-02", valid_until: null, notes: "", items: [{ description: "T", quantity: 1, unit_price_cents: total, discount_pct: 0 }] });
  return b.id;
};
const ask = (budgetId: string, amount: number, kind: "advance" | "partial" | "final" = "partial", due: string | null = null) =>
  payments.createRequest(s.core, { patient_ref: "Ana", concept: "Pago", amount_cents: amount, kind, budget_id: budgetId, conditions: "", due_date: due });
const cash = (budgetId: string, amount: number, extra: Record<string, unknown> = {}) =>
  payments.registerManualPayment(s.core, { patient_ref: "Ana", concept: "Pago", amount_cents: amount, method: "cash", kind: "partial", budget_id: budgetId, request_id: null, notes: "", ...extra });
const detail = (id: string) => budgets.getBudgetDetail(s.core.DB, id);

describe("cobros: la app pide, el servicio de pagos ejecuta", () => {
  it("crear un cobro lo crea en el servicio de pagos y se refleja en la app", async () => {
    const b = await budget();
    const r = await ask(b, 3_000_000, "advance");
    const remote = await s.pay.db.prepare("SELECT * FROM intents WHERE id = ?").bind(r.id).first<any>();
    expect(remote.reference).toBe(b); // el servicio solo conoce una referencia opaca
    expect(remote.amount_cents).toBe(3_000_000);
    expect(r.provider).toBe("mock");
    expect(r.checkout_url).toBe(`/mock-checkout/${r.public_id}`);
    expect(r.display_status).toBe("pending");
  });

  it("las condiciones del cobro son un dato de la app: el servicio de pagos no las recibe", async () => {
    const b = await budget();
    const r = await payments.createRequest(s.core, { patient_ref: "Ana", concept: "Anticipo", amount_cents: 1_000_000, kind: "advance", budget_id: b, conditions: "Se retiene si cancelás con menos de 24 hs.", due_date: null });
    expect((await payments.getRequestDetail(s.core.DB, r.id)).conditions).toMatch(/24 hs/);
    expect(JSON.stringify(await s.pay.db.prepare("SELECT * FROM intents").all())).not.toContain("24 hs");
  });

  it("la página pública no ofrece un destino de pago fuera de los permitidos", async () => {
    const b = await budget();
    const r = await ask(b, 1_000_000, "advance");
    expect((await payments.publicView(s.core.DB, r.public_id)).checkout_url).toBe(r.checkout_url);
    await s.core.DB.prepare("UPDATE payment_requests SET checkout_url = 'https://mercadopago.com.evil.example/pagar' WHERE id = ?").bind(r.id).run();
    expect((await payments.publicView(s.core.DB, r.public_id)).checkout_url).toBeNull();
  });

  it("la vista pública no expone datos internos", async () => {
    const b = await budget();
    const r = await ask(b, 1_000_000, "advance");
    expect(Object.keys(await payments.publicView(s.core.DB, r.public_id)).sort()).toEqual(["amount_cents", "budget_number", "checkout_url", "clinic", "concept", "conditions", "created_at", "currency", "due_date", "patient_ref", "pay_in_cash", "status"]);
    // El presupuesto en sí no llega a quien paga (ni su identificador): solo su número, como referencia.
    const view = await payments.publicView(s.core.DB, r.public_id);
    expect(JSON.stringify(view)).not.toContain(b);
    expect(view.budget_number).toBe(1);
    await expect(payments.publicView(s.core.DB, "no-existe")).rejects.toThrow(/no existe/);
  });

  it("si el servicio de pagos no está disponible, el cobro no queda a medias", async () => {
    const b = await budget();
    s.core.PAYMENTS = { fetch: async () => { throw new Error("red caída"); } } as unknown as Fetcher;
    await expect(ask(b, 1_000_000, "advance")).rejects.toThrow(/servicio de pagos no está disponible/);
    expect((await s.core.DB.prepare("SELECT COUNT(*) AS n FROM payment_requests").first<{ n: number }>())!.n).toBe(0);
  });

  it("un error del servicio de pagos se muestra como falla suya, sin filtrar detalles", async () => {
    const b = await budget();
    s.core.PAYMENTS = { fetch: async () => new Response(JSON.stringify({ error: "SQLITE_ERROR: detalle interno" }), { status: 500 }) } as unknown as Fetcher;
    await expect(ask(b, 1_000_000, "advance")).rejects.toThrow(/no respondió como esperábamos/);
  });

  it("la clave entre servicios tiene que coincidir: con otra, el servicio rechaza y la app lo muestra como falla", async () => {
    const b = await budget();
    s.core.SVC_SECRET_CORE = "clave-equivocada";
    await expect(ask(b, 1_000_000, "advance")).rejects.toThrow(/no respondió como esperábamos/);
  });
});

describe("pagos de Mercado Pago de punta a punta", () => {
  const mpStack = async () => {
    s = makeStack({ mock: false });
    await connectMp(s.pay);
    const b = await budget();
    const r = await ask(b, 3_000_000, "advance");
    const set = (over = {}) => s.pay.mp.set("777", { id: 777, status: "approved", transaction_amount: 30000, currency_id: "ARS", external_reference: r.external_reference, date_approved: "2026-11-02T15:00:00.000-03:00", ...over });
    return { b, r, set };
  };

  it("crea el checkout real y guarda su link", async () => {
    const { r } = await mpStack();
    expect(r.provider).toBe("mercadopago");
    expect(r.checkout_url).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\//);
  });

  it("el aviso llega al servicio, se registra, se avisa a la app y el pago baja el saldo del presupuesto", async () => {
    const { b, r, set } = await mpStack();
    set();
    expect((await (await mpWebhook(s.pay, "777")).json() as any).outcome).toBe("registered");
    const d = await payments.getRequestDetail(s.core.DB, r.id);
    expect(d.status).toBe("paid");
    expect(d.payments[0]).toMatchObject({ provider: "mercadopago", method: "mercadopago", source: "provider", amount_cents: 3_000_000 });
    expect((await detail(b)).balance_cents).toBe(7_000_000);
    expect((await detail(b)).status).toBe("in_progress");
  });

  it("repetir el aviso no duplica el dinero ni la aplicación", async () => {
    const { b, set } = await mpStack();
    set();
    await mpWebhook(s.pay, "777"); await mpWebhook(s.pay, "777");
    expect((await payments.listReceived(s.core.DB))).toHaveLength(1);
    expect((await detail(b)).applied_cents).toBe(3_000_000);
  });

  it("un pago con importe que no coincide NO entra al dinero de la app: queda en revisión", async () => {
    const { b, r, set } = await mpStack();
    set({ transaction_amount: 100 });
    expect((await (await mpWebhook(s.pay, "777")).json() as any).outcome).toBe("rejected");
    expect(await payments.listReceived(s.core.DB)).toHaveLength(0);
    expect((await detail(b)).applied_cents).toBe(0);
    expect((await payments.reviewQueue(s.core)).length).toBe(1);
    expect((await payments.getRequestDetail(s.core.DB, r.id)).status).toBe("pending");
    // el Resumen avisa que hay algo para revisar
    const sum = await (await s.api("GET", "/api/dashboard?from=2026-11-01&to=2026-11-30")).json() as any;
    expect(sum.review_count).toBe(1);
  });

  it("un reembolso libera el presupuesto y reabre el cobro", async () => {
    const { b, r, set } = await mpStack();
    set(); await mpWebhook(s.pay, "777");
    set({ status: "refunded" }); await mpWebhook(s.pay, "777");
    expect((await detail(b)).balance_cents).toBe(10_000_000);
    expect((await detail(b)).status).toBe("sent");
    expect((await payments.getRequestDetail(s.core.DB, r.id)).status).toBe("pending");
    expect((await payments.listReceived(s.core.DB))[0].status).toBe("refunded");
  });

  it("si el pago supera el saldo (porque cambió antes de pagar), el sobrante queda disponible", async () => {
    s = makeStack({ mock: false }); await connectMp(s.pay);
    const b = await budget(4_000_000);
    const r = await ask(b, 3_000_000, "advance");
    await cash(b, 2_000_000);
    s.pay.mp.set("777", { id: 777, status: "approved", transaction_amount: 30000, currency_id: "ARS", external_reference: r.external_reference, date_approved: null });
    await mpWebhook(s.pay, "777");
    expect((await detail(b)).balance_cents).toBe(0);
    expect((await payments.listReceived(s.core.DB)).find((p) => p.provider === "mercadopago")!.available_cents).toBe(1_000_000);
  });
});

describe("reglas del presupuesto (las valida la app antes de pedirle nada al servicio)", () => {
  it("no se puede pedir más que el saldo ni pedir dos veces el mismo dinero", async () => {
    const b = await budget();
    await expect(ask(b, 10_000_001)).rejects.toThrow(/Lo máximo que podés pedir ahora es/);
    const first = await ask(b, 6_000_000);
    expect((await detail(b)).requestable_cents).toBe(4_000_000);
    await expect(ask(b, 5_000_000)).rejects.toThrow(/el resto ya lo pediste/);
    await ask(b, 4_000_000);
    await expect(ask(b, 1)).rejects.toThrow(/Ya pediste todo lo que falta/);
    await payments.cancelRequest(s.core, first.id);
    expect((await detail(b)).requestable_cents).toBe(6_000_000);
  });

  it("el anticipo se pide una sola vez por presupuesto; cancelar el link lo libera", async () => {
    const b = await budget();
    const first = await ask(b, 1_000_000, "advance");
    expect((await detail(b)).has_advance).toBe(true);
    await expect(ask(b, 1_000_000, "advance")).rejects.toThrow(/ya fue pedido/);
    await ask(b, 1_000_000, "partial");
    await payments.cancelRequest(s.core, first.id);
    expect((await detail(b)).has_advance).toBe(false);
  });

  it("un anticipo cobrado en efectivo también cuenta como ya pedido", async () => {
    const b = await budget();
    await cash(b, 1_000_000, { kind: "advance" });
    expect((await budgets.listBudgets(s.core.DB))[0].has_advance).toBe(true);
    await expect(ask(b, 500_000, "advance")).rejects.toThrow(/ya fue pedido/);
  });

  it("un pago en efectivo no puede superar lo que falta cobrar", async () => {
    const b = await budget(1_000_000);
    await expect(cash(b, 1_500_000)).rejects.toThrow(/supera lo que falta cobrar/);
    expect(await payments.listReceived(s.core.DB)).toHaveLength(0);
  });

  it("cancelar el presupuesto cierra sus links de pago en el servicio de pagos", async () => {
    const b = await budget();
    const r = await ask(b, 3_000_000, "advance");
    await budgets.changeStatus(s.core.DB, b, "cancelled", { cancelLinks: (id) => payments.cancelOpenRequestsOfBudget(s.core, id) });
    expect((await payments.getRequestDetail(s.core.DB, r.id)).status).toBe("cancelled");
    expect((await s.pay.db.prepare("SELECT status FROM intents WHERE id = ?").bind(r.id).first<{ status: string }>())!.status).toBe("cancelled");
    expect((await payments.publicView(s.core.DB, r.public_id)).checkout_url).toBeNull();
  });

  it("el efectivo que paga un link lo cierra, y no se asocia a un cobro de otro presupuesto", async () => {
    const b = await budget();
    const other = await budget(5_000_000, "Luis");
    const r = await ask(b, 3_000_000, "advance");
    await expect(cash(other, 3_000_000, { request_id: r.id })).rejects.toThrow(/otro presupuesto/);
    await cash(b, 3_000_000, { request_id: r.id, kind: "advance" });
    const d = await payments.getRequestDetail(s.core.DB, r.id);
    expect(d.status).toBe("paid");
    expect((await payments.publicView(s.core.DB, r.public_id)).checkout_url).toBeNull();
  });

  it("repetir el pedido de un pago en efectivo (doble clic) no lo duplica", async () => {
    const b = await budget();
    const key = crypto.randomUUID();
    const a = await cash(b, 1_000_000, { idempotency_key: key });
    const again = await cash(b, 1_000_000, { idempotency_key: key });
    expect(again!.id).toBe(a!.id);
    expect(await payments.listReceived(s.core.DB)).toHaveLength(1);
    expect((await detail(b)).applied_cents).toBe(1_000_000);
    expect((await s.pay.db.prepare("SELECT COUNT(*) AS n FROM payments").first<{ n: number }>())!.n).toBe(1);
  });
});

describe("checkout simulado (piloto) de punta a punta", () => {
  it("aprobar registra el pago simulado y cierra el cobro, pero NO baja el saldo real; no se puede pagar dos veces", async () => {
    const b = await budget();
    const r = await ask(b, 3_000_000, "advance");
    expect((await payments.simulateCheckout(s.core, r.public_id, "approved")).result).toBe("registered");
    expect((await payments.getRequestDetail(s.core.DB, r.id)).status).toBe("paid");
    expect((await detail(b)).balance_cents).toBe(10_000_000); // simulado: no es dinero, no reduce lo que falta cobrar
    expect((await detail(b)).status).toBe("sent");
    expect((await payments.listReceived(s.core.DB))[0]).toMatchObject({ provider: "mock", applied_cents: 0 });
    await expect(payments.simulateCheckout(s.core, r.public_id, "approved")).rejects.toThrow(/ya fue pagado/);
  });
  it("rechazado o pendiente no registra dinero", async () => {
    const b = await budget();
    const r = await ask(b, 3_000_000, "advance");
    expect((await payments.simulateCheckout(s.core, r.public_id, "rejected")).result).toBe("ignored");
    expect((await payments.simulateCheckout(s.core, r.public_id, "pending")).result).toBe("ignored");
    expect(await payments.listReceived(s.core.DB)).toHaveLength(0);
  });
  it("anular un pago libera el presupuesto", async () => {
    const b = await budget();
    const p = (await cash(b, 2_000_000))!;
    expect((await detail(b)).applied_cents).toBe(2_000_000);
    await payments.voidPayment(s.core, p.id, "Cargado por error");
    expect((await detail(b)).applied_cents).toBe(0);
    expect((await payments.listReceived(s.core.DB))[0]).toMatchObject({ status: "voided", void_reason: "Cargado por error" });
  });
});

describe("receptor de avisos de la app (ruta pública)", () => {
  const send = async (body: unknown, opts: { secret?: string; nonce?: string; raw?: string; now?: number } = {}) => {
    const raw = opts.raw ?? JSON.stringify(body);
    const headers = await signRequest({ clientId: CLIENT, secret: opts.secret ?? SECRETS.events, method: "POST", path: "/api/internal/payment-events", body: raw, nonce: opts.nonce, now: opts.now });
    return coreApp.request("/api/internal/payment-events", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: raw }, s.core);
  };
  const event = { id: "e1", type: "payment.approved", entity: "payment", entityId: "no-existe" };

  it("sin firma, con otra clave, vieja o con el cuerpo alterado: 401", async () => {
    expect((await coreApp.request("/api/internal/payment-events", { method: "POST", body: JSON.stringify(event) }, s.core)).status).toBe(401);
    expect((await send(event, { secret: "otra" })).status).toBe(401);
    expect((await send(event, { now: Date.now() - 10 * 60_000 })).status).toBe(401);
    const headers = await signRequest({ clientId: CLIENT, secret: SECRETS.events, method: "POST", path: "/api/internal/payment-events", body: JSON.stringify(event) });
    expect((await coreApp.request("/api/internal/payment-events", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...event, entityId: "otro" }) }, s.core)).status).toBe(401);
  });
  it("un aviso capturado no se puede repetir", async () => {
    const nonce = crypto.randomUUID();
    expect((await send(event, { nonce })).status).toBe(200);
    expect((await send(event, { nonce })).status).toBe(401);
  });
  it("un aviso mal formado se rechaza", async () => {
    expect((await send({ id: "x" })).status).toBe(400);
    expect((await send(null, { raw: "no es json" })).status).toBe(400);
  });
  it("un aviso de algo que ya no existe en el servicio de pagos se da por recibido (no se reintenta para siempre)", async () => {
    const res = await send(event);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true });
  });
  it("un aviso nunca trae datos de dinero: aunque se falsifique el contenido, la app consulta el estado real", async () => {
    const b = await budget();
    const r = await ask(b, 3_000_000, "advance");
    // Aviso firmado y válido que "dice" que hubo un pago de otra cosa: la app consulta y no encuentra ese pago
    const res = await send({ id: "e2", type: "payment.approved", entity: "payment", entityId: r.id });
    expect(res.status).toBe(200);
    expect(await payments.listReceived(s.core.DB)).toHaveLength(0);
  });
});

describe("la app no guarda credenciales ni mueve dinero por su cuenta", () => {
  it("la base de la app no tiene columnas de credenciales de proveedores", async () => {
    const cols = (await s.core.DB.prepare("PRAGMA table_info(clinic_settings)").all<{ name: string }>()).results.map((c) => c.name);
    expect(cols.filter((c) => /token|secret|mp_|credential/i.test(c))).toEqual([]);
    const settings = JSON.stringify(await (await s.api("GET", "/api/settings")).json());
    expect(settings).not.toMatch(/token|secret|access/i);
  });
  it("Ajustes informa el estado de los proveedores desde el servicio de pagos", async () => {
    const piloto = await (await s.api("GET", "/api/settings")).json() as any;
    expect(piloto).toMatchObject({ payments_online: true, mp_mock: true, mp_connected: false });
    s.core.PAYMENTS = { fetch: async () => { throw new Error("caído"); } } as unknown as Fetcher;
    expect(await (await s.api("GET", "/api/settings")).json()).toMatchObject({ payments_online: false, mp_connected: false });
  });
  it("el Resumen carga aunque el servicio de pagos no responda", async () => {
    s.core.PAYMENTS = { fetch: async () => { throw new Error("caído"); } } as unknown as Fetcher;
    const res = await s.api("GET", "/api/dashboard?from=2026-11-01&to=2026-11-30");
    expect(res.status).toBe(200);
    expect((await res.json() as any).review_count).toBe(0);
  });
  it("la API de administración exige la clave", async () => {
    expect((await coreApp.request("/api/payments", {}, s.core)).status).toBe(401);
    expect((await coreApp.request("/api/payments/review", {}, s.core)).status).toBe(401);
    expect((await coreApp.request("/api/mercadopago/connect", {}, s.core)).status).toBe(401);
  });
  it("las páginas públicas tienen límite de intentos contra quien prueba links al azar", async () => {
    let limited = false;
    for (let n = 0; n < 80; n++) {
      const res = await coreApp.request(`/api/public/payments/probando${n}`, { headers: { "CF-Connecting-IP": "198.51.100.7" } }, s.core);
      if (res.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
  it("las respuestas de la API no se guardan en caché", async () => {
    const res = await s.api("GET", "/api/payments");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("copia de lectura", () => {
  it("un dato más viejo no pisa uno más nuevo (aviso fuera de orden)", async () => {
    const b = await budget();
    const r = await ask(b, 3_000_000, "advance");
    const remote = await s.pay.db.prepare("SELECT * FROM intents WHERE id = ?").bind(r.id).first<any>();
    await repo.upsertIntent(s.core.DB, { ...remote, status: "paid", version: 5 });
    await repo.upsertIntent(s.core.DB, { ...remote, status: "pending", version: 2 });
    expect((await repo.getRequest(s.core.DB, r.id))!.status).toBe("paid");
  });
  it("acepta un proveedor y un medio de pago nuevos sin migrar nada (hoy Mercado Pago, mañana otro)", async () => {
    await repo.upsertPayment(s.core.DB, { id: "p-nuevo", intent_id: null, reference: "x", provider: "stripe", provider_payment_id: "pi_123", method: "card", source: "provider", kind: "advance", amount_cents: 100, currency: "ARS", status: "approved", paid_at: new Date().toISOString(), payer_label: "Ana", concept: "Pago", notes: "", created_at: new Date().toISOString(), voided_at: null, void_reason: null, version: 1 });
    expect((await repo.getPayment(s.core.DB, "p-nuevo"))).toMatchObject({ provider: "stripe", method: "card", provider_payment_id: "pi_123" });
  });
});

describe("cobros vencidos: se pueden pedir de nuevo", () => {
  it("un anticipo vencido no impide volver a pedirlo ni reserva plata del presupuesto", async () => {
    const b = await budget(10_000_000);
    const old = await ask(b, 3_000_000, "advance", "2020-01-01");
    expect(old.display_status).toBe("expired");
    expect((await detail(b)).requestable_cents).toBe(10_000_000); // el vencido no cuenta como pedido

    const again = await ask(b, 3_000_000, "advance"); // no da "el anticipo ya fue pedido"
    expect(again.display_status).toBe("pending");
    expect((await detail(b)).requestable_cents).toBe(7_000_000);

    // y el vencido se puede cancelar para que no quede suelto
    await payments.cancelRequest(s.core, old.id);
    expect((await payments.getRequestDetail(s.core.DB, old.id)).display_status).toBe("cancelled");
  });
});

describe("cobros en efectivo", () => {
  const askCash = (budgetId: string, amount: number, kind: "advance" | "partial" | "final" = "advance") =>
    payments.createRequest(s.core, { method: "cash", patient_ref: "Ana", concept: "Anticipo", amount_cents: amount, kind, budget_id: budgetId, conditions: "", due_date: null });

  it("se piden como cualquier cobro, pero sin proveedor ni link", async () => {
    const b = await budget();
    const r = await askCash(b, 3_000_000);
    expect(r).toMatchObject({ provider: "cash", checkout_url: null, status: "pending", display_status: "pending" });
    expect(await s.pay.db.prepare("SELECT provider, checkout_url FROM intents WHERE id = ?").bind(r.id).first()).toEqual({ provider: "cash", checkout_url: null });
  });

  it("respetan las mismas reglas: máximo pedible y anticipo una sola vez", async () => {
    const b = await budget(10_000_000);
    await askCash(b, 3_000_000);
    await expect(askCash(b, 2_000_000)).rejects.toThrow(/anticipo/i); // el anticipo ya está pedido
    await expect(askCash(b, 99_000_000, "partial")).rejects.toThrow(/máximo|Lo máximo/i);
  });

  it("la página de pago avisa que se paga en mano (sin botón de pago)", async () => {
    const b = await budget();
    const r = await askCash(b, 3_000_000);
    const view = await payments.publicView(s.core.DB, r.public_id);
    expect(view).toMatchObject({ pay_in_cash: true, checkout_url: null });
  });

  it("cuando se registra el pago en mano, el cobro se cierra y el presupuesto avanza", async () => {
    const b = await budget(10_000_000);
    const r = await askCash(b, 3_000_000);
    await cash(b, 3_000_000, { request_id: r.id, kind: "advance" });
    expect((await payments.getRequestDetail(s.core.DB, r.id)).display_status).toBe("paid");
    expect((await detail(b)).status).toBe("in_progress");
    expect((await detail(b)).applied_cents).toBe(3_000_000);
  });

  it("no se puede 'pagar' online un cobro en efectivo (ni con el checkout simulado)", async () => {
    const b = await budget();
    const r = await askCash(b, 3_000_000);
    await expect(payments.simulateCheckout(s.core, r.public_id, "approved")).rejects.toThrow(/efectivo/);
  });

  it("si no se indica el medio, es online (como antes)", async () => {
    const b = await budget();
    const r = await payments.createRequest(s.core, { patient_ref: "Ana", concept: "Anticipo", amount_cents: 1_000_000, kind: "advance", budget_id: b, conditions: "", due_date: null });
    expect(r.provider).toBe("mock");
  });
});
