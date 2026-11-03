# Servicio de pagos

Worker independiente (`payments/`), con **su propia base de datos y sus propios secretos**. Es la **única fuente de verdad del dinero**.
Se diseñó para que sumar proveedores no toque el resto del sistema, y para que un problema en una app (o en su base) no pueda crear,
alterar ni ver credenciales de dinero.

**Es un servicio compartido**: varias apps (este consultorio, mañana una peluquería, otro consultorio…), cada una con su propio worker y su
propia base, le piden cobros por API. Cada app es un **cliente** con su `client_id`, su clave de firma, su dirección de avisos y su propia
cuenta de proveedor. Ningún cliente puede ver ni tocar lo de otro.

```
 Integra OD (integra-od/) ──┐                                   ┌──▶ Mercado Pago (cuenta del consultorio)
 Peluquería (otra carpeta) ──┼─ pedido firmado + client_id ─▶ PAGOS (payments/) ──▶ otros proveedores
 Otra app …              ───┘                                   └─ libro de dinero, credenciales, webhooks, auditoría
        ▲                                                                │
        └───────────── aviso firmado con la clave de CADA app (outbox) ───┘
```

## Quién es dueño de qué

| Dato / regla | App | Pagos |
|---|---|---|
| Presupuestos, clientes, estados, aplicar un pago a un presupuesto | ✅ | — |
| Reglas del presupuesto (límite de saldo, anticipo único) | ✅ las valida antes de pedir | — |
| Cobros (`intents`), pagos (`payments`), reembolsos | copia de lectura | ✅ fuente de verdad |
| Credenciales de proveedores (cifradas) | ❌ nunca las ve | ✅ |
| Webhooks, conciliación, cola de revisión, bitácora de auditoría | — | ✅ |

El servicio **no sabe qué es un presupuesto ni un contacto**: recibe una `reference` opaca (hoy, el id del presupuesto) y un texto para el
pagador. Puede cobrar cualquier cosa.

## Clientes (las apps que usan el servicio)

Tabla `clients`: `id`, nombre, estado (`active`/`suspended`), clave de la app (cifrada, con una anterior opcional para rotar), dirección y clave de avisos,
y dirección pública de la app. Las claves se guardan **cifradas con `TOKEN_ENC_KEY`** y se muestran una sola vez al crearlas.

- **Aislamiento**: toda tabla de dinero lleva `client_id` y `buildDeps(env, client)` ata todos los repositorios a ese cliente. Un pedido nunca llega a datos de otro: pedir el cobro o pago de otro cliente da 404.
- **Identidad**: el `client_id` viaja en `x-svc-client` y va **dentro de lo firmado**; un pedido firmado para un cliente no se puede reenviar como de otro, aunque compartieran clave.
- **Cuenta de proveedor propia**: cada cliente conecta su Mercado Pago (OAuth); el `state` está firmado y dice de qué cliente es, así nadie conecta su cuenta a otro.
- **Webhooks por cliente**: `/webhooks/<proveedor>/<cliente>`. El pago se consulta con las credenciales de ese cliente, así que un aviso dirigido al cliente equivocado no mueve dinero.
- **Avisos**: el outbox entrega a la dirección de cada cliente firmado con SU clave; una app caída no frena a las demás.
- **Bitácora**: una cadena de hash por cliente.
- **Suspender** a un cliente lo corta al instante (pedidos, webhooks y avisos).

```bash
npm run client -w payments -- create --id integra-od --name "Integra OD" \
  --app-url https://od.ejemplo.com --events-url https://od.ejemplo.com/api/internal/payment-events --remote
# imprime PAYMENTS_CLIENT_ID, SVC_SECRET_CORE y SVC_SECRET_EVENTS: cargarlos como secretos del worker de esa app
```

## API interna (solo apps registradas, siempre firmada)

`GET /v1/providers` · `POST /v1/providers/:id/connect|disconnect` · `POST /v1/intents` · `GET /v1/intents/:id` · `POST /v1/intents/:id/cancel`
· `POST /v1/payments/manual` · `GET /v1/payments/:id` · `POST /v1/payments/:id/void` · `GET /v1/review` · `POST /v1/review/:id/dismiss`
· `GET /v1/audit/verify` · `POST /v1/mock/:publicId/pay` (solo piloto).

Públicas (autenticadas por otro medio): `POST /webhooks/:provider/:cliente` (firma del proveedor), `GET /oauth/:provider/callback` (`state` firmado), `GET /health`.

## Cobros en efectivo

`POST /v1/intents` acepta `method`: `"online"` (por defecto: con link del proveedor) o `"cash"` (se cobra en mano). Un cobro en efectivo se guarda con `provider = "cash"`, sin link ni proveedor, aunque haya uno conectado; no se puede "pagar" online (ni con el checkout simulado). Cuando se registra el pago en mano (`/v1/payments/manual` con ese `intentId`), el cobro se cierra como cualquier otro. Las reglas del presupuesto (máximo pedible, anticipo una sola vez, vencimiento) valen igual para los dos medios.

## Cómo se sincroniza la app

1. **Respuesta de cada operación**: la app incorpora el estado resultante a su copia de lectura.
2. **Avisos (outbox)**: cada cambio escribe un aviso en la *misma* operación (nunca existe el cambio sin el aviso). Se entrega firmado a
   `POST /api/internal/payment-events`; si falla, se reintenta con espera creciente (cron cada minuto).
