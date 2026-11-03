-- Aplicación de pagos a presupuestos (append-only: las anulaciones marcan voided_at)
-- y eventos económicos de cancelaciones/inasistencias.

CREATE TABLE payment_applications (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  budget_id TEXT NOT NULL REFERENCES budgets(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TEXT NOT NULL,
  voided_at TEXT,
  void_reason TEXT
);
CREATE INDEX idx_applications_payment ON payment_applications(payment_id);
CREATE INDEX idx_applications_budget ON payment_applications(budget_id);

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,                 -- YYYY-MM-DD
  type TEXT NOT NULL CHECK (type IN ('cancellation','no_show')),
  patient_ref TEXT NOT NULL DEFAULT '',
  estimated_cents INTEGER NOT NULL CHECK (estimated_cents >= 0),
  advance_received_cents INTEGER NOT NULL DEFAULT 0 CHECK (advance_received_cents >= 0),
  advance_retained_cents INTEGER NOT NULL DEFAULT 0 CHECK (advance_retained_cents >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  CHECK (advance_retained_cents <= advance_received_cents)
);
CREATE INDEX idx_incidents_occurred_on ON incidents(occurred_on);
