import type { Clock, Deps } from "../application/ports";
import type { Client } from "../domain/client";
import type { Env } from "../shared/env";
import { randomToken } from "../shared/security/crypto";
import { HttpEventPublisher } from "./http-event-publisher";
import { StaticProviderRegistry } from "./providers/registry";
import { D1AuditLog } from "./repositories/d1-audit-log";
import { D1ClientRepository } from "./repositories/d1-client.repository";
import { D1ConnectionStore } from "./repositories/d1-connection-store";
import { D1IntentRepository } from "./repositories/d1-intent.repository";
import { D1NonceStore, D1ProviderEventLog, D1RateLimiter } from "./repositories/d1-misc";
import { D1OutboxRepository } from "./repositories/d1-outbox.repository";
import { D1PaymentRepository } from "./repositories/d1-payment.repository";
import { D1ReviewRepository } from "./repositories/d1-review.repository";
import { D1UnitOfWork } from "./repositories/d1-unit-of-work";

const clock: Clock = {
  now: () => new Date().toISOString(),
  todayAR: () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10), // Argentina: UTC-3, sin horario de verano
};

const providers = new StaticProviderRegistry();
export const providerRegistry = providers;

/**
 * Punto único donde se conectan los puertos con sus implementaciones (D1, fetch, cifrado).
 * Todo queda atado a UN cliente: ninguna consulta puede ver los datos de otro.
 */
export function buildDeps(env: Env, client: Client): Deps {
  // `fetch` suelto no puede llamarse como método de otro objeto en Workers ("Illegal invocation"): se envuelve.
  const rawFetch = env.fetchImpl ?? fetch;
  const fetchImpl: typeof fetch = (input, init) => rawFetch(input, init);
  return {
    env,
    client,
    fetchImpl,
    intents: new D1IntentRepository(env.DB, client.id),
    payments: new D1PaymentRepository(env.DB, client.id),
    review: new D1ReviewRepository(env.DB, client.id),
    outbox: new D1OutboxRepository(env.DB, client.id),
    uow: new D1UnitOfWork(env.DB, clock, client.id),
    audit: new D1AuditLog(env.DB, client.id, clock.now),
    publisher: new HttpEventPublisher(client, fetchImpl),
    providerLog: new D1ProviderEventLog(env.DB, clock, client.id),
    limiter: new D1RateLimiter(env.DB),
    providers,
    connections: new D1ConnectionStore(env.DB, env.TOKEN_ENC_KEY, client.id),
    clock,
    ids: { uuid: () => crypto.randomUUID(), token: randomToken },
  };
}

export const clientRepository = (env: Env) => new D1ClientRepository(env.DB, env.TOKEN_ENC_KEY);
export const nonceStore = (env: Env) => new D1NonceStore(env.DB);
/** Para avisos de proveedores que no pueden atribuirse a un cliente (firma inválida, cliente desconocido). */
export const platformLog = (env: Env) => new D1ProviderEventLog(env.DB, clock, null);
export const platformLimiter = (env: Env) => new D1RateLimiter(env.DB);
