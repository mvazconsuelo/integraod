import type { Clock, ProviderEventLog, RateLimiter } from "../../application/ports";
import type { NonceStore } from "../../shared/security/service-auth";

export class D1ProviderEventLog implements ProviderEventLog {
  constructor(private db: D1Database, private clock: Clock, private clientId: string | null) {}
  async log(provider: string, providerPaymentId: string | null, outcome: string, detail: string) {
    await this.db.prepare("INSERT INTO provider_events (client_id, provider, provider_payment_id, outcome, detail, received_at) VALUES (?,?,?,?,?,?)").bind(this.clientId, provider, providerPaymentId, outcome, detail, this.clock.now()).run();
  }
}

/** Límite de intentos por ventana fija. El IP no se guarda: solo un hash corto. */
export class D1RateLimiter implements RateLimiter {
  constructor(private db: D1Database) {}
  async allow(prefix: string, ip: string | null, limit: number, windowSeconds: number, now = Date.now()) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip ?? "unknown")));
    const key = `${prefix}:${[...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const cutoff = now - windowSeconds * 1000;
    const row = await this.db
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
}

/** Nonces ya usados (defensa contra repetición). Los vencidos se limpian de a poco. */
export class D1NonceStore implements NonceStore {
  constructor(private db: D1Database) {}
  async seen(nonce: string, expiresAt: number) {
    const res = await this.db.prepare("INSERT OR IGNORE INTO nonces (nonce, expires_at) VALUES (?, ?)").bind(nonce, expiresAt).run();
    if (Math.random() < 0.02) await this.db.prepare("DELETE FROM nonces WHERE expires_at < ?").bind(Date.now()).run();
    return (res.meta.changes ?? 0) === 0;
  }
}
