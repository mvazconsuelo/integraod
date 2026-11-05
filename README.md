# Plataforma de gestión financiera

Control de dinero para negocios de servicios: presupuestos, anticipos y cobros con Mercado Pago. Un **servicio de pagos compartido** y una
**carpeta por entidad** que le pega.

```
payments/            servicio de pagos (Worker + su base): el dinero, los proveedores, la seguridad. Compartido por todas las apps
integra-od/          todo lo de esa entidad: frontend, worker, migraciones, tests, docs
<otra-entidad>/      se suma copiando una app existente (ver abajo)
docs/                lo que vale para toda la plataforma: servicio de pagos, seguridad, Mercado Pago
scripts/             new-app (sumar entidad), run-all (tests/tipos de todo)
```

Cada carpeta se basta sola (su `wrangler.toml`, su base D1, sus secretos). Ninguna app importa código de otra: hablan con `payments`
solo por una API interna **firmada**, cada una con su `client_id`.

## Publicar el piloto con Docker y Cloudflare Tunnel

`docker compose up -d --build` levanta la app y un túnel a tu dominio. Guía paso a paso en [docs/docker-cloudflare.md](docs/docker-cloudflare.md).

## Levantar el piloto (local, con pagos simulados)

```bash
npm install
npm run setup                    # claves, bases, registro de la app en payments y frontend. Se puede repetir sin romper nada
npm run dev --prefix integra-od  # payments + app en una sola sesión, conectadas por el service binding real
npm test                         # tests de payments y de cada app
```

Abrir http://localhost:8787 (clave: `ADMIN_TOKEN` de `integra-od/worker/.dev.vars`, por defecto `dev-token`). Con `MP_MOCK=true` en
`payments/.dev.vars` (lo deja `setup`) el link de pago abre un checkout simulado con botones para aprobar, rechazar o dejar pendiente.
Ese pago recorre el **mismo camino** que uno real: se concilia en `payments`, genera el aviso firmado y la app lo refleja en el presupuesto.

### Qué tan parecido es al deploy

El local está armado para parecerse a un deploy en dev. Lo único simulado es el checkout; el resto es la misma configuración.

| | Local | Deploy (dev / prod) |
|---|---|---|
| App → `payments` | service binding `PAYMENTS` (el mismo) | service binding `PAYMENTS` |
| Clientes, claves, firmas, avisos, outbox | idénticos | idénticos |
| Bases | D1 local (SQLite), una por servicio, en `.dev-state/` | D1 de Cloudflare |
| Secretos | `.dev.vars` | `wrangler secret put` |
| Cron de reintentos | **no corre solo**: `npm run cron --prefix integra-od` | cada minuto |
| Avisos de `payments` → app | `http://localhost:8787/...` | `https://` pública de la app |
| Cabeceras de seguridad (`_headers`) | se aplican | se aplican |
| Checkout | simulado (`MP_MOCK=true`) | simulado en dev; Mercado Pago real en prod |
| Webhooks y OAuth de Mercado Pago | no llegan (nadie puede llamar a tu máquina) | llegan |

Para probar Mercado Pago **real** en local: `npm run dev:split --prefix integra-od` deja `payments` en :8788 aparte (para exponerlo con un túnel).
Lo más fiel es probarlo en un **dev desplegado** (URL pública sin túnel).

Pasar a Mercado Pago real: ver [docs/mercadopago.md](docs/mercadopago.md).

## Sumar una entidad nueva (peluquería, otro consultorio…)

```bash
npm run new-app -- peluqueria-roquel      # copia integra-od, la renombra, le da sus puertos y la registra como cliente local de payments
npm install
npm run migrate:local --prefix peluqueria-roquel
npm run build --prefix peluqueria-roquel && npm run dev --prefix peluqueria-roquel
```

Se copia **tal cual** (textos, catálogo y reglas de `integra-od`): lo propio de la entidad se adapta después en su carpeta. Puede correr junto
a las otras (cada una tiene su puerto). `payments` no se toca. Un arreglo en una app no llega solo a las otras: si dos apps terminan
compartiendo mucho, se extrae a un paquete común.

## Despliegue

`payments` se despliega una sola vez; cada app se despliega por separado y se da de alta como cliente en producción. Pasos, secretos,
rotación de claves y operación en [docs/payments-service.md](docs/payments-service.md). Modelo de amenazas y pendientes de seguridad en
[docs/security.md](docs/security.md). Documentación propia de la app en [integra-od/docs/](integra-od/docs/).