3. El aviso no trae datos de dinero: dice "cambió tal cosa" y la app **consulta el estado real** al servicio.
4. La copia solo avanza (columna `version`): un dato viejo no pisa uno nuevo, y todo es idempotente.

Al incorporar un pago aprobado, la app lo aplica solo al presupuesto (`reference`); al anularse o reembolsarse, libera lo aplicado.

## Sumar un proveedor nuevo

1. Crear `payments/src/infrastructure/providers/<nombre>/index.ts` que cumpla `PaymentProvider` (`domain/payment-provider.interface.ts`):
   `createCheckout`, `isAllowedCheckoutUrl` (dominios permitidos), `verifyWebhook`, `fetchPayment`, y conexión si corresponde.
2. Agregarlo a `infrastructure/providers/registry.ts`.
3. Agregar su dominio de pago a `<app>/worker/src/config/checkout-hosts.ts` (en cada app) (segunda barrera en la página del cliente).
4. Guardar sus secretos con `wrangler secret put -c payments/wrangler.toml`.
5. Escribir sus tests (ver `payments/tests/ledger.test.ts` como modelo).

No hace falta migrar nada: las tablas guardan `provider`, `provider_payment_id` y `method` como texto libre.

## Despliegue

```bash
# 1) Servicio de pagos (una sola vez para todas las apps)
npx wrangler d1 create clinic-payments            # copiar el database_id a payments/wrangler.toml
npm run migrate:remote -w payments
for s in PUBLIC_BASE_URL TOKEN_ENC_KEY MP_CLIENT_ID MP_CLIENT_SECRET MP_WEBHOOK_SECRET; do
  npx wrangler secret put $s -c payments/wrangler.toml; done
npm run deploy -w payments

# 2) Dar de alta cada app (imprime sus claves una sola vez)
npm run client -w payments -- create --id integra-od --name "Integra OD" --app-url https://... --events-url https://.../api/internal/payment-events --remote

# 3) En esa app: PAYMENTS_CLIENT_ID en <app>/worker/wrangler.toml [vars], binding [[services]] PAYMENTS y los secretos
for s in ADMIN_TOKEN APP_BASE_URL SVC_SECRET_CORE SVC_SECRET_EVENTS; do npx wrangler secret put $s -c integra-od/worker/wrangler.toml; done
npm run migrate:remote --prefix integra-od && npm run deploy --prefix integra-od
```

`TOKEN_ENC_KEY` cifra las credenciales de los proveedores **y las claves de los clientes**: guardarla en un gestor de contraseñas; si se pierde, hay que volver a conectar todo.
En Mercado Pago Developers (una sola aplicación para toda la plataforma): Redirect URL = `PUBLIC_BASE_URL/oauth/mercadopago/callback`;
Webhook ("Pagos") = `PUBLIC_BASE_URL/webhooks/mercadopago` — el servicio le pasa a cada pago su propia `notification_url` con el cliente, así que no hace falta una URL por cliente.

### Rotar una clave entre servicios sin cortar el servicio
- **Clave de la app** (`SVC_SECRET_CORE`): `client rotate` (la nueva rige y la anterior sigue valiendo) → cargar la nueva en la app y desplegar → `client clear-previous`.
- **Clave de avisos** (`SVC_SECRET_EVENTS`): `client rotate-events` → en la app poner la nueva en `SVC_SECRET_EVENTS` y la vieja en `SVC_SECRET_EVENTS_PREV` unos minutos → borrar `*_PREV`.

## Operación

- **Cola de revisión** (`Cobros → Para revisar`): pagos que un proveedor aprobó pero no coinciden con ningún cobro. No cuentan como dinero.
- **Verificar la bitácora**: `GET /v1/audit/verify` devuelve `{ ok, count }`; `ok:false` + `brokenAt` indica la primera fila alterada.
- **Servicio caído**: la app lo informa en pantalla y no crea cobros a medias; los avisos pendientes se entregan al volver.


## Estructura del código

Un servicio compartido con `client_id` en cada tabla de dinero. Cada app conserva su propia base de datos: acá no hay presupuestos ni clientes.

```
payments/src/
  domain/           tipos puros y el contrato PaymentProvider (no importan nada de afuera)
  application/      casos de uso, uno por archivo (create-intent, record-manual-payment, reconcile-provider-payment…);
                    hablan con el mundo solo a través de los puertos de ports.ts
  infrastructure/   D1 (repositorios atados a un cliente y unidad de trabajo), proveedores (mercadopago, mock), cifrado AES-GCM,
                    publicador de avisos y container.ts (buildDeps: único lugar donde se conectan las piezas)
  scheduler.ts      el cron reintenta los avisos pendientes de todos los clientes
  webhooks/         avisos de proveedores: validator (firma) → processor (consulta al proveedor + conciliación) → controller
  controller/       API interna firmada para la app y vuelta OAuth
  shared/           errores, logger (solo campos simples), env, seguridad (firmas, hash-chain, auth entre servicios)
```

Regla de dependencias: `domain` ← `application` ← `infrastructure` / `controller` / `webhooks`. Un cambio de base de datos o de proveedor no toca los casos de uso.
