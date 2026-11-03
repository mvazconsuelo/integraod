import { describe, expect, it } from "vitest";
import { CLIENT, KEY, makeHarness, SECRETS } from "./helpers/payments-harness";
import { encrypt } from "../src/infrastructure/encryption/aes-gcm";

const intentBody = { reference: "bud-1", description: "Anticipo", payerLabel: "Ana", amountCents: 3_000_000, kind: "advance", dueDate: null };

describe("autenticación entre servicios", () => {
  it("acepta un pedido firmado por la app", async () => {
    const h = makeHarness();
    const res = await h.call("POST", "/v1/intents", intentBody);
    expect(res.status).toBe(201);
  });

  it("rechaza pedidos sin firma, con otra clave o con la firma alterada, siempre con el mismo mensaje", async () => {
    const h = makeHarness();
    const { app } = await import("../src/app");
    const unsigned = await app.request("/v1/providers", {}, h.env);
    const wrongKey = await h.call("GET", "/v1/providers", undefined, { secret: "otra-clave" });
    expect([unsigned.status, wrongKey.status]).toEqual([401, 401]);
    expect(await unsigned.json()).toEqual(await wrongKey.json());
  });

  it("rechaza pedidos viejos y pedidos futuros (ventana de 60 segundos)", async () => {
    const h = makeHarness();
    expect((await h.call("GET", "/v1/providers", undefined, { now: Date.now() - 5 * 60_000 })).status).toBe(401);
    expect((await h.call("GET", "/v1/providers", undefined, { now: Date.now() + 5 * 60_000 })).status).toBe(401);
  });

  it("no deja repetir un pedido capturado (el nonce es de un solo uso)", async () => {
    const h = makeHarness();
    const nonce = crypto.randomUUID();
    expect((await h.call("GET", "/v1/providers", undefined, { nonce })).status).toBe(200);
    expect((await h.call("GET", "/v1/providers", undefined, { nonce })).status).toBe(401);
  });

  it("la firma cubre el cuerpo: cambiar el importe en el camino invalida el pedido", async () => {
    const h = makeHarness();
    const { signRequest } = await import("../src/shared/security/signing");
    const { app } = await import("../src/app");
    const headers = await signRequest({ clientId: CLIENT, secret: SECRETS.core, method: "POST", path: "/v1/intents", body: JSON.stringify(intentBody) });
    const tampered = JSON.stringify({ ...intentBody, amountCents: 1 });
    expect((await app.request("/v1/intents", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: tampered }, h.env)).status).toBe(401);
  });

  it("permite rotar la clave: acepta la anterior mientras dura el cambio", async () => {
    const h = makeHarness();
    // Rotación: la clave nueva pasa a ser la vigente y la anterior se acepta mientras dura el cambio.
    await h.db.prepare("UPDATE clients SET secret_enc = ?, secret_prev_enc = secret_enc WHERE id = ?").bind(await encrypt("clave-nueva", KEY), CLIENT).run();
    expect((await h.call("GET", "/v1/providers", undefined, { secret: SECRETS.core })).status).toBe(200);
    expect((await h.call("GET", "/v1/providers", undefined, { secret: "clave-nueva" })).status).toBe(200);
    expect((await h.call("GET", "/v1/providers", undefined, { secret: "clave-vieja-filtrada" })).status).toBe(401);
  });

  it("todas las respuestas llevan cabeceras de seguridad y no se guardan en caché", async () => {
    const h = makeHarness();
    const res = await h.call("GET", "/v1/providers");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("no filtra credenciales: la lista de proveedores solo dice si están conectados", async () => {
    const h = makeHarness();
    const text = await (await h.call("GET", "/v1/providers")).text();
    expect(text).not.toMatch(/token|secret|client/i);
  });
});
