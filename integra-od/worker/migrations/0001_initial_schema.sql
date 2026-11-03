-- Configuración de la clínica (una sola fila) y presupuestos.
-- Importes siempre en centavos (INTEGER) para evitar errores de redondeo.

CREATE TABLE clinic_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  logo_data_url TEXT,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  professional_info TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#173B36',
  accent_color TEXT NOT NULL DEFAULT '#D6A66A',
  terms TEXT NOT NULL DEFAULT '',
  default_validity_days INTEGER NOT NULL DEFAULT 30,
  -- Mercado Pago (tokens cifrados con AES-GCM; nunca en texto plano)
  mp_user_id TEXT,
  mp_access_token_enc TEXT,
  mp_refresh_token_enc TEXT,
  mp_token_expires_at TEXT,
  mp_connected_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO clinic_settings (id) VALUES (1);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  patient_ref TEXT NOT NULL,
  issued_on TEXT NOT NULL,            -- YYYY-MM-DD
  valid_until TEXT,                   -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','in_progress','completed','cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_budgets_status ON budgets(status);
CREATE INDEX idx_budgets_issued_on ON budgets(issued_on);

CREATE TABLE budget_items (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  discount_pct INTEGER NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100)
);
CREATE INDEX idx_budget_items_budget ON budget_items(budget_id);
