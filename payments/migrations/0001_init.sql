-- Servicio de pagos: libro de movimientos de dinero, COMPARTIDO por varias apps (consultorio, peluquería…).
-- No conoce presupuestos ni pacientes: `reference` es un texto opaco que cada app usa para relacionar.
-- Todo dato pertenece a un cliente (`client_id`) y ningún pedido puede ver ni tocar los de otro.

-- Cada app que usa este servicio. Se da de alta con `npm run client:create -w payments`.
CREATE TABLE clients (
  id TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9-]*' AND length(id) BETWEEN 3 AND 40),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  secret_enc TEXT NOT NULL,           -- clave con la que la app firma sus pedidos (cifrada)
  secret_prev_enc TEXT,               -- clave anterior, mientras se rota
  events_url TEXT NOT NULL,           -- dónde la app recibe avisos
  events_secret_enc TEXT NOT NULL,    -- clave con la que este servicio firma los avisos a esa app (cifrada)
  app_url TEXT NOT NULL,              -- dirección pública de la app (a dónde vuelve el paciente / el dueño)
  created_at TEXT NOT NULL
);

CREATE TABLE provider_connections (
  client_id TEXT NOT NULL REFERENCES clients(id),
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_enc TEXT NOT NULL,          -- cifrado con AES-GCM; la clave vive solo en este servicio
  refresh_enc TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  PRIMARY KEY (client_id, provider)
);

-- Lo que se pide cobrar (con su link de pago).
CREATE TABLE intents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  public_id TEXT NOT NULL UNIQUE,           -- aleatorio, no adivinable; va en el link que ve el paciente
  reference TEXT NOT NULL,
  external_reference TEXT NOT NULL UNIQUE,  -- referencia estable que se envía al proveedor
  provider TEXT NOT NULL,
  provider_ref TEXT,
  checkout_url TEXT,
  description TEXT NOT NULL,
  payer_label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  kind TEXT NOT NULL CHECK (kind IN ('advance','partial','final')),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partially_paid','paid','cancelled')),
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_intents_reference ON intents(client_id, reference);

-- Dinero realmente recibido. Nunca se borra: se anula o se reembolsa con su motivo.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  intent_id TEXT REFERENCES intents(id),
  reference TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  idempotency_key TEXT,
  method TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('provider','manual')),
  kind TEXT NOT NULL CHECK (kind IN ('advance','partial','final')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','refunded','voided')),
  paid_at TEXT NOT NULL,
  payer_label TEXT NOT NULL,
  concept TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  voided_at TEXT,
  void_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (client_id, provider, provider_payment_id),
  UNIQUE (client_id, idempotency_key),
  CHECK ((source = 'provider') = (provider_payment_id IS NOT NULL))
);
CREATE INDEX idx_payments_intent ON payments(intent_id);
CREATE INDEX idx_payments_reference ON payments(client_id, reference);

-- Notificaciones de proveedores (auditoría; el pago es idempotente por provider + provider_payment_id).
CREATE TABLE provider_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT REFERENCES clients(id),
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL
);

-- Pagos aprobados por un proveedor que NO coinciden con ningún cobro (otro importe, otra moneda, referencia desconocida).
-- No cuentan como dinero hasta que una persona los revise.
CREATE TABLE review_items (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT,
  external_reference TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT,
  UNIQUE (client_id, provider, provider_payment_id)
);

-- Bitácora encadenada por hash: cada fila incluye el hash de la anterior, así cualquier edición se detecta.
-- Una cadena por cliente (así las escrituras de un cliente no compiten con las de otro).
CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES clients(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log es de solo agregar'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log es de solo agregar'); END;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT, 'los pagos no se borran: se anulan'); END;

-- Eventos pendientes de avisarle a cada app. Se escriben en la misma operación que el cambio (no se pierden).
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  delivered_at TEXT,
  last_error TEXT
);
CREATE INDEX idx_outbox_due ON outbox(client_id, delivered_at, next_attempt_at);

-- Defensa contra repetición de pedidos firmados.
CREATE TABLE nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);

CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
