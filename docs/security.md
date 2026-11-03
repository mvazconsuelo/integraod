# Seguridad

El consultorio va a estar expuesto a phishing y estafas. Este documento dice **qué se defiende, cómo, y qué falta**.

## Amenazas y controles

| Amenaza | Control |
|---|---|
| **Link de pago falso** (estafador manda otro link a un pagador) | Los links usan un identificador aleatorio de 128 bits (no adivinable). El destino de pago se valida contra una **lista de dominios del proveedor** al crearlo *y* al mostrarlo: el botón "Pagar" nunca lleva a un dominio ajeno. Recomendado: dominio propio fijo para que quien paga reconozca siempre el mismo origen. |
| **Aviso (webhook) falso** de "pago aprobado" | Se verifica la firma del proveedor (con tolerancia de tiempo), **se consulta el pago real a su API** (el aviso nunca es la fuente de verdad) y se verifican importe, moneda y referencia. Intentos con firma inválida se cuentan y se frenan (429). |
| **Pago manipulado** (otro importe, otra moneda, referencia inventada) | No se descarta ni se acepta: va a la **cola de revisión**, no cuenta como dinero y el Resumen avisa. |
| **Adivinar la clave del admin** (fuerza bruta) | Después de 8 claves incorrectas en 10 minutos desde la misma conexión, la app bloquea ese acceso (también para la clave correcta) y responde 429. Los pedidos sin clave no cuentan. Tests en `integra-od/tests/auth.test.ts`. |
| **Pantalla de ingreso falsa** (phishing) | El ingreso muestra el nombre y el logo del negocio y un aviso de que nadie va a pedirle la clave por mensaje, mail o teléfono. |
| **Una app viendo o tocando el dinero de otra** (servicio compartido) | Cada app tiene su `client_id` y su propia clave; toda tabla lleva `client_id` y los repositorios solo ven ese cliente; credenciales de proveedor, webhooks, avisos y bitácora son por cliente. Tests en `payments/tests/clients.test.ts`. |
| **Repetición** de un aviso o pedido capturado | Pedidos entre servicios con firma HMAC + instante (±60 s) + **nonce de un solo uso**. Pagos idempotentes por `(proveedor, id del pago)` y por clave de idempotencia (doble clic). |
| **Alterar un pedido en el camino** (cambiar el importe) | La firma cubre método, ruta, instante, nonce, el hash del cuerpo y el cliente. |
| **Robo de credenciales del proveedor** | Viven solo en el servicio de pagos, **cifradas con AES-GCM** (clave separada). La app y su base **no tienen** columnas de credenciales (migración 0007; hay un test). |
| **Compromiso de la app o de su base** | No puede crear dinero: solo pide operaciones al servicio, que valida y audita. La base de la app tiene una *copia de lectura*. |
| **Fraude interno / edición de registros** | Los pagos **no se borran** (trigger) y se anulan con motivo. Bitácora de **solo agregar y encadenada por hash**: editar o borrar una fila rompe la cadena y `GET /v1/audit/verify` lo detecta. |
| **Enumeración de links** (probar al azar) | Límite de intentos por IP (hash, el IP no se guarda) en páginas públicas, webhooks y OAuth. |
| **Clickjacking / inyección / fuga de datos** | CSP estricta, `frame-ancestors 'none'`, `nosniff`, `no-referrer`, HSTS, `Permissions-Policy` (`<app>/frontend/public/_headers`); la API responde `no-store`. |
| **Fuga por errores y logs** | Errores genéricos hacia afuera; los logs no incluyen cuerpos ni credenciales. |
| **Pantalla simulada en producción** | Solo existe con `MP_MOCK=true`; sin esa variable responde 404. La app muestra un aviso permanente en modo piloto. |

## Lo que NO está resuelto (y conviene hacer antes de cobrar de verdad)

1. **Acceso de administración**: hoy es una clave única (`ADMIN_TOKEN`) guardada en la sesión del navegador. Si alguien la roba (phishing al
   consultorio), puede operar. **Recomendación: poner la app detrás de Cloudflare Access** (SSO + código por mail o llave de seguridad),
   que es configuración y no código. Más adelante: sesiones con cookie `HttpOnly`, múltiples usuarios y 2FA.
2. **La bitácora no distingue personas**: el actor es `core` o `provider:*`; al haber un solo acceso no se sabe *quién* anuló un pago.
3. **Límites de intentos por ventana fija en D1**: sirven contra abuso simple; sumar reglas de WAF / rate limiting de Cloudflare.
4. **Respaldos**: activar D1 Time Travel en ambas bases y probar una restauración.
5. **Alertas**: no hay notificación automática de `invalid_signature` repetidos ni de la cola de revisión; hoy se ven en pantalla.
6. **Reembolsos desde la app**: no existen (se hacen en el proveedor y llegan solos). Evita que una cuenta robada pueda devolver dinero.
7. **Datos del piloto anteriores a este cambio**: los pagos de prueba viejos quedaron en la copia de lectura de la app pero no existen en el
   servicio de pagos, así que no se pueden anular desde la app. Conviene reiniciar las bases locales antes del piloto real.

## Recomendaciones para mensajes a clientes (anti-phishing)

- Siempre desde el mismo número/cuenta y con el mismo formato: nombre del consultorio + concepto + importe + link.
- Un dominio propio y estable (no `workers.dev`), para que "el link del consultorio" sea reconocible.
- Avisarle al cliente que **no** pedimos pagos por otro medio ni cambios de CBU por chat.
