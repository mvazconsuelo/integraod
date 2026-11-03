import { nowIso } from "../utils/dates";

/**
 * Bitácora de la app: quién cambió qué y cuándo. Solo se agrega (la base impide editar o borrar).
 * Guarda datos mínimos (importes, estados, ids): nunca credenciales ni teléfonos.
 */
export interface AuditEntry { action: string; entity: string; entityId: string; detail?: Record<string, unknown> }

export async function audit(db: D1Database, e: AuditEntry, actor = "admin") {
  await db
    .prepare("INSERT INTO audit_log (at, actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(nowIso(), actor, e.action, e.entity, e.entityId, JSON.stringify(e.detail ?? {}))
    .run();
}

export interface AuditRow { seq: number; at: string; actor: string; action: string; entity: string; entity_id: string; detail: string }

export async function auditOf(db: D1Database, entity: string, entityId: string): Promise<AuditRow[]> {
  const { results } = await db.prepare("SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY seq").bind(entity, entityId).all<AuditRow>();
  return results;
}
