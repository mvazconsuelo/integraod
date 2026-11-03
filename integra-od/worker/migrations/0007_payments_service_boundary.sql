-- El dinero ahora vive en el servicio de pagos (fuente de verdad). Estas tablas pasan a ser una COPIA DE LECTURA
-- que se actualiza solo con lo que informa ese servicio (aplicar un pago a un presupuesto sigue siendo de la app).
-- También las credenciales de los proveedores salen de esta base.
-- (La tabla de pagos se reconstruye sin PRAGMA: se guardan aparte las aplicaciones, que son sus únicas dependientes.)
-- Solicitudes de cobro: nombres neutros (ya no son solo de Mercado Pago) y versión para no pisar datos nuevos con viejos.
ALTER TABLE payment_requests RENAME COLUMN mp_preference_id TO provider_ref;
ALTER TABLE payment_requests ADD COLUMN provider TEXT NOT NULL DEFAULT 'none';
ALTER TABLE payment_requests ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
UPDATE payment_requests SET provider = CASE
  WHEN checkout_url LIKE '/mock-checkout/%' THEN 'mock'
  WHEN checkout_url IS NOT NULL THEN 'mercadopago'
  ELSE 'none' END;

-- Pagos: se reconstruye la tabla sin las restricciones que la ataban a un único proveedor.
CREATE TABLE payments_new (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES payment_requests(id),
  patient_ref TEXT NOT NULL,
  concept TEXT NOT NULL,
  method TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('provider','manual')),
  provider TEXT NOT NULL DEFAULT 'manual',
  reference TEXT,                              -- presupuesto al que corresponde (lo informa el servicio de pagos)
  kind TEXT NOT NULL DEFAULT 'advance' CHECK (kind IN ('advance','partial','final')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','refunded','voided')),
  paid_at TEXT NOT NULL,
  provider_payment_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  voided_at TEXT,
  void_reason TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (provider, provider_payment_id)
);
INSERT INTO payments_new (id, request_id, patient_ref, concept, method, source, provider, reference, kind, amount_cents, currency, status, paid_at, provider_payment_id, notes, created_at, voided_at, void_reason, version)
SELECT p.id, p.request_id, p.patient_ref, p.concept, p.method,
       CASE p.source WHEN 'mercadopago' THEN 'provider' ELSE 'manual' END,
       CASE WHEN p.mp_payment_id LIKE 'mock_%' THEN 'mock' WHEN p.source = 'mercadopago' THEN 'mercadopago' ELSE 'manual' END,
       (SELECT r.budget_id FROM payment_requests r WHERE r.id = p.request_id),
       p.kind, p.amount_cents, p.currency, p.status, p.paid_at, p.mp_payment_id, p.notes, p.created_at, p.voided_at, p.void_reason, 0
FROM payments p;

-- Respaldo de las aplicaciones (dependen de payments); se quitan para poder reemplazar la tabla y se vuelven a crear idénticas.
CREATE TABLE payment_applications_bak AS SELECT * FROM payment_applications;
DROP TABLE payment_applications;
DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;
CREATE INDEX idx_payments_paid_at ON payments(paid_at);
CREATE INDEX idx_payments_request ON payments(request_id);

CREATE TABLE payment_applications (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  budget_id TEXT NOT NULL REFERENCES budgets(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TEXT NOT NULL,
  voided_at TEXT,
  void_reason TEXT
);
INSERT INTO payment_applications SELECT id, payment_id, budget_id, amount_cents, created_at, voided_at, void_reason FROM payment_applications_bak;
DROP TABLE payment_applications_bak;
CREATE INDEX idx_applications_payment ON payment_applications(payment_id);
CREATE INDEX idx_applications_budget ON payment_applications(budget_id);

-- Los avisos de proveedores ahora los recibe el servicio de pagos.
DROP TABLE webhook_events;

-- Las credenciales de proveedores salen de esta base: viven cifradas solo en el servicio de pagos.
ALTER TABLE clinic_settings DROP COLUMN mp_user_id;
ALTER TABLE clinic_settings DROP COLUMN mp_access_token_enc;
ALTER TABLE clinic_settings DROP COLUMN mp_refresh_token_enc;
ALTER TABLE clinic_settings DROP COLUMN mp_token_expires_at;
ALTER TABLE clinic_settings DROP COLUMN mp_connected_at;

-- Defensa contra repetición de avisos firmados y límite de intentos en páginas públicas.
CREATE TABLE nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
