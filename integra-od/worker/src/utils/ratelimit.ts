/** Cuenta intentos por clave en una ventana fija. Devuelve true si todavía se puede. */
export async function allow(db: D1Database, key: string, limit: number, windowSeconds: number, now = Date.now()): Promise<boolean> {
  const cutoff = now - windowSeconds * 1000;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start < ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start < ?3 THEN ?2 ELSE window_start END
       RETURNING count`,
    )
    .bind(key, now, cutoff)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}

/** Mira cuántos intentos lleva la clave en su ventana, sin sumar uno. Sirve para bloquear antes de comprobar nada. */
export async function isBlocked(db: D1Database, key: string, limit: number, windowSeconds: number, now = Date.now()): Promise<boolean> {
  const row = await db.prepare("SELECT window_start, count FROM rate_limits WHERE key = ?").bind(key).first<{ window_start: number; count: number }>();
  return Boolean(row && row.window_start >= now - windowSeconds * 1000 && row.count >= limit);
}

/** No se guarda el IP: solo un hash corto, suficiente para limitar sin conservar el dato. */
export async function clientKey(prefix: string, ip: string | null): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip ?? "unknown")));
  return `${prefix}:${[...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
