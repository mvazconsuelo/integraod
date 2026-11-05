import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeStack, type Stack } from "./helpers/stack";
import { connectMp, mpWebhook } from "../../payments/tests/helpers/payments-harness";
import * as budgets from "../worker/src/services/budgets.service";
import * as payments from "../worker/src/services/payments.service";
import * as apps from "../worker/src/services/payment-applications.service";
import * as paymentsRepo from "../worker/src/repositories/payments.repository";
import { auditOf } from "../worker/src/services/audit.service";
import { getSummary } from "../worker/src/services/dashboard.service";
import { AppError } from "../worker/src/utils/errors";
import { DEFAULT_TIME_ZONE, localDay, localNoon, setTimeZone, todayLocal } from "../worker/src/utils/dates";

// Escenarios funcionales de la auditoría financiera. Importes en centavos: $100.000 = 10_000_000.
const PESOS = (n: number) => n * 100;

let s: Stack;
let db: D1Database;
beforeEach(() => { s = makeStack(); db = s.core.DB; });
afterEach(() => setTimeZone(DEFAULT_TIME_ZONE));

const newBudget = async (total = PESOS(100_000), over: { issued_on?: string; patient?: string } = {}) =>
  (await budgets.createBudget(db, { patient_ref: over.patient ?? "Ana Pérez", issued_on: over.issued_on ?? todayLocal(), valid_until: null, notes: "", items: [{ description: "Tratamiento", quantity: 1, unit_price_cents: total, discount_pct: 0 }] })).id;
const ask = (budgetId: string, amount: number, method: "online" | "cash" = "cash", extra: Record<string, unknown> = {}) =>
  payments.createRequest(s.core, { method, patient_ref: "Ana Pérez", amount_cents: amount, budget_id: budgetId, conditions: "", due_date: null, ...extra });
const cashPay = (budgetId: string, amount: number, extra: Record<string, unknown> = {}) =>
  payments.registerManualPayment(s.core, { patient_ref: "Ana Pérez", amount_cents: amount, method: "cash", budget_id: budgetId, request_id: null, notes: "", ...extra });
const detail = (id: string) => budgets.getBudgetDetail(db, id);
const month = (from: string, to: string) => getSummary(db, from, to);

describe("A · anticipo y pago final", () => {
  it("$100.000: anticipo de $20.000 → saldo $80.000 → pedido y pago de $80.000 → completado", async () => {
    const id = await newBudget();
    const advance = await ask(id, PESOS(20_000));
    expect(advance.kind).toBe("advance"); // lo decide el sistema
    expect((await detail(id)).balance_cents).toBe(PESOS(100_000)); // pedido ≠ cobrado
    expect((await detail(id)).status).toBe("sent");

    await cashPay(id, PESOS(20_000), { request_id: advance.id });
    let d = await detail(id);
    expect(d).toMatchObject({ balance_cents: PESOS(80_000), status: "in_progress", paid_percent: 20 });

    const rest = await ask(id, PESOS(80_000));
    expect(rest.kind).toBe("final");
    await cashPay(id, PESOS(80_000), { request_id: rest.id });
    d = await detail(id);
    expect(d).toMatchObject({ balance_cents: 0, status: "completed", paid_percent: 100 });
  });
});

describe("B · múltiples pagos parciales", () => {
  it("20 + 30 + 25 = saldo $25.000; el último pago completa", async () => {
    const id = await newBudget();
    await cashPay(id, PESOS(20_000));
    await cashPay(id, PESOS(30_000));
    await cashPay(id, PESOS(25_000));
    expect(await detail(id)).toMatchObject({ balance_cents: PESOS(25_000), status: "in_progress", paid_percent: 75 });
    await cashPay(id, PESOS(25_000));
    expect(await detail(id)).toMatchObject({ balance_cents: 0, status: "completed" });
  });

  it("el primer pago es anticipo, los siguientes parciales y el que cierra, final (lo decide el servidor)", async () => {
    const id = await newBudget();
    for (const amount of [20_000, 30_000, 50_000]) await cashPay(id, PESOS(amount), { kind: "advance" }); // aunque el cliente diga otra cosa
    const kinds = (await payments.listReceived(db)).sort((a, b) => a.amount_cents - b.amount_cents).map((p) => p.kind);
    expect(kinds).toEqual(["advance", "partial", "final"]);
  });
});

