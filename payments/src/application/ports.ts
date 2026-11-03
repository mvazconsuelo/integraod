import type { Env } from "../shared/env";
import type { AuditEntry } from "../shared/security/hash-chain";
import type { Client } from "../domain/client";
import type { ConnectionStore, ProviderContext, ProviderRegistry } from "../domain/payment-provider.interface";
import type { DomainEvent, IntentRow, NewIntent, NewPayment, PaymentRow, ReviewItem } from "../domain/payment.types";

/**
 * Puertos: lo que los casos de uso necesitan del mundo exterior. La capa de aplicación solo conoce estas interfaces;
 * la infraestructura (D1, fetch, cifrado) las implementa. Así las reglas se pueden probar y cambiar sin tocar la base.
 */

/** Una escritura pendiente. Es opaca para la aplicación: se arma en un repositorio y se confirma en una unidad de trabajo. */
export type Write = { readonly __write: unique symbol };

export interface IntentRepository {
  byId(id: string): Promise<IntentRow | null>;
  byPublicId(publicId: string): Promise<IntentRow | null>;
  byExternalReference(ref: string): Promise<IntentRow | null>;
  countApprovedPayments(intentId: string): Promise<number>;
  insert(i: NewIntent): Write;
  cancel(id: string, at: string): Write;
  /** Recalcula el estado del cobro según lo realmente cobrado. */
  syncStatus(id: string): Write;
}

export interface PaymentRepository {
  byId(id: string): Promise<PaymentRow | null>;
  byIdempotencyKey(key: string): Promise<PaymentRow | null>;
  byProviderPayment(provider: string, providerPaymentId: string): Promise<PaymentRow | null>;
  ofIntent(intentId: string): Promise<PaymentRow[]>;
  insert(p: NewPayment): Write;
  reverse(id: string, status: "refunded" | "voided", reason: string, at: string): Write;
}

export interface ReviewRepository {
  flag(item: { provider: string; providerPaymentId: string; reason: string; amountCents: number; currency: string; externalReference: string | null }, at: string): Promise<void>;
  listOpen(): Promise<ReviewItem[]>;
  dismiss(id: string, reason: string, at: string): Promise<boolean>;
}

export interface OutboxEntry { id: string; type: string; entity: string; entity_id: string; attempts: number }
export interface OutboxRepository {
  due(now: string, limit: number): Promise<OutboxEntry[]>;
  markDelivered(id: string, at: string): Promise<void>;
  markFailed(id: string, attempts: number, nextAttemptAt: string, error: string): Promise<void>;
}

/** Confirma varias escrituras Y sus avisos a la app en una sola operación: si existe el cambio, existe el aviso. */
export interface UnitOfWork { commit(writes: Write[], events: DomainEvent[]): Promise<{ changes: number }[]> }

export interface AuditLog { record(entry: AuditEntry): Promise<void>; verify(): Promise<{ ok: boolean; count: number; brokenAt?: number }> }

/** Entrega un aviso a la app (firmado). */
export interface EventPublisher { publish(event: { id: string; type: string; entity: string; entityId: string }): Promise<{ ok: boolean; status: number }> }

export interface ProviderEventLog { log(provider: string, providerPaymentId: string | null, outcome: string, detail: string): Promise<void> }
export interface RateLimiter { allow(prefix: string, ip: string | null, limit: number, windowSeconds: number): Promise<boolean> }
export interface Clock { now(): string; todayAR(): string }
export interface Ids { uuid(): string; token(): string }

/** Las apps que usan el servicio. Solo para la parte de plataforma (cron, webhooks); los casos de uso trabajan siempre dentro de UN cliente. */
export interface ClientRepository { byId(id: string): Promise<Client | null>; listActive(): Promise<Client[]> }

/** Todo `Deps` está atado a un cliente: sus repositorios solo ven los datos de ese cliente. */
export interface Deps {
  env: Env;
  client: Client;
  fetchImpl: typeof fetch;
  intents: IntentRepository;
  payments: PaymentRepository;
  review: ReviewRepository;
  outbox: OutboxRepository;
  uow: UnitOfWork;
  audit: AuditLog;
  publisher: EventPublisher;
  providerLog: ProviderEventLog;
  limiter: RateLimiter;
  providers: ProviderRegistry;
  connections: ConnectionStore;
  clock: Clock;
  ids: Ids;
}

export const providerContext = (d: Deps): ProviderContext => ({ env: d.env, client: d.client, connections: d.connections, fetchImpl: d.fetchImpl });
