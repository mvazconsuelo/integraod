-- Zona horaria del consultorio (todos los días y períodos se calculan con ella).
-- Para deshacer: ALTER TABLE clinic_settings DROP COLUMN time_zone;
ALTER TABLE clinic_settings ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'America/Argentina/Mendoza';

-- Reservas de cobros: dos pedidos simultáneos no pueden sumar más de lo que falta cobrar.
-- Se toman en una sola sentencia atómica antes de pedirle el cobro al servicio de pagos y se sueltan al terminar.
-- Para deshacer: DROP TABLE request_reservations;
CREATE TABLE request_reservations (
  id           TEXT PRIMARY KEY,
  budget_id    TEXT NOT NULL REFERENCES budgets(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  kind         TEXT NOT NULL CHECK (kind IN ('advance','partial','final')),
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_reservations_budget ON request_reservations(budget_id);

-- Bitácora de la app: quién cambió qué y cuándo. Solo se agrega; no se edita ni se borra.
-- Para deshacer: DROP TRIGGER audit_log_no_update; DROP TRIGGER audit_log_no_delete; DROP TABLE audit_log;
CREATE TABLE audit_log (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'La bitácora no se modifica.'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'La bitácora no se borra.'); END;
