import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { app } from "../worker/src/app";
import { LOGIN_MAX_FAILURES } from "../worker/src/middleware/validation";
import type { Env } from "../worker/src/types/env";

const env = () => ({ DB: createTestDb("worker"), ADMIN_TOKEN: "clave-correcta" }) as unknown as Env;
const login = (e: Env, token: string, ip = "198.51.100.1") =>
  app.request("/api/session", { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "CF-Connecting-IP": ip } }, e);

describe("ingreso con clave", () => {
  it("la clave correcta entra; una incorrecta o ninguna, no", async () => {
    const e = env();
    expect((await login(e, "clave-correcta")).status).toBe(200);
    expect((await login(e, "otra")).status).toBe(401);
    expect((await login(e, "")).status).toBe(401);
  });

  it("después de varias claves incorrectas se bloquea, incluso con la clave correcta", async () => {
    const e = env();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) expect((await login(e, `intento-${i}`)).status).toBe(401);
    const blocked = await login(e, "clave-correcta");
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/Esperá unos minutos/);
  });

  it("el bloqueo es por conexión: otra persona sigue pudiendo entrar", async () => {
    const e = env();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await login(e, `intento-${i}`);
    expect((await login(e, "clave-correcta", "198.51.100.1")).status).toBe(429);
    expect((await login(e, "clave-correcta", "203.0.113.7")).status).toBe(200);
  });

  it("los pedidos sin clave no cuentan como intentos fallidos", async () => {
    const e = env();
    for (let i = 0; i < LOGIN_MAX_FAILURES * 2; i++) await login(e, "");
    expect((await login(e, "clave-correcta")).status).toBe(200);
  });

  it("la identidad del negocio es pública y no expone nada más", async () => {
    const e = env();
    const res = await app.request("/api/public/brand", {}, e);
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()) as object).sort()).toEqual(["logo_data_url", "name"]);
  });
});
