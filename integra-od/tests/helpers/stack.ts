import { createTestDb } from "./d1";
import { CLIENT, makeHarness, SECRETS, type Harness } from "../../../payments/tests/helpers/payments-harness";
import { app as coreApp } from "../../worker/src/app";
import { app as paymentsApp } from "../../../payments/src/app";
import type { Env as CoreEnv } from "../../worker/src/types/env";
import { fakeBucket } from "./r2";

/**
 * Los dos servicios conectados en memoria, cada uno con su propia base de datos:
 * app ──(binding firmado)──▶ pagos ──(aviso firmado)──▶ app.
 */
export interface Stack {
  core: CoreEnv;
  pay: Harness;
  /** Llama a la API de administración de la app (con su clave). */
  api: (method: string, path: string, body?: unknown) => Promise<Response>;
}

export function makeStack(opts: { mock?: boolean } = {}): Stack {
  const pay = makeHarness({ MP_MOCK: opts.mock === false ? undefined : "true" });
  const core: CoreEnv = {
    DB: createTestDb("worker"),
    ASSETS: undefined as never,
    FILES: fakeBucket().bucket,
    ADMIN_TOKEN: "admin-token",
    APP_BASE_URL: "https://core.test",
    PAYMENTS_CLIENT_ID: CLIENT,
    SVC_SECRET_CORE: SECRETS.core,
    SVC_SECRET_EVENTS: SECRETS.events,
    PAYMENTS: { fetch: (input: RequestInfo | URL, init?: RequestInit) => paymentsApp.fetch(new Request(input, init), pay.env) } as unknown as Fetcher,
  };
  pay.onCore = (req) => coreApp.fetch(req, core);
  const api: Stack["api"] = (method, path, body) =>
    coreApp.request(path, { method, headers: { Authorization: "Bearer admin-token", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }, core);
  return { core, pay, api };
}
