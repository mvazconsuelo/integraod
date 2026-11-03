-- Comisión de la billetera (Mercado Pago…): la real de cada pago, que informa el servicio de pagos.
-- La estimación para antes de cobrar no se configura: se calcula con los últimos pagos.
ALTER TABLE payments ADD COLUMN fee_cents INTEGER;
ALTER TABLE payments ADD COLUMN net_cents INTEGER;
