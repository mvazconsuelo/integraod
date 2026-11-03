export interface Env {
  DB: D1Database;

  // Las claves de cada app (cliente) están en la tabla `clients`, cifradas con TOKEN_ENC_KEY.
  PUBLIC_BASE_URL: string;       // dirección pública de ESTE servicio (webhooks y OAuth)

  TOKEN_ENC_KEY: string;         // 32 bytes en base64: cifra las credenciales de los proveedores

  MP_CLIENT_ID?: string;
  MP_CLIENT_SECRET?: string;
  MP_WEBHOOK_SECRET?: string;
  MP_MOCK?: string;              // "true": checkout simulado para el piloto

  /** Para pruebas: reemplaza el fetch hacia afuera (proveedores y avisos a la app). */
  fetchImpl?: typeof fetch;
}
