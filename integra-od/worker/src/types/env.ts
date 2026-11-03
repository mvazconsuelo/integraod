export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_TOKEN: string;
  APP_BASE_URL: string;

  // Servicio de pagos (Worker independiente). Se habla por un binding privado; solo si se define PAYMENTS_URL se usa esa dirección (dev:split).
  PAYMENTS?: Fetcher;
  PAYMENTS_URL?: string;
  PAYMENTS_CLIENT_ID: string;     // quién es esta app ante el servicio de pagos (se da de alta allá)
  SVC_SECRET_CORE: string;        // firma los pedidos de esta app al servicio de pagos
  SVC_SECRET_EVENTS: string;      // verifica los avisos que manda el servicio de pagos
  SVC_SECRET_EVENTS_PREV?: string; // clave anterior, mientras se rota
}
