import { sha256Hex } from "./crypto";

/**
 * Cálculo puro de la bitácora encadenada: hash = SHA-256(hash anterior + datos de la fila).
 * Editar o borrar una fila rompe la cadena. Dónde se guarda es asunto de la infraestructura.
 */
export interface AuditEntry { actor: string; action: string; entity: string; entityId: string; detail?: Record<string, unknown> }

export const rowHash = (prev: string, at: string, e: Omit<AuditEntry, "detail">, detail: string) =>
  sha256Hex(`${prev}|${at}|${e.actor}|${e.action}|${e.entity}|${e.entityId}|${detail}`);
