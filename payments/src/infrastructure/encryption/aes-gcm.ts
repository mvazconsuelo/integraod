const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(keyB64: string) {
  const raw = fromB64(keyB64);
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY debe ser de 32 bytes en base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Cifra con AES-GCM y un IV aleatorio por cada cifrado: el mismo texto nunca produce el mismo resultado. */
export async function encrypt(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), new TextEncoder().encode(plain)));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function decrypt(payload: string, keyB64: string): Promise<string> {
  const [iv, ct] = payload.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await aesKey(keyB64), fromB64(ct)));
}
