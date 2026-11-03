-- Qué pasó con cada presupuesto frente al cliente: se compartió, lo aceptó o lo rechazó.
-- Solo se agrega; no se reconstruye nada de lo anterior (no hay evidencia de qué se compartió antes).
--   shared    la persona usó "Compartir" (canal: whatsapp, link, copia...). No prueba que el cliente lo haya visto.
--   accepted  el cliente aceptó (a mano, o porque se le aplicó su primer pago real: canal "payment").
--   declined  el cliente lo rechazó de forma expresa. Cancelar un presupuesto NO es rechazarlo.
-- Para deshacer: DROP TRIGGER budget_events_no_update; DROP TRIGGER budget_events_no_delete; DROP TABLE budget_events;
CREATE TABLE budget_events (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id TEXT NOT NULL REFERENCES budgets(id),
  type      TEXT NOT NULL CHECK (type IN ('shared','accepted','declined')),
  channel   TEXT NOT NULL DEFAULT '',
  at        TEXT NOT NULL
);
CREATE INDEX idx_budget_events ON budget_events(budget_id, type);
CREATE TRIGGER budget_events_no_update BEFORE UPDATE ON budget_events BEGIN SELECT RAISE(ABORT, 'Los eventos no se modifican.'); END;
CREATE TRIGGER budget_events_no_delete BEFORE DELETE ON budget_events BEGIN SELECT RAISE(ABORT, 'Los eventos no se borran.'); END;
