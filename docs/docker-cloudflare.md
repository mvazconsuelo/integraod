# IntegraOD en Docker con Cloudflare Tunnel

Deja IntegraOD (la app y el servicio de pagos) corriendo en un contenedor, y un segundo contenedor (`cloudflared`) lo publica en **tu dominio**
sin abrir puertos en tu router ni en el servidor. Es un montaje para el **piloto** (pagos simulados). Más abajo, qué cambia para producción.

```
cliente ──https──▶ Cloudflare (tu dominio) ──túnel──▶ cloudflared ──▶ app:8787  (workers + bases en el volumen /data)
```

## 1) Crear el túnel en Cloudflare (una vez)

1. Tu dominio tiene que estar en Cloudflare (DNS administrado por Cloudflare).
2. Cloudflare → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → tipo **Cloudflared** → nombre, por ejemplo `integraod`.
3. En "Install and run a connector" elegí **Docker** y copiá solo el **token** (la parte larga después de `--token`).
4. **Cloudflare no te deja seguir (ni configurar el hostname) hasta que el túnel esté *Connected*.** Por eso el hostname se agrega *después* de
   levantar el conector: seguí con el paso 2 y volvé acá.
5. Con el túnel *Connected*: pestaña **Public Hostname** → *Add a public hostname*:
   - Subdominio y dominio: por ejemplo `app` + `tudominio.com` (el mismo que pusiste en `PUBLIC_URL`)
   - Service: tipo **HTTP**, URL **`app:8787`** (así se llama el contenedor de la app dentro de `docker compose`).

## 2) Configurar y levantar

```bash
cp .env.example .env
```

Completá `.env`:

| Variable | Qué poner |
|---|---|
| `ADMIN_TOKEN` | La clave de acceso a la app (mínimo 6 caracteres). Para el piloto puede ser corta: el login limita los intentos fallidos. Para producción, una larga (`openssl rand -base64 24`). |
| `PUBLIC_URL` | La dirección que vas a usar, por ejemplo `https://app.tudominio.com` (con `https` y sin barra al final). Es solo el nombre que elegís: podés ponerla antes de crear el hostname en Cloudflare, pero después el hostname tiene que ser el mismo. |
| `TUNNEL_TOKEN` | El token del paso 1. |
| `MP_MOCK` | `true` (pagos simulados). |

```bash
docker compose up -d --build
docker compose logs -f app        # esperá "Levantando IntegraOD en el puerto 8787"
```

Cuando `cloudflared` arranque, el túnel aparece *Connected* en Cloudflare: ahí hacé el paso 1.5 (Public Hostname). Después abrí
`https://app.tudominio.com` e ingresá con tu `ADMIN_TOKEN`.

Si querés conectar el túnel antes de levantar la app, corré solo el conector con `docker run -d --name cf-test cloudflare/cloudflared:latest tunnel --no-autoupdate run --token TU_TOKEN`
y, cuando Cloudflare lo marque conectado, borralo con `docker rm -f cf-test`.

Para probar en la misma máquina **sin** túnel: descomentá `ports:` en `docker-compose.yml` y entrá a `http://127.0.0.1:8787`
(en ese caso `PUBLIC_URL` igual tiene que empezar con `https://`; sirve cualquier dirección de prueba).

## Qué se guarda y cómo no perderlo

Todo está en el volumen `integraod-data` (montado en `/data`):

- `state/`: las bases de datos (presupuestos, clientes, pagos) **y los archivos, como el logo** (R2 local). El logo ya no está dentro de la base: es un archivo.
- `secrets.env`: las claves internas, generadas la primera vez. **`TOKEN_ENC_KEY` cifra los datos de los proveedores de pago: si se pierde, no se pueden leer.**

Copia de seguridad (con la app corriendo o no):

```bash
docker run --rm -v integraod-data:/data -v "$PWD":/backup alpine tar czf /backup/integraod-$(date +%F).tgz -C /data .
```

Restaurar en otro equipo: crear el volumen, descomprimir ahí el `.tgz` y levantar con el mismo `.env`.

## Operación

```bash
docker compose ps                  # estado
docker compose logs -f app         # registros de la app
docker compose restart app         # reiniciar
docker compose up -d --build       # actualizar después de bajar cambios del repositorio
docker compose down                # parar (el volumen y los datos se conservan)
```

Las migraciones de base se aplican solas en cada arranque.

## Seguridad (leer antes de publicarlo)

- La app queda en internet y **la clave es lo único que protege el ingreso**. En el piloto puede ser corta (el login bloquea tras varios intentos fallidos desde una misma IP), pero no la compartas por chats y usá una larga antes de producción.
- `.env` está en `.gitignore`: no lo subas. El token del túnel da acceso para reconectar tu dominio: si se filtra, rotalo desde Cloudflare.
- La app no publica puertos en el servidor: solo el túnel llega a ella.
- No pongas Cloudflare Access delante de **todo** el dominio: los clientes tienen que poder abrir el link de pago y el checkout sin iniciar sesión.

## Lo que este montaje NO es

- Es `wrangler dev` (el motor local de Workers, `workerd`) con las bases en archivos. Sirve para un piloto con pocos usuarios. No tiene alta disponibilidad
  ni las garantías de Cloudflare D1 en producción.
- **Mercado Pago real no está cubierto.** Con `MP_MOCK=true` el checkout es simulado. Para cobrar de verdad, Mercado Pago tiene que poder llamar
  al servicio de pagos por una URL pública (webhook), y hoy en este montaje el servicio de pagos no está publicado por separado
  (ver `docs/payments-service.md` y `npm run dev:split`). Es el siguiente paso.
- Para producción de verdad, la ruta prevista del proyecto es desplegar los dos Workers y sus bases D1 en Cloudflare
  (`npm run deploy`, ver `docs/payments-service.md`), sin Docker.

## Llevar lo que simulás en local al Docker (un comando)

Tu entorno local guarda todo en `.dev-state/` (bases, logo, presupuestos de ejemplo, pagos simulados). Para tener lo mismo en el Docker:

```bash
npm run docker:datos
```

Paró la app del Docker, **reemplaza** sus datos por una copia de `.dev-state/v3`, y la vuelve a levantar reconstruyendo la imagen (así también lleva el código nuevo).
El arranque vuelve a registrar las claves del servicio de pagos para el Docker, así que no se pisan con las de tu entorno local.

- Conviene **frenar tu servidor local** (`npm run dev`) mientras copia, para que las bases queden completas.
- Es una **copia**: lo que cargues después en el Docker no vuelve a tu local, y al revés. Para volver a igualarlos, repetí el comando.
