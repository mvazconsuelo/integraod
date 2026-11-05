-- Cómo se acordó cobrar un presupuesto (dato aparte del dinero recibido y de los medios de pago de cada movimiento).
--   total    pago total · advance  anticipo + saldo · partial  pagos parciales · NULL  todavía no se definió (no se deduce de los pagos)
-- Para deshacer: ALTER TABLE budgets DROP COLUMN payment_mode;
ALTER TABLE budgets ADD COLUMN payment_mode TEXT CHECK (payment_mode IN ('total','advance','partial'));
