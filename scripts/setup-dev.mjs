/**
 * Deja todo listo para correr en local con el checkout simulado (piloto). Se puede repetir sin romper nada.
 *
 *   npm run setup -- [app]        (por defecto: integra-od)
 *   npm run dev --prefix <app>    (levanta payments y la app)
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const app = process.argv[2] ?? "integra-od";
const fail = (m) => { console.error(`Error: ${m}`); process.exit(1); };
if (!existsSync(join(root, app, "worker/wrangler.toml"))) fail(`No existe la app "${app}".`);

const run = (cmd, args, cwd) => {
  try { return execFileSync(cmd, args, { cwd: join(root, cwd), stdio: "pipe" }); } catch (e) {
    // Mostrar solo lo útil: el error de la herramienta, no el volcado completo.
    console.error(`\nFalló: ${cmd} ${args.slice(0, 4).join(" ")}…\n${String(e.stderr ?? e.message).trim().split("\n").slice(0, 6).join("\n")}`);
    process.exit(1);
  }
};
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");
const get = (text, key) => new RegExp(`^${key}=(.+)$`, "m").exec(text)?.[1];

const port = /^port = (\d+)/m.exec(read(join(root, app, "worker/wrangler.toml")))?.[1] ?? "8787";

// 1) payments: claves y checkout simulado
const payVars = join(root, "payments/.dev.vars");
if (!existsSync(payVars)) {
  writeFileSync(payVars, `PUBLIC_BASE_URL=http://localhost:8788\nTOKEN_ENC_KEY=${randomBytes(32).toString("base64")}\nMP_MOCK=true\n`);
  console.log("✔ payments/.dev.vars creado (MP_MOCK=true)");
}
const tokenKey = get(read(payVars), "TOKEN_ENC_KEY") ?? fail("Falta TOKEN_ENC_KEY en payments/.dev.vars");
run("npm", ["run", "migrate:local"], "payments");
console.log("✔ base de payments al día");

// 2) la app: claves (las que ya tiene, o nuevas)
const appVars = join(root, app, "worker/.dev.vars");
let vars = read(appVars);
const secret = get(vars, "SVC_SECRET_CORE") ?? randomBytes(32).toString("hex");
const eventsSecret = get(vars, "SVC_SECRET_EVENTS") ?? randomBytes(32).toString("hex");
if (!vars) {
  vars = `ADMIN_TOKEN=dev-token\nAPP_BASE_URL=http://localhost:${port}\nSVC_SECRET_CORE=${secret}\nSVC_SECRET_EVENTS=${eventsSecret}\n`;
  writeFileSync(appVars, vars);
  console.log(`✔ ${app}/worker/.dev.vars creado`);
}

// 3) la app como cliente de payments: si ya existe se actualizan sus claves (no se borra: tiene cobros asociados)
const clientArgs = ["--local", "--id", app, "--secret", secret, "--events-secret", eventsSecret, "--app-url", `http://localhost:${port}`, "--events-url", `http://localhost:${port}/api/internal/payment-events`];
try {
  execFileSync("node", ["scripts/client.ts", "create", ...clientArgs, "--name", app], { cwd: join(root, "payments"), stdio: "pipe" });
  console.log(`✔ ${app} registrada como cliente de payments`);
} catch {
  run("node", ["scripts/client.ts", "update", ...clientArgs], "payments");
  console.log(`✔ ${app} ya estaba registrada: claves actualizadas (los cobros se conservan)`);
}

// 4) base y frontend de la app
run("npm", ["run", "migrate:local"], app);
console.log("✔ base de la app al día");
run("npm", ["run", "build"], app);
console.log("✔ frontend compilado");

console.log(`
Listo. Para levantar todo:

  npm run dev --prefix ${app}          (los dos workers juntos, con el binding real, igual que en producción)
  npm run dev:split --prefix ${app}    (payments en :8788 aparte: para probar Mercado Pago real con un túnel)

Abrí http://localhost:${port} — clave de acceso: ${get(vars, "ADMIN_TOKEN") ?? "(ADMIN_TOKEN de worker/.dev.vars)"}
Los pagos son simulados: en el link de pago hay botones para aprobar, rechazar o dejar pendiente.
`);