describe("C · una solicitud pendiente no es dinero", () => {
  it("pedir $30.000 y no cobrarlos: recibido 0, saldo $100.000 y el Resumen no lo cuenta como ingreso", async () => {
    const id = await newBudget();
    await ask(id, PESOS(30_000));
    const d = await detail(id);
    expect(d).toMatchObject({ applied_cents: 0, balance_cents: PESOS(100_000), status: "sent" });
    const sum = await month(todayLocal(), todayLocal());
    expect(sum.collected_cents).toBe(0);
    expect(sum.advances_collected_cents).toBe(0);
    expect(sum.advances_requested_cents).toBe(PESOS(30_000)); // pedido sí; cobrado no
    expect(sum.budgets_balance_cents).toBe(0); // Por cobrar: solo presupuestos En curso
  });
});

describe("D · pago duplicado", () => {
  it("la misma notificación dos veces deja un solo pago y una sola aplicación", async () => {
    s = makeStack({ mock: false });
    db = s.core.DB;
    await connectMp(s.pay);
    const id = await newBudget(PESOS(100_000));
    const r = await ask(id, PESOS(20_000), "online");
    s.pay.mp.set("777", { id: 777, status: "approved", transaction_amount: 20000, currency_id: "ARS", external_reference: r.external_reference, date_approved: "2026-11-02T15:00:00.000-03:00" });
    await mpWebhook(s.pay, "777");
    await mpWebhook(s.pay, "777");
    expect(await payments.listReceived(db)).toHaveLength(1);
    const d = await detail(id);
    expect(d.applications).toHaveLength(1);
    expect(d.balance_cents).toBe(PESOS(80_000));
  });
});

describe("E · cancelación", () => {
  it("con un pago parcial no se cancela: informa los pagos y conserva todo; resuelto el pago, se puede", async () => {
    const id = await newBudget();
    const r = await ask(id, PESOS(30_000));
    await cashPay(id, PESOS(30_000), { request_id: r.id });

    const err = await budgets.changeStatus(db, id, "cancelled").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("has_payments");
    expect(err.message).toMatch(/pagos aplicados/);
    expect(err.details.payments).toHaveLength(1);
    expect(err.details.payments[0]).toMatchObject({ amount_cents: PESOS(30_000), method: "cash" });
    expect((await detail(id)).status).toBe("in_progress"); // nada cambió
    expect(await payments.listReceived(db)).toHaveLength(1);

    // Se resuelve de forma explícita (anulando la aplicación, con motivo), nada se borra ni se desasocia solo.
    await apps.voidApplication(db, (await detail(id)).applications[0].id as string, "Devolución al paciente");
    expect((await budgets.changeStatus(db, id, "cancelled")).status).toBe("cancelled");
    const [p] = await payments.listReceived(db);
    expect(p).toMatchObject({ status: "approved", available_cents: PESOS(30_000) }); // el dinero sigue registrado
    const events = (await detail(id)).timeline.map((e) => e.title);
    expect(events).toEqual(expect.arrayContaining(["Presupuesto creado", "Pago anulado", "Pasó a Cancelado"]));
  });
});

describe("F · pago sin presupuesto", () => {
  it("figura sin presupuesto, se asigna después y no se cuenta dos veces", async () => {
    const id = await newBudget();
    const paymentId = crypto.randomUUID();
    const now = new Date().toISOString();
    await paymentsRepo.upsertPayment(db, { id: paymentId, intent_id: null, reference: "sin-presupuesto", provider: "manual", provider_payment_id: null, method: "transfer", source: "manual", kind: "partial", amount_cents: PESOS(20_000), currency: "ARS", status: "approved", paid_at: now, payer_label: "Ana", concept: "Pago", notes: "", created_at: now, voided_at: null, void_reason: null, version: 1 });

    let sum = await month(todayLocal(), todayLocal());
    expect(sum.money_unapplied_cents).toBe(PESOS(20_000));
    expect(sum.collected_cents).toBe(PESOS(20_000));
    expect((await detail(id)).applied_cents).toBe(0);

    await apps.applyPayment(db, paymentId, id, PESOS(20_000));
    sum = await month(todayLocal(), todayLocal());
    expect(sum.money_unapplied_cents).toBe(0);
    expect(sum.collected_cents).toBe(PESOS(20_000)); // el mismo dinero: no se suma otra vez
    expect(await detail(id)).toMatchObject({ applied_cents: PESOS(20_000), status: "in_progress" });
  });
});

