/**
 * Alta y baja de apps cliente del servicio de pagos.
 *
 *   npm run client -w payments -- create --id consultorio-od --name "Consultorio OD" \
 *     --app-url https://od.ejemplo.com --events-url https://od.ejemplo.com/api/internal/payment-events [--local|--remote]
 *   npm run client -w payments -- update --id consultorio-od --secret <clave> --events-secret <clave> [--app-url ... --events-url ...] [--local|--remote]
 *   npm run client -w payments -- suspend --id consultorio-od [--local|--remote]
 *   npm run client -w payments -- activate --id consultorio-od [--local|--remote]
 *   npm run client -w payments -- rotate --id consultorio-od [--local|--remote]         (clave nueva de la app; la anterior sigue valiendo hasta clear-previous)
 *   npm run client -w payments -- clear-previous --id consultorio-od [--local|--remote] (termina la rotación)
 *   npm run client -w payments -- rotate-events --id consultorio-od [--local|--remote]  (clave nueva de los avisos; la app acepta la anterior con SVC_SECRET_EVENTS_PREV)
 *
 * Necesita TOKEN_ENC_KEY (en el entorno, o en payments/.dev.vars para --local). Las claves nuevas se muestran UNA vez:
 * se cargan como secretos en el worker de esa app (SVC_SECRET_CORE y SVC_SECRET_EVENTS) y no se vuelven a ver.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { CLIENT_ID } from "../src/domain/client.ts";
import { encrypt } from "../src/infrastructure/encryption/aes-gcm.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { id: { type: "string" }, name: { type: "string" }, "app-url": { type: "string" }, "events-url": { type: "string" }, secret: { type: "string" }, "events-secret": { type: "string" }, local: { type: "boolean" }, remote: { type: "boolean" } },
});
const [command] = positionals;
const fail = (m: string): never => { console.error(`Error: ${m}`); process.exit(1); };

if (!a.id || !CLIENT_ID.test(a.id)) fail("--id es obligatorio: minúsculas, números y guiones, de 3 a 40 caracteres.");
if (!a.local === !a.remote) fail("Indicá --local o --remote (uno solo).");
const target = a.local ? "--local" : "--remote";

const devVars = `${root}.dev.vars`;
const keyFromFile = a.local && existsSync(devVars) ? /^TOKEN_ENC_KEY=(.+)$/m.exec(readFileSync(devVars, "utf8"))?.[1] : undefined;
const key = process.env.TOKEN_ENC_KEY ?? keyFromFile ?? fail("Falta TOKEN_ENC_KEY.");

const persist = a.local ? ["--persist-to", `${root}../.dev-state`] : [];
const sql = (command: string) => execFileSync("npx", ["wrangler", "d1", "execute", "clinic-payments", target, ...persist, "--command", command], { cwd: root, stdio: "inherit" });
const q = (v: string) => `'${v.replaceAll("'", "''")}'`;

function httpsUrl(label: string, v: string | undefined) {
  if (!v) return fail(`Falta ${label}.`);
  const u = new URL(v);
  if (u.protocol !== "https:" && !(a.local && u.hostname === "localhost")) fail(`${label} tiene que ser https.`);
  return v.replace(/\/$/, "");
}

if (command === "create") {
  if (!a.name || a.name.length > 80) fail("--name es obligatorio (hasta 80 caracteres).");
  const appUrl = httpsUrl("--app-url", a["app-url"]);
  const eventsUrl = httpsUrl("--events-url", a["events-url"]);
  const secret = a.secret ?? randomBytes(32).toString("hex");
  const eventsSecret = a["events-secret"] ?? randomBytes(32).toString("hex");
  sql(`INSERT INTO clients (id, name, secret_enc, events_url, events_secret_enc, app_url, created_at) VALUES (${q(a.id)}, ${q(a.name)}, ${q(await encrypt(secret, key))}, ${q(eventsUrl)}, ${q(await encrypt(eventsSecret, key))}, ${q(appUrl)}, ${q(new Date().toISOString())})`);
  console.log(`\nCliente "${a.id}" creado. Cargá esto en el worker de esa app (se muestra una sola vez):\n`);
  console.log(`  PAYMENTS_CLIENT_ID=${a.id}\n  SVC_SECRET_CORE=${secret}\n  SVC_SECRET_EVENTS=${eventsSecret}\n`);
} else if (command === "rotate") {
  const secret = randomBytes(32).toString("hex");
  sql(`UPDATE clients SET secret_prev_enc = secret_enc, secret_enc = ${q(await encrypt(secret, key))} WHERE id = ${q(a.id)}`);
  console.log(`\nClave nueva de "${a.id}" (se muestra una sola vez). Cargala como SVC_SECRET_CORE en esa app y, cuando ya esté desplegada, corré clear-previous:\n\n  SVC_SECRET_CORE=${secret}\n`);
} else if (command === "clear-previous") {
  sql(`UPDATE clients SET secret_prev_enc = NULL WHERE id = ${q(a.id)}`);
  console.log(`Rotación de "${a.id}" terminada: la clave anterior ya no vale.`);
} else if (command === "rotate-events") {
  const eventsSecret = randomBytes(32).toString("hex");
  sql(`UPDATE clients SET events_secret_enc = ${q(await encrypt(eventsSecret, key))} WHERE id = ${q(a.id)}`);
  console.log(`\nClave nueva de avisos de "${a.id}". En esa app: SVC_SECRET_EVENTS=${eventsSecret} y la vieja en SVC_SECRET_EVENTS_PREV hasta que pasen unos minutos.\n`);
} else if (command === "update") {
  // Cambia claves y direcciones de un cliente que ya existe (sin tocar sus cobros ni pagos). Lo usa `npm run setup` al repetirse.
  if (!a.secret || !a["events-secret"]) fail("Hacen falta --secret y --events-secret.");
  const sets = [`secret_enc = ${q(await encrypt(a.secret, key))}`, "secret_prev_enc = NULL", `events_secret_enc = ${q(await encrypt(a["events-secret"], key))}`, "status = 'active'"];
  if (a["app-url"]) sets.push(`app_url = ${q(httpsUrl("--app-url", a["app-url"]))}`);
  if (a["events-url"]) sets.push(`events_url = ${q(httpsUrl("--events-url", a["events-url"]))}`);
  sql(`UPDATE clients SET ${sets.join(", ")} WHERE id = ${q(a.id)}`);
  console.log(`Cliente "${a.id}" actualizado.`);
} else if (command === "suspend" || command === "activate") {
  sql(`UPDATE clients SET status = ${q(command === "suspend" ? "suspended" : "active")} WHERE id = ${q(a.id)}`);
  console.log(`Cliente "${a.id}": ${command === "suspend" ? "suspendido (deja de poder operar y de recibir avisos)" : "activo"}.`);
} else {
  fail("Comando desconocido. Usá create, update, suspend, activate, rotate, clear-previous o rotate-events.");
}
