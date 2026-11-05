# IntegraOD (piloto): la app y el servicio de pagos juntos, corriendo con wrangler dev (workerd) y su base D1 local en /data.
# Pensado para ponerle un Cloudflare Tunnel adelante (ver docker-compose.yml y docs/docker-cloudflare.md).
FROM node:24-bookworm-slim

ENV CI=true \
    WRANGLER_SEND_METRICS=false \
    NO_UPDATE_NOTIFIER=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primero (capa cacheable): solo los package.json de cada workspace.
COPY package.json package-lock.json ./
COPY payments/package.json payments/
COPY integra-od/package.json integra-od/
COPY integra-od/frontend/package.json integra-od/frontend/
COPY integra-od/worker/package.json integra-od/worker/
RUN npm ci

COPY . .
RUN npm run build --prefix integra-od \
 && chmod +x docker/entrypoint.sh \
 && mkdir -p /data \
 && chown -R node:node /app /data

USER node
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