describe("G · Resumen por períodos", () => {
  it("cada total coincide con los pagos reales del período", async () => {
    const id = await newBudget(PESOS(200_000), { issued_on: "2026-10-05" });
    await cashPay(id, PESOS(20_000), { paid_on: "2026-10-31" }); // anticipo de octubre
    await cashPay(id, PESOS(30_000), { paid_on: "2026-11-01" });
    await cashPay(id, PESOS(10_000), { paid_on: "2026-11-30" });
    await cashPay(id, PESOS(40_000), { paid_on: "2026-12-01" });
    const cancelled = await newBudget(PESOS(50_000), { issued_on: "2026-11-10", patient: "Beto Ríos" });
    await budgets.changeStatus(db, cancelled, "cancelled");
    await newBudget(PESOS(60_000), { issued_on: "2026-11-12", patient: "Carla Sosa" }); // Enviado, sin pagos
    await ask(await newBudget(PESOS(10_000), { issued_on: "2026-11-20", patient: "Dana Paz" }), PESOS(3_000)); // pedido, sin cobrar

    const nov = await month("2026-11-01", "2026-11-30");
    expect(nov.collected_cents).toBe(PESOS(40_000)); // 30.000 + 10.000
    expect(nov.previous_collected_cents).toBe(PESOS(20_000)); // octubre
    expect(nov.advances_collected_cents).toBe(0); // el anticipo fue en octubre
    expect(nov.budgets_issued).toEqual({ count: 2, total: PESOS(70_000) }); // sin el cancelado: Carla y Dana
    expect(nov.by_method).toEqual([{ method: "cash", total_cents: PESOS(40_000) }]);

    // Los pedidos se fechan cuando se crean (hoy): cuentan en el período de hoy y no en noviembre del ejemplo.
    expect((await month(todayLocal(), todayLocal())).advances_requested_cents).toBe(PESOS(3_000));

    // Control (definiciones en dashboard.service)
    expect(nov.budgets_emitted_count).toBe(3); // Beto (cancelado), Carla y Dana
    expect(nov.jobs_concreted).toEqual({ count: 0, total_cents: 0 }); // el único con pagos se aceptó en octubre
    expect(nov.average_job_cents).toBeNull();
    expect(nov.acceptance).toEqual({ emitted: 3, shared: 0, accepted: 0, declined: 1, waiting: 2, rate_pct: 0 }); // el cancelado cuenta como rechazado; Carla y Dana esperan y no entran en la tasa
    expect(nov.payments_count).toBe(2); // 1/11 y 30/11
    expect(nov.advances_received_count).toBe(0);
    expect(nov.open_jobs_count).toBe(1); // el trabajo con pagos y saldo
    const oct = await month("2026-10-01", "2026-10-31");
    expect(oct.jobs_concreted).toEqual({ count: 1, total_cents: PESOS(200_000) }); // aceptado con su primer pago, el 31/10
    expect(oct.average_job_cents).toBe(PESOS(200_000));
    expect(oct.acceptance).toEqual({ emitted: 1, shared: 0, accepted: 1, declined: 0, waiting: 0, rate_pct: 100 });
    expect(oct.advances_received_count).toBe(1);
    expect(oct.payments_count).toBe(1);

    expect(oct.collected_cents).toBe(PESOS(20_000));
    expect(oct.advances_collected_cents).toBe(PESOS(20_000));

    const custom = await month("2026-11-01", "2026-11-15");
    expect(custom.collected_cents).toBe(PESOS(30_000));

    // Por cobrar: solo el saldo de lo En curso (200.000 − 100.000 aplicados); no los enviados sin pagos ni el cancelado.
    expect(nov.budgets_balance_cents).toBe(PESOS(100_000));
    expect(nov.pipeline.find((p) => p.status === "sent")?.count).toBe(2);
  });
});

