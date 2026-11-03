import type { EventPublisher } from "../application/ports";
import type { Client } from "../domain/client";
import { signRequest } from "../shared/security/signing";

/** Entrega un aviso a la app de UN cliente: POST firmado con la clave de avisos de esa app, a su dirección. */
export class HttpEventPublisher implements EventPublisher {
  constructor(private client: Client, private fetchImpl: typeof fetch) {}

  async publish(event: { id: string; type: string; entity: string; entityId: string }) {
    const body = JSON.stringify(event);
    const headers = await signRequest({ clientId: this.client.id, secret: this.client.eventsSecret, method: "POST", path: new URL(this.client.eventsUrl).pathname, body });
    const res = await this.fetchImpl(this.client.eventsUrl, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body });
    return { ok: res.ok, status: res.status };
  }
}
