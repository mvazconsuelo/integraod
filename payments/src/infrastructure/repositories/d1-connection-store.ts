import type { ConnectionStore, ProviderConnection } from "../../domain/payment-provider.interface";
import { decrypt, encrypt } from "../encryption/aes-gcm";

/** Conexiones a proveedores de UN cliente (cada app conecta su propia cuenta): las credenciales se guardan SIEMPRE cifradas y solo se descifran acá, en memoria. */
export class D1ConnectionStore implements ConnectionStore {
  constructor(private db: D1Database, private keyB64: string, private clientId: string) {}

  async get(provider: string): Promise<ProviderConnection | null> {
    const r = await this.db.prepare("SELECT account_id, access_enc, refresh_enc, expires_at FROM provider_connections WHERE client_id = ? AND provider = ?").bind(this.clientId, provider).first<{ account_id: string; access_enc: string; refresh_enc: string; expires_at: string }>();
    if (!r) return null;
    return { accountId: r.account_id, accessToken: await decrypt(r.access_enc, this.keyB64), refreshToken: await decrypt(r.refresh_enc, this.keyB64), expiresAt: r.expires_at };
  }

  async has(provider: string) {
    return Boolean(await this.db.prepare("SELECT 1 AS x FROM provider_connections WHERE client_id = ? AND provider = ?").bind(this.clientId, provider).first());
  }

  async save(provider: string, c: ProviderConnection) {
    await this.db
      .prepare(
        `INSERT INTO provider_connections (client_id, provider, account_id, access_enc, refresh_enc, expires_at, connected_at) VALUES (?7, ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(client_id, provider) DO UPDATE SET account_id = ?2, access_enc = ?3, refresh_enc = ?4, expires_at = ?5`,
      )
      .bind(provider, c.accountId, await encrypt(c.accessToken, this.keyB64), await encrypt(c.refreshToken, this.keyB64), c.expiresAt, new Date().toISOString(), this.clientId)
      .run();
  }

  async remove(provider: string) {
    await this.db.prepare("DELETE FROM provider_connections WHERE client_id = ? AND provider = ?").bind(this.clientId, provider).run();
  }
}
