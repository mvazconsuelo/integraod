import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Vite no reconoce node:sqlite como builtin, por eso se carga con require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;

/** Adaptador mínimo de D1 sobre node:sqlite para probar contra SQL real. */
class Stmt {
  private params: unknown[] = [];
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...p: unknown[]) {
    this.params = p;
    return this;
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...(this.params as never[])) as T) ?? null;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[] };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { meta: { changes: Number(r.changes) } };
  }
}

export function createTestDb(_service: "payments" = "payments") {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
  // Cada migración corre en una transacción (como en D1), para que `PRAGMA defer_foreign_keys` tenga efecto.
  for (const f of readdirSync(dir).sort()) { sqlite.exec("BEGIN"); sqlite.exec(readFileSync(join(dir, f), "utf8")); sqlite.exec("COMMIT"); }
  const db = {
    prepare: (sql: string) => new Stmt(sqlite, sql),
    async batch(stmts: Stmt[]) {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return db as unknown as D1Database;
}
