-- Solicitudes de cobro (lo que se pide) y pagos (dinero realmente recibido).

CREATE TABLE payment_requests (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,            -- aleatorio, no adivinable; va en la URL pública
  external_reference TEXT NOT NULL UNIQUE,   -- referencia estable enviada a Mercado Pago
  patient_ref TEXT NOT NULL,
  concept TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  kind TEXT NOT NULL DEFAULT 'advance' CHECK (kind IN ('advance','partial','final')),
  budget_id TEXT REFERENCES budgets(id),
  conditions TEXT NOT NULL DEFAULT '',
  due_date TEXT,                             -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','partially_paid','paid','cancelled')),
  mp_preference_id TEXT,
  checkout_url TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX idx_requests_status ON payment_requests(status);
CREATE INDEX idx_requests_budget ON payment_requests(budget_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES payment_requests(id),
  patient_ref TEXT NOT NULL,
  concept TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('mercadopago','cash','transfer')),
  source TEXT NOT NULL CHECK (source IN ('mercadopago','manual')),
  kind TEXT NOT NULL DEFAULT 'advance' CHECK (kind IN ('advance','partial','final')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','refunded','voided')),
  paid_at TEXT NOT NULL,
  mp_payment_id TEXT UNIQUE,                 -- garantiza idempotencia de webhooks
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  voided_at TEXT,
  void_reason TEXT,
  CHECK ((source = 'mercadopago') = (mp_payment_id IS NOT NULL))
);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);
CREATE INDEX idx_payments_request ON payments(request_id);

-- Registro de notificaciones recibidas (auditoría; el pago en sí es idempotente por mp_payment_id)
CREATE TABLE webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mp_payment_id TEXT,
  outcome TEXT NOT NULL,                     -- registered | duplicate | ignored | rejected | refunded
  detail TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL
);
