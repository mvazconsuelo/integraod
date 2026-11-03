-- Corrige el estado guardado de presupuestos que lo calcularon con pagos simulados (provider 'mock').
-- Desde 0013 el saldo real ignora lo simulado; acá se recalcula el estado con la misma regla
-- (completado = saldo real 0, en curso = hay pagos reales, si no "sin pagos"). Los cancelados no se tocan.
-- No cambia ningún importe ni borra nada. Para deshacer no hay vuelta exacta: el estado se deduce de los pagos
-- (los simulados siguen registrados en payment_applications / payments).
UPDATE budgets SET status = CASE
  WHEN total_cents > 0 AND COALESCE((SELECT SUM(a.amount_cents) FROM payment_applications a JOIN payments p ON p.id = a.payment_id
        WHERE a.budget_id = budgets.id AND a.voided_at IS NULL AND p.provider <> 'mock'), 0) >= total_cents THEN 'completed'
  WHEN COALESCE((SELECT SUM(a.amount_cents) FROM payment_applications a JOIN payments p ON p.id = a.payment_id
        WHERE a.budget_id = budgets.id AND a.voided_at IS NULL AND p.provider <> 'mock'), 0) > 0 THEN 'in_progress'
  ELSE 'sent' END
WHERE status IN ('sent','in_progress','completed');