describe("reglas de la auditoría", () => {
  it("dos pedidos simultáneos por todo el saldo: solo uno pasa", async () => {
    const id = await newBudget();
    const results = await Promise.allSettled([ask(id, PESOS(100_000)), ask(id, PESOS(100_000))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await detail(id)).requestable_cents).toBe(0);
  });

  it("dos anticipos a la vez: solo uno pasa", async () => {
    const id = await newBudget();
    const results = await Promise.allSettled([ask(id, PESOS(10_000)), ask(id, PESOS(10_000))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("no se puede pedir un segundo anticipo, ni con un pedido directo", async () => {
    const id = await newBudget();
    await ask(id, PESOS(10_000));
    await expect(ask(id, PESOS(10_000), "cash", { kind: "advance" })).rejects.toMatchObject({ code: "advance_exists" });
    const second = await ask(id, PESOS(10_000)); // sin pedirlo "a propósito": es un pago parcial
    expect(second.kind).toBe("partial");
  });

  it("el estado nunca se desvía: editar el total completa o reabre el presupuesto", async () => {
    const id = await newBudget(PESOS(100_000));
    await cashPay(id, PESOS(100_000));
    expect((await detail(id)).status).toBe("completed");
    const d = await detail(id);
    const input = { patient_ref: d.patient_ref, patient_id: d.patient_id, issued_on: d.issued_on, valid_until: null, notes: "", items: [{ description: "Tratamiento", quantity: 1, unit_price_cents: PESOS(120_000), discount_pct: 0 }] };
    expect((await budgets.updateBudget(db, id, input)).status).toBe("in_progress"); // subió el total
    input.items[0].unit_price_cents = PESOS(100_000);
    expect((await budgets.updateBudget(db, id, input)).status).toBe("completed");
  });

  it("la bitácora registra los cambios y no se puede editar ni borrar", async () => {
    const id = await newBudget();
    await cashPay(id, PESOS(10_000));
    const log = await auditOf(db, "budget", id);
    expect(log.map((e) => e.action)).toEqual(["budget.created", "budget.status"]);
    expect(JSON.parse(log[1].detail)).toMatchObject({ from: "sent", to: "in_progress", by: "system" });
    await expect(db.prepare("UPDATE audit_log SET action = 'x'").run()).rejects.toThrow(/no se modifica/);
    await expect(db.prepare("DELETE FROM audit_log").run()).rejects.toThrow(/no se borra/);
  });

  it("los pagos simulados del piloto no suman: se informan aparte", async () => {
    const id = await newBudget();
    const r = await ask(id, PESOS(20_000), "online"); // checkout simulado
    await payments.simulateCheckout(s.core, r.public_id, "approved");
    const sum = await month(todayLocal(), todayLocal());
    expect(sum).toMatchObject({ collected_cents: 0, advances_collected_cents: 0, money_unapplied_cents: 0 });
    expect(sum.simulated).toEqual({ payments_count: 1, total_cents: PESOS(20_000) });
  });
});

describe("zona horaria del consultorio", () => {
  it("el día depende de la zona configurada", () => {
    const instant = "2026-03-01T01:00:00Z";
    expect(localDay(instant)).toBe("2026-02-28"); // Mendoza (UTC-3, por defecto)
    setTimeZone("Europe/Madrid");
    expect(localDay(instant)).toBe("2026-03-01");
    expect(localNoon("2026-03-01")).toBe("2026-03-01T11:00:00.000Z");
    setTimeZone("zona-inventada"); // una zona inválida vuelve a la de siempre
    expect(localDay(instant)).toBe("2026-02-28");
  });

  it("se guarda en Configuración y se aplica a los pedidos siguientes", async () => {
    const before = await (await s.api("GET", "/api/settings")).json() as any;
    expect(before.time_zone).toBe("America/Argentina/Mendoza");
    const { payments_online: _a, mp_connected: _b, mp_mock: _c, id: _d, updated_at: _e, fee_estimate_bps: _f, ...profile } = before;
    const res = await s.api("PUT", "/api/settings", { ...profile, time_zone: "Europe/Madrid" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).time_zone).toBe("Europe/Madrid");
    expect((await s.api("PUT", "/api/settings", { ...profile, time_zone: "nada" })).status).toBe(400);
    const log = await auditOf(db, "settings", "1");
    expect(JSON.parse(log[0].detail)).toMatchObject({ time_zone: "Europe/Madrid", time_zone_before: "America/Argentina/Mendoza" });
  });
});

describe("Actividad: historial en frases", () => {
  it("cuenta lo que pasó, en orden, con lo que queda pendiente y sin inventar nada", async () => {
    const id = await newBudget(PESOS(250_000), { patient: "Juan Pérez" });
    const who = { patient_ref: "Juan Pérez" };
    const r = await ask(id, PESOS(75_000), "cash", who);
    await cashPay(id, PESOS(30_000), who);
    await cashPay(id, PESOS(30_000), { ...who, request_id: r.id });
    const res = await s.api("GET", "/api/activity");
    expect(res.status).toBe(200);
    const feed = (await res.json()) as { text: string; detail?: string; to: string }[];
    const texts = feed.map((e) => e.text);
    expect(texts).toEqual(expect.arrayContaining([
      "Creaste un presupuesto para Juan Pérez",
      expect.stringMatching(/^Anticipo pendiente de .*75\.000.* de Juan Pérez, sin link de pago$/),
    ]));
    const received = feed.filter((e) => e.text.startsWith("Recibiste"));
    expect(received).toHaveLength(2);
    expect(received.map((e) => e.detail)).toEqual([expect.stringMatching(/Quedan .*190\.000/), expect.stringMatching(/Quedan .*220\.000/)]); // del más nuevo al más viejo
    expect(feed.find((e) => e.text.startsWith("Creaste"))!.to).toBe(`/presupuestos/${id}`);
    expect(feed.length).toBe(4); // presupuesto, cobro y dos pagos: nada más
  });

  it("pide la clave y marca lo simulado", async () => {
    const id = await newBudget(PESOS(10_000));
    const r = await ask(id, PESOS(2_000), "online");
    await payments.simulateCheckout(s.core, r.public_id, "approved");
    const feed = (await (await s.api("GET", "/api/activity")).json()) as { simulated?: boolean; text: string }[];
    expect(feed.filter((e) => e.simulated).length).toBeGreaterThanOrEqual(2); // el cobro y el pago del piloto
    const anon = await (await import("../worker/src/app")).app.request("/api/activity", {}, s.core);
    expect(anon.status).toBe(401);
  });
});

describe("Control: reglas de las métricas", () => {
  it("un pago aplicado a dos presupuestos cuenta una sola vez como pago recibido, y un anticipo anulado deja de contar", async () => {
    const a = await newBudget(PESOS(10_000), { patient: "Ana Pérez" });
    const b = await newBudget(PESOS(10_000), { patient: "Beto Ríos" });
    const paymentId = crypto.randomUUID();
    const now = new Date().toISOString();
    await paymentsRepo.upsertPayment(db, { id: paymentId, intent_id: null, reference: "sin-presupuesto", provider: "manual", provider_payment_id: null, method: "cash", source: "manual", kind: "advance", amount_cents: PESOS(10_000), currency: "ARS", status: "approved", paid_at: now, payer_label: "X", concept: "Pago", notes: "", created_at: now, voided_at: null, void_reason: null, version: 1 });
    await apps.applyPayment(db, paymentId, a, PESOS(6_000));
    await apps.applyPayment(db, paymentId, b, PESOS(4_000)); // un solo pago repartido en dos presupuestos
    const sum = await month(todayLocal(), todayLocal());
    expect(sum.payments_count).toBe(1);
    expect(sum.collected_cents).toBe(PESOS(10_000));
    expect(sum.advances_received_count).toBe(2); // dos presupuestos recibieron ese anticipo
    expect(sum.jobs_concreted.count).toBe(2);
    await apps.voidApplication(db, ((await detail(a)).applications[0] as { id: string }).id, "Error");
    const after = await month(todayLocal(), todayLocal());
    expect(after.advances_received_count).toBe(1);
    expect(after.jobs_concreted.count).toBe(1); // el anulado ya no está aceptado
  });

  it("los pagos simulados no aceptan presupuestos ni cuentan como pagos o anticipos", async () => {
    const id = await newBudget(PESOS(10_000));
    const r = await ask(id, PESOS(2_000), "online");
    await payments.simulateCheckout(s.core, r.public_id, "approved");
    const sum = await month(todayLocal(), todayLocal());
    expect(sum).toMatchObject({ payments_count: 0, advances_received_count: 0, jobs_concreted: { count: 0, total_cents: 0 }, average_job_cents: null });
    expect(sum.acceptance).toMatchObject({ accepted: 0, waiting: 1, rate_pct: null }); // espera respuesta: no hay tasa todavía
  });

  it("la tasa cuenta aceptados (pagaron) y rechazados (expresos o cancelados): 2 y 2 dan 50 %; no responder no la cambia", async () => {
    const yes1 = await newBudget(PESOS(10_000), { issued_on: "2026-11-02" });
    const yes2 = await newBudget(PESOS(30_000), { issued_on: "2026-11-03" });
    const no = await newBudget(PESOS(5_000), { issued_on: "2026-11-04" });
    const cancelled = await newBudget(PESOS(6_000), { issued_on: "2026-11-05" });
    await newBudget(PESOS(7_000), { issued_on: "2026-11-06" }); // sin responder
    await cashPay(yes1, PESOS(1_000), { paid_on: "2026-11-10" });
    await cashPay(yes2, PESOS(3_000), { paid_on: "2026-11-12" });
    await budgets.recordShared(db, no, "whatsapp");
    await budgets.recordAnswer(db, no, "declined");
    await budgets.changeStatus(db, cancelled, "cancelled"); // cancelar se entiende como rechazo del cliente
    const nov = await month("2026-11-01", "2026-11-30");
    expect(nov.acceptance).toEqual({ emitted: 5, shared: 1, accepted: 2, declined: 2, waiting: 1, rate_pct: 50 });
    expect(nov.jobs_concreted).toEqual({ count: 2, total_cents: PESOS(40_000) });
    expect(nov.average_job_cents).toBe(PESOS(20_000)); // (10.000 + 30.000) ÷ 2: el importe de cada presupuesto aceptado, no lo cobrado
  });
});
