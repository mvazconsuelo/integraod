import { beforeEach, describe, expect, it } from "vitest";
import { makeStack, type Stack } from "./helpers/stack";
import { app } from "../worker/src/app";

// El logo es un archivo (R2), no un dato de la base: en la base solo queda su versión.
let s: Stack;
beforeEach(() => { s = makeStack(); });

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const upload = (bytes: Uint8Array, type: string) =>
  app.request("/api/settings/logo", { method: "PUT", headers: { Authorization: "Bearer admin-token", "content-type": type }, body: bytes }, s.core);
const get = (path: string) => app.request(path, { headers: { Authorization: "Bearer admin-token" } }, s.core);

describe("logo como archivo", () => {
  it("se sube, queda como archivo (no como texto en la base) y se sirve con su tipo y cache largo", async () => {
    const res = await upload(PNG, "image/png");
    expect(res.status).toBe(200);
    const settings = (await res.json()) as { logo_url: string; logo_data_url?: unknown };
    expect(settings.logo_url).toMatch(/^\/api\/public\/logo\?v=\d+$/);
    expect("logo_data_url" in settings).toBe(false);
    const row = await s.core.DB.prepare("SELECT logo_data_url, logo_version FROM clinic_settings WHERE id = 1").first<{ logo_data_url: string | null; logo_version: number }>();
    expect(row!.logo_data_url).toBeNull();
    expect(row!.logo_version).toBeGreaterThan(0);
    const file = await app.request("/api/public/logo", {}, s.core); // público: lo ve el ingreso y quien paga
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("cache-control")).toContain("immutable");
    expect(file.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
  });
  it("el ingreso y la página de pago informan la dirección del logo, no el archivo", async () => {
    await upload(PNG, "image/png");
    const brand = (await (await app.request("/api/public/brand", {}, s.core)).json()) as { name: string; logo_url: string };
    expect(brand.logo_url).toMatch(/^\/api\/public\/logo\?v=\d+$/);
  });
  it("solo con clave se sube o se quita", async () => {
    const res = await app.request("/api/settings/logo", { method: "PUT", headers: { "content-type": "image/png" }, body: PNG }, s.core);
    expect(res.status).toBe(401);
    expect((await app.request("/api/settings/logo", { method: "DELETE" }, s.core)).status).toBe(401);
  });
  it("rechaza formatos no válidos, vacíos, pesados y SVG con código", async () => {
    expect((await upload(PNG, "application/pdf")).status).toBe(422);
    expect((await upload(new Uint8Array(0), "image/png")).status).toBe(422);
    expect((await upload(new Uint8Array(200 * 1024 + 1), "image/png")).status).toBe(422);
    const evil = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(evil, "image/svg+xml")).status).toBe(422);
    const ok = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    expect((await upload(ok, "image/svg+xml")).status).toBe(200);
  });
  it("se quita: sin archivo y sin versión; el logo público da 404", async () => {
    await upload(PNG, "image/png");
    const res = await app.request("/api/settings/logo", { method: "DELETE", headers: { Authorization: "Bearer admin-token" } }, s.core);
    expect(((await res.json()) as { logo_url: string | null }).logo_url).toBeNull();
    expect((await app.request("/api/public/logo", {}, s.core)).status).toBe(404);
  });
  it("un logo guardado como texto en la base (datos viejos) pasa a archivo y el texto se borra", async () => {
    const dataUrl = "data:image/png;base64," + btoa(String.fromCharCode(...PNG));
    await s.core.DB.prepare("UPDATE clinic_settings SET logo_data_url = ?, logo_version = NULL WHERE id = 1").bind(dataUrl).run();
    const settings = (await (await get("/api/settings")).json()) as { logo_url: string | null };
    expect(settings.logo_url).toMatch(/^\/api\/public\/logo\?v=\d+$/);
    const row = await s.core.DB.prepare("SELECT logo_data_url FROM clinic_settings WHERE id = 1").first<{ logo_data_url: string | null }>();
    expect(row!.logo_data_url).toBeNull();
    expect(new Uint8Array(await (await app.request("/api/public/logo", {}, s.core)).arrayBuffer())).toEqual(PNG);
  });
  it("guardar la configuración no toca el logo", async () => {
    await upload(PNG, "image/png");
    const cfg = (await (await get("/api/settings")).json()) as Record<string, unknown>;
    const { logo_url: before, payments_online: _a, mp_connected: _b, mp_mock: _c, ...profile } = cfg;
    await s.api("PUT", "/api/settings", { ...profile, name: "Otro nombre" });
    expect(((await (await get("/api/settings")).json()) as { logo_url: string }).logo_url).toBe(before);
  });
});
