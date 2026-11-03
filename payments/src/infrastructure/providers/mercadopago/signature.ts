import { hmacHex, timingSafeEqual } from "../../../shared/security/crypto";

/**
 * Valida x-signature según la documentación de Mercado Pago:
 * manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" firmado con HMAC-SHA256.
 * Si data.id es alfanumérico se usa en minúsculas. Tolerancia de 10 minutos.
 */
export async function verifyMpSignature(i: {
  signatureHeader: string | null; requestId: string | null; dataId: string | undefined; secret: string | undefined; now?: number; toleranceMs?: number;
}): Promise<boolean> {
  if (!i.signatureHeader || !i.requestId || !i.dataId || !i.secret) return false;
  const parts = Object.fromEntries(i.signatureHeader.split(",").map((p) => { const [k, ...v] = p.trim().split("="); return [k, v.join("=")]; }));
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;
  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs((i.now ?? Date.now()) - tsMs) > (i.toleranceMs ?? 10 * 60_000)) return false;
  const id = /^[a-z0-9]+$/i.test(i.dataId) ? i.dataId.toLowerCase() : i.dataId;
  return timingSafeEqual(await hmacHex(`id:${id};request-id:${i.requestId};ts:${ts};`, i.secret), v1);
}
