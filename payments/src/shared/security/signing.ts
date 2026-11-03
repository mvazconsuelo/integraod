import { hmacHex, sha256Hex, timingSafeEqual } from "./crypto";

/**
 * Pedidos firmados entre servicios (la app y este servicio no se hablan sin firma).
 * Firma = HMAC-SHA256(secreto, método \n ruta \n instante \n nonce \n hash-del-cuerpo \n cliente).
 * El cliente va dentro de lo firmado: no se puede reusar un pedido firmado por una app haciéndolo pasar por otra.
 * El instante limita la ventana de uso y el nonce, de un solo uso, impide repetir un pedido capturado.
 */
export interface SignedHeaders { "x-svc-client": string; "x-svc-ts": string; "x-svc-nonce": string; "x-svc-sig": string }

const canonical = (method: string, path: string, ts: string, nonce: string, bodyHash: string, clientId: string) => `${method.toUpperCase()}\n${path}\n${ts}\n${nonce}\n${bodyHash}\n${clientId}`;

export async function signRequest(o: { clientId: string; secret: string; method: string; path: string; body?: string; now?: number; nonce?: string }): Promise<SignedHeaders> {
  const ts = String(o.now ?? Date.now());
  const nonce = o.nonce ?? crypto.randomUUID();
  const sig = await hmacHex(canonical(o.method, o.path, ts, nonce, await sha256Hex(o.body ?? ""), o.clientId), o.secret);
  return { "x-svc-client": o.clientId, "x-svc-ts": ts, "x-svc-nonce": nonce, "x-svc-sig": sig };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "stale" | "signature" | "replay" };

export async function verifyRequest(o: {
  clientId: string; secrets: string[]; method: string; path: string; body: string; headers: Headers;
  /** Devuelve true si el nonce ya se usó (y lo registra si no). */
  seen: (nonce: string, expiresAt: number) => Promise<boolean>;
  now?: number; toleranceMs?: number;
}): Promise<VerifyResult> {
  const ts = o.headers.get("x-svc-ts"), nonce = o.headers.get("x-svc-nonce"), sig = o.headers.get("x-svc-sig");
  if (!ts || !nonce || !sig || o.secrets.length === 0) return { ok: false, reason: "missing" };
  const tolerance = o.toleranceMs ?? 60_000;
  const now = o.now ?? Date.now();
  if (!/^\d{10,16}$/.test(ts) || Math.abs(now - Number(ts)) > tolerance) return { ok: false, reason: "stale" };

  const expected = await Promise.all(o.secrets.map(async (s) => hmacHex(canonical(o.method, o.path, ts, nonce, await sha256Hex(o.body), o.clientId), s)));
  if (!expected.some((e) => timingSafeEqual(e, sig))) return { ok: false, reason: "signature" };
  // El nonce se registra recién con una firma válida: nadie puede llenar la tabla sin la clave.
  if (await o.seen(nonce, now + tolerance * 2)) return { ok: false, reason: "replay" };
  return { ok: true };
}
