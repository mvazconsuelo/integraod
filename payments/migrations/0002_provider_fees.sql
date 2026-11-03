-- Comisión que se llevó el proveedor en cada pago y lo que le queda al negocio.
-- NULL = no se sabe (el proveedor todavía no lo informó) o no aplica (efectivo: no hay comisión).
ALTER TABLE payments ADD COLUMN fee_cents INTEGER CHECK (fee_cents IS NULL OR fee_cents >= 0);
ALTER TABLE payments ADD COLUMN net_cents INTEGER CHECK (net_cents IS NULL OR net_cents >= 0);
