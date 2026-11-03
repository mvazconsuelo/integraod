const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const newId = () => crypto.randomUUID();

/** 128 bits aleatorios: no adivinable, sin datos personales. */
export const newPublicId = () => b64url(crypto.getRandomValues(new Uint8Array(16)));
