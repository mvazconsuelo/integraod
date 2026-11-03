-- Pacientes (contactos): nombre y teléfono, para armar presupuestos de gente frecuente y escribirles por WhatsApp.
-- No es una historia clínica: solo quién es y cómo contactarlo.
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,              -- nombre sin mayúsculas ni espacios sobrantes: dos pacientes no pueden tener el mismo
  phone TEXT,                          -- solo dígitos con código de país (5493515550123). NULL: todavía no se cargó
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_patients_name_key ON patients(name_key);
CREATE INDEX idx_patients_phone ON patients(phone);

ALTER TABLE budgets ADD COLUMN patient_id TEXT REFERENCES patients(id);
CREATE INDEX idx_budgets_patient ON budgets(patient_id);

-- Los pacientes que ya existen (los nombres escritos en presupuestos, cobros y pagos) pasan a la lista, sin teléfono:
-- se completa la primera vez que se comparte por WhatsApp.
INSERT INTO patients (id, name, name_key, created_at, updated_at)
SELECT lower(hex(randomblob(16))), MIN(trim(patient_ref)), lower(trim(patient_ref)), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM (
  SELECT patient_ref FROM budgets
  UNION ALL SELECT patient_ref FROM payment_requests
  UNION ALL SELECT patient_ref FROM payments
)
WHERE trim(patient_ref) <> ''
GROUP BY lower(trim(patient_ref));

UPDATE budgets SET patient_id = (SELECT p.id FROM patients p WHERE p.name_key = lower(trim(budgets.patient_ref)));
