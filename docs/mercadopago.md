# Mercado Pago

La integración vive **solo en el servicio de pagos** (`payments/src/infrastructure/providers/mercadopago/`). La app nunca ve credenciales.

- **Conexión (OAuth)**: la app pide la URL (`GET /api/mercadopago/connect` → servicio de pagos); el navegador vuelve a
  `PUBLIC_BASE_URL/oauth/mercadopago/callback`, que valida un `state` firmado, cifra y guarda los tokens y redirige a la app.
  Renueva el token si vence en menos de 10 minutos.
- **Cobro**: se crea una preferencia de Checkout Pro con `external_reference = int_<id>`; el link se valida contra los dominios de Mercado Pago.
- **Webhook** (`POST /webhooks/mercadopago/<cliente>`): valida `x-signature` (HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
  tolerancia 10 min), **consulta el pago a la API**, verifica estado, moneda, importe y referencia, y lo registra de forma idempotente.
  Lo que no coincide va a la cola de revisión. Reembolsos y contracargos anulan el pago y liberan el presupuesto.
  Responde 401 a firmas inválidas y 5xx ante fallas transitorias (Mercado Pago reintenta).


## Pasar del piloto (simulado) a Mercado Pago real

Qué está simulado hoy (`MP_MOCK=true`): solo el **checkout** (el link de pago abre una página propia en vez de Mercado Pago).
Lo demás ya es real y está probado: la conciliación, la idempotencia, los avisos firmados a la app y la cola de revisión.
Lo que todavía no corrió contra Mercado Pago de verdad: el OAuth, la creación de la preferencia y la verificación de la firma del webhook
(están cubiertos por tests con un Mercado Pago de mentira, pero hace falta una prueba en sandbox).

Para avanzar necesito:
1. Una **aplicación** en Mercado Pago Developers → `MP_CLIENT_ID` y `MP_CLIENT_SECRET`, y la **clave secreta de webhooks** → `MP_WEBHOOK_SECRET`.
2. Una **URL pública** para `payments` (en local: `cloudflared tunnel --url http://localhost:8788`) como `PUBLIC_BASE_URL`.
3. En la aplicación: Redirect URL = `PUBLIC_BASE_URL/oauth/mercadopago/callback` y Webhook "Pagos" = `PUBLIC_BASE_URL/webhooks/mercadopago`.
4. **Usuarios de prueba** (vendedor y comprador) para el sandbox. Ver los pagos de prueba no mueve dinero real.
5. Sacar `MP_MOCK` de `payments/.dev.vars`, y en la app: Configuración → Conectar Mercado Pago.

## Comisiones de la billetera

Mercado Pago se queda con una comisión de cada cobro online. El sistema la muestra en dos formas:

- **Real, de cada pago.** Al confirmar un pago, `payments` lee lo que informa Mercado Pago (`transaction_details.net_received_amount`; si no viene, resta las comisiones `fee_details` a cargo del vendedor) y guarda `fee_cents` (comisión) y `net_cents` (lo que le queda al negocio). Si la billetera todavía no lo informó, queda vacío: **no se inventa**. El efectivo no tiene comisión. La app recibe estos datos con el pago y los muestra en Cobros (detalle y "Dinero recibido"), en el Resumen ("La billetera se llevó … te quedan …") y en el Excel de cobros (columnas "Comisión" y "Te quedó").
- **De referencia, para tener en cuenta.** Al conectar la cuenta, Configuración → Mercado Pago muestra una nota informativa con las comisiones publicadas por Mercado Pago según cuándo se recibe el dinero (`integra-od/frontend/src/config/wallet-fees.ts`). No se calcula ni se configura nada: son valores de referencia, con su fecha, que pueden cambiar y varían según provincia, medio de pago y plazo. Para actualizarlos, se cambian en ese archivo (y la fecha) a partir de https://www.mercadopago.com.ar/herramientas-para-vender/link-de-pago.

En el piloto (checkout simulado) la comisión es una **simulación del 6 %** (`MOCK_FEE_BPS`), solo para ver cómo se muestra; no es una tarifa real.

**Pendiente de verificar en el sandbox de Mercado Pago:** los campos `fee_details` y `net_received_amount` están tomados de la documentación de la API de pagos; hay que confirmar con un pago de prueba real que llegan en el momento de la aprobación (si llegan después, hay que completar la comisión con una consulta posterior).
