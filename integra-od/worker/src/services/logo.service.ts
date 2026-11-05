import type { Env } from "../types/env";
import { AppError } from "../utils/errors";

/** El logo es un archivo (R2), no un dato de la base. En la base solo queda su versión (clinic_settings.logo_version). */
const KEY = "brand/logo";
export const MAX_LOGO_BYTES = 200 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export const logoUrl = (version: number | null) => (version ? `/api/public/logo?v=${version}` : null);

function checkImage(bytes: Uint8Array, type: string) {
  if (!TYPES.has(type)) throw new AppError(422, "Formato de logo no válido. Usá PNG, JPG, SVG o WebP.");
  if (bytes.length === 0) throw new AppError(422, "El archivo está vacío.");
  if (bytes.length > MAX_LOGO_BYTES) throw new AppError(422, "El logo es muy pesado. Usá una imagen de menos de 200 KB.");
  if (type === "image/svg+xml" && /<script|javascript:|\son\w+\s*=|<foreignObject/i.test(new TextDecoder().decode(bytes))) {
    throw new AppError(422, "Ese SVG tiene contenido no permitido. Exportalo como imagen simple.");
  }
}

export async function saveLogo(env: Env, bytes: Uint8Array, type: string) {
  checkImage(bytes, type);
  await env.FILES.put(KEY, bytes, { httpMetadata: { contentType: type } });
  const version = Date.now();
  await env.DB.prepare("UPDATE clinic_settings SET logo_version = ?, logo_data_url = NULL WHERE id = 1").bind(version).run();
  return version;
}

export async function removeLogo(env: Env) {
  await env.FILES.delete(KEY);
  await env.DB.prepare("UPDATE clinic_settings SET logo_version = NULL, logo_data_url = NULL WHERE id = 1").run();
}

export const readLogo = (env: Env) => env.FILES.get(KEY);

/** Datos de antes: el logo guardado como texto en la base se pasa a archivo (una sola vez) y el texto se borra. */
export async function ensureLogoMigrated(env: Env) {
  const row = await env.DB.prepare("SELECT logo_data_url, logo_version FROM clinic_settings WHERE id = 1").first<{ logo_data_url: string | null; logo_version: number | null }>();
  if (!row?.logo_data_url) return;
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(row.logo_data_url);
  if (m && !row.logo_version) {
    try {
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      await env.FILES.put(KEY, bytes, { httpMetadata: { contentType: m[1] } });
      await env.DB.prepare("UPDATE clinic_settings SET logo_version = ?, logo_data_url = NULL WHERE id = 1").bind(Date.now()).run();
      return;
    } catch { /* un dato viejo ilegible: se descarta abajo */ }
  }
  await env.DB.prepare("UPDATE clinic_settings SET logo_data_url = NULL WHERE id = 1").run();
}
