# Arquitectura

Esta carpeta (`integra-od/`) es **una app completa**: se copia y se renombra para sumar otra entidad (`npm run new-app`, ver el README de la raíz).
El servicio de pagos (`../payments/`) es compartido y vive afuera. Dentro de la app:

- `frontend/` React 19 + Vite + Tailwind 4. Se publica como assets del Worker de la app (mismo origen).
- `worker/` **La app**: presupuestos, contactos, reglas del negocio y la interfaz. Hono sobre Cloudflare Workers + D1.
- `tests/` Vitest. La app se prueba sobre SQL real (`node:sqlite` adaptado a D1) y también **junto con el servicio de pagos** (`tests/helpers/stack.ts`). El servicio de pagos tiene sus propios tests en `payments/tests/`.

La app habla con el servicio de pagos solo por una API interna **firmada**; el servicio le avisa los cambios con avisos firmados.
Seguridad: ver [security.md](../../docs/security.md).

Decisiones clave
- Importes en centavos enteros. Fechas en UTC; los períodos se calculan en hora Argentina (UTC-3).
- "Vencido" se deriva de `due_date`; nunca se persiste.
- Pagos y aplicaciones son de solo agregar: se anulan con `voided_at` + motivo, no se borran.
- Aplicar un pago a un presupuesto es UNA sentencia SQL condicional en la base de la app (disponible y saldo verificados a la vez):
  sin doble aplicación ni saldo negativo, ni con pedidos simultáneos.
- Las tablas de pagos de la app son una **copia de lectura** con versión; solo las escribe lo que informa el servicio de pagos.
