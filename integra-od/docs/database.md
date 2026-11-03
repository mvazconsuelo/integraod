# Base de datos (D1)

Migraciones en `worker/migrations/`: `0001` configuración y presupuestos · `0002` solicitudes de cobro y pagos · `0003` aplicaciones e incidentes.

- `payments.mp_payment_id` es UNIQUE: garantiza idempotencia de webhooks.
- `payment_applications` nunca se edita; se anula con `voided_at`.
- Tokens de Mercado Pago cifrados con AES-GCM (`TOKEN_ENC_KEY`) en `clinic_settings`.

## Clientes (`0009`)

- `patients`: nombre completo (único sin importar mayúsculas, `name_key`) y teléfono en formato WhatsApp (`5493515550123`). El teléfono es obligatorio al crear; vive solo en la app, nunca en el servicio de pagos.
- `budgets.patient_id` enlaza cada presupuesto con su cliente. La migración crea los clientes a partir de los nombres ya cargados (sin teléfono: se pide la primera vez que se usan).
- Cambiar el nombre de un cliente lo actualiza en sus presupuestos, cobros y pagos. No se puede borrar un cliente con presupuestos.
- Un teléfono repetido avisa ("podés guardarlo igual": las familias comparten número).

## Auditoría financiera (`0011`)

- `clinic_settings.time_zone`: zona horaria del consultorio (por defecto `America/Argentina/Mendoza`).
- `request_reservations`: reserva atómica del importe de un cobro mientras se crea (vence a los 2 minutos).
- `audit_log`: bitácora de la app, solo se agrega (triggers impiden editar o borrar). Detalle sin datos sensibles.
