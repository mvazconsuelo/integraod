import { hmacHex, sha256Hex, timingSafeEqual } from "../../utils/crypto";

/**
 * Mismo protocolo que usa el servicio de pagos (ver payments/src/shared/security/signing.ts): HMAC-SHA256 de
 * método, ruta, instante, nonce, hash del cuerpo y cliente. Los dos lados se prueban juntos en tests/stack.
 */
const canonical = (method: string, path: string, ts: string, nonce: string, bodyHash: string, clientId: string) => `${method.toUpperCase()}\n${path}\n${ts}\n${nonce}\n${bodyHash}\n${clientId}`;

export async function signRequest(o: { clientId: string; secret: string; method: string; path: string; body?: string }) {
  const ts = String(Date.now()), nonce = crypto.randomUUID();
  return { "x-svc-client": o.clientId, "x-svc-ts": ts, "x-svc-nonce": nonce, "x-svc-sig": await hmacHex(canonical(o.method, o.path, ts, nonce, await sha256Hex(o.body ?? ""), o.clientId), o.secret) };
}

export async function verifyRequest(o: {
  /** El cliente que ESTA app espera: un aviso firmado para otro no sirve. */
  clientId: string; secrets: string[]; method: string; path: string; body: string; headers: Headers; seen: (nonce: string, expiresAt: number) => Promise<boolean>; toleranceMs?: number;
}): Promise<boolean> {
  const ts = o.headers.get("x-svc-ts"), nonce = o.headers.get("x-svc-nonce"), sig = o.headers.get("x-svc-sig");
  if (!ts || !nonce || !sig || o.secrets.length === 0) return false;
  const tolerance = o.toleranceMs ?? 60_000;
  if (!/^\d{10,16}$/.test(ts) || Math.abs(Date.now() - Number(ts)) > tolerance) return false;
  const bodyHash = await sha256Hex(o.body);
  const ok = (await Promise.all(o.secrets.map((s) => hmacHex(canonical(o.method, o.path, ts, nonce, bodyHash, o.clientId), s)))).some((e) => timingSafeEqual(e, sig));
  if (!ok) return false;
  const replay = await o.seen(nonce, Date.now() + tolerance * 2);
  return !replay;
}
