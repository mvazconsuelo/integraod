import type { ClientRepository } from "../../application/ports";
import type { Client } from "../../domain/client";
import { decrypt } from "../encryption/aes-gcm";

interface Row { id: string; name: string; status: "active" | "suspended"; secret_enc: string; secret_prev_enc: string | null; events_url: string; events_secret_enc: string; app_url: string }

/** Las apps que usan el servicio. Sus claves se guardan cifradas y se descifran solo en memoria. */
export class D1ClientRepository implements ClientRepository {
  constructor(private db: D1Database, private keyB64: string) {}

  private async hydrate(r: Row): Promise<Client> {
    const secrets = [await decrypt(r.secret_enc, this.keyB64)];
    if (r.secret_prev_enc) secrets.push(await decrypt(r.secret_prev_enc, this.keyB64));
    return { id: r.id, name: r.name, status: r.status, secrets, eventsUrl: r.events_url, eventsSecret: await decrypt(r.events_secret_enc, this.keyB64), appUrl: r.app_url };
  }

  /** Solo devuelve clientes activos: uno suspendido deja de poder operar de inmediato. */
  async byId(id: string) {
    const r = await this.db.prepare("SELECT * FROM clients WHERE id = ? AND status = 'active'").bind(id).first<Row>();
    return r ? this.hydrate(r) : null;
  }

  async listActive() {
    const { results } = await this.db.prepare("SELECT * FROM clients WHERE status = 'active' ORDER BY id").all<Row>();
    return Promise.all(results.map((r) => this.hydrate(r)));
  }
}
