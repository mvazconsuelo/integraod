-- Detalle libre de cada concepto del presupuesto (medidas, materiales, qué incluye...). Sale en el presupuesto impreso.
-- Para deshacer: ALTER TABLE budget_items DROP COLUMN detail;
ALTER TABLE budget_items ADD COLUMN detail TEXT NOT NULL DEFAULT '';
