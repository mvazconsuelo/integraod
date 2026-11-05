-- Medio de cobro elegido para un presupuesto (informa el mensaje de WhatsApp y el detalle; no cambia saldos ni pagos):
--   mercadopago · transfer · cash · NULL  todavía no se eligió
-- Y los datos para transferir del negocio (titular, CBU/CVU y alias): van en el mensaje cuando el medio es transferencia.
-- Para deshacer: ALTER TABLE budgets DROP COLUMN collect_method; ALTER TABLE clinic_settings DROP COLUMN bank_holder; (idem bank_cbu, bank_alias)
ALTER TABLE budgets ADD COLUMN collect_method TEXT CHECK (collect_method IN ('mercadopago','transfer','cash'));
ALTER TABLE clinic_settings ADD COLUMN bank_holder TEXT NOT NULL DEFAULT '';
ALTER TABLE clinic_settings ADD COLUMN bank_cbu TEXT NOT NULL DEFAULT '';
ALTER TABLE clinic_settings ADD COLUMN bank_alias TEXT NOT NULL DEFAULT '';
