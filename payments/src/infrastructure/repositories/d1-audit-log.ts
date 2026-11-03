import type { AuditLog } from "../../application/ports";
import { rowHash, type AuditEntry } from "../../shared/security/hash-chain";

/** Bitácora de solo agregar (la base además lo impide con triggers) y encadenada por hash (una cadena por cliente). */
export class D1AuditLog implements AuditLog {
  constructor(private db: D1Database, private clientId: string, private now: () => string = () => new Date().toISOString()) {}

  async record(e: AuditEntry): Promise<void> {
    const at = this.now();
    const detail = JSON.stringify(e.detail ?? {});
    // Si dos escrituras compiten por la misma "fila anterior", la segunda reintenta con la nueva cadena.
    for (let attempt = 0; attempt < 6; attempt++) {
      const last = await this.db.prepare("SELECT hash FROM audit_log WHERE client_id = ? ORDER BY seq DESC LIMIT 1").bind(this.clientId).first<{ hash: string }>();
      const prev = last?.hash ?? "";
      const hash = await rowHash(prev, at, e, detail);
      const res = await this.db
        .prepare(
          `INSERT INTO audit_log (client_id, at, actor, action, entity, entity_id, detail, prev_hash, hash)
           SELECT ?9, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
           WHERE COALESCE((SELECT hash FROM audit_log WHERE client_id = ?9 ORDER BY seq DESC LIMIT 1), '') = ?7`,
        )
        .bind(at, e.actor, e.action, e.entity, e.entityId, detail, prev, hash, this.clientId)
        .run();
      if ((res.meta.changes ?? 0) > 0) return;
    }
    throw new Error("No se pudo escribir en la bitácora de auditoría");
  }

  async verify() {
    const { results } = await this.db
      .prepare("SELECT seq, at, actor, action, entity, entity_id, detail, prev_hash, hash FROM audit_log WHERE client_id = ? ORDER BY seq")
      .bind(this.clientId)
      .all<{ seq: number; at: string; actor: string; action: string; entity: string; entity_id: string; detail: string; prev_hash: string; hash: string }>();
    let prev = "";
    for (const r of results) {
      const expected = await rowHash(prev, r.at, { actor: r.actor, action: r.action, entity: r.entity, entityId: r.entity_id }, r.detail);
      if (r.prev_hash !== prev || r.hash !== expected) return { ok: false, count: results.length, brokenAt: r.seq };
      prev = r.hash;
    }
    return { ok: true, count: results.length };
  }
}
