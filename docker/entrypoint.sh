#!/bin/sh
# Arranque de IntegraOD en un contenedor: claves estables, bases al día y los dos workers corriendo.
# Todo lo que debe sobrevivir (bases D1 y claves) vive en /data (volumen). Nada de esto imprime secretos.
set -eu
cd /app

: "${ADMIN_TOKEN:?Falta ADMIN_TOKEN (la clave de acceso a la app).}"
: "${PUBLIC_URL:?Falta PUBLIC_URL (la dirección pública, por ejemplo https://app.tudominio.com).}"
PUBLIC_URL="${PUBLIC_URL%/}"
[ "${#ADMIN_TOKEN}" -ge 6 ] || { echo "ADMIN_TOKEN es demasiado corta: usá al menos 6 caracteres."; exit 1; }
[ "$ADMIN_TOKEN" != "dev-token" ] || { echo "ADMIN_TOKEN no puede ser la clave de ejemplo (dev-token): elegí otra."; exit 1; }
[ "${#ADMIN_TOKEN}" -ge 12 ] || echo "Aviso: ADMIN_TOKEN corta. Para el piloto alcanza (el login limita los intentos fallidos); para producción usá una larga."
case "$PUBLIC_URL" in https://*) ;; *) echo "PUBLIC_URL tiene que empezar con https://"; exit 1 ;; esac

DATA=/data
mkdir -p "$DATA/state"
ln -sfn "$DATA/state" /app/.dev-state   # los scripts del proyecto guardan las bases en ../.dev-state

# Claves internas: se generan una sola vez y se conservan (TOKEN_ENC_KEY cifra los datos de los proveedores: si se pierde, no se pueden leer).
if [ ! -f "$DATA/secrets.env" ]; then
  umask 077
  node -e 'const c=require("node:crypto");console.log("TOKEN_ENC_KEY="+c.randomBytes(32).toString("base64"));console.log("SVC_SECRET_CORE="+c.randomBytes(32).toString("hex"));console.log("SVC_SECRET_EVENTS="+c.randomBytes(32).toString("hex"))' > "$DATA/secrets.env"
  echo "Claves internas generadas en $DATA/secrets.env (hacé copia de ese archivo)."
fi
set -a; . "$DATA/secrets.env"; set +a

# Variables de cada worker (se reescriben en cada arranque, así un cambio en .env se aplica).
umask 077
cat > payments/.dev.vars <<VARS
PUBLIC_BASE_URL=$PUBLIC_URL
TOKEN_ENC_KEY=$TOKEN_ENC_KEY
MP_MOCK=${MP_MOCK:-true}
VARS
cat > integra-od/worker/.dev.vars <<VARS
ADMIN_TOKEN=$ADMIN_TOKEN
APP_BASE_URL=$PUBLIC_URL
SVC_SECRET_CORE=$SVC_SECRET_CORE
SVC_SECRET_EVENTS=$SVC_SECRET_EVENTS
VARS
umask 022

# Bases al día (las dos: payments y la app).
npm run migrate:local --prefix integra-od >/dev/null
echo "Bases al día."

# La app como cliente del servicio de pagos. Los avisos de pago vuelven por adentro del contenedor (no hace falta salir a internet).
CLIENT_ARGS="--local --id integra-od --secret $SVC_SECRET_CORE --events-secret $SVC_SECRET_EVENTS --app-url $PUBLIC_URL --events-url http://localhost:8787/api/internal/payment-events"
if (cd payments && node scripts/client.ts create $CLIENT_ARGS --name integra-od >/dev/null 2>&1); then
  echo "Cliente de pagos registrado."
else
  (cd payments && node scripts/client.ts update $CLIENT_ARGS >/dev/null) || { echo "No pude registrar el cliente de pagos."; exit 1; }
  echo "Cliente de pagos actualizado."
fi

# Reintento de avisos pendientes del servicio de pagos, cada minuto (en producción lo hace el cron de Cloudflare).
(
  while true; do
    sleep 60
    curl -s -o /dev/null -X POST "http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/scheduled?worker=clinic-payments" -H "Content-Type: application/json" -d '{"cron":"* * * * *"}' || true
  done
) &

echo "Levantando IntegraOD en el puerto 8787 (pagos simulados: ${MP_MOCK:-true})."
cd integra-od
exec npx wrangler dev -c worker/wrangler.toml -c ../payments/wrangler.toml --persist-to ../.dev-state --ip 0.0.0.0 --port 8787
