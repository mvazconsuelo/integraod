/**
 * Suma una app nueva: copia una existente, la renombra, le asigna puertos propios y la registra como cliente del servicio de pagos (local).
 *
 *   npm run new-app -- peluqueria-roquel [--from integra-od]
 *
 * Después: cargar sus datos propios (migraciones/catálogos), `npm install`, y para producción dar de alta el cliente con `--remote`.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: { from: { type: "string", default: "integra-od" } } });
const [name] = positionals, from = values.from;
const fail = (m) => { console.error(`Error: ${m}`); process.exit(1); };

if (!name || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(name)) fail("Indicá el nombre: minúsculas, números y guiones (3 a 40). Ej: npm run new-app -- peluqueria-roquel");
if (!existsSync(join(root, from, "worker/wrangler.toml"))) fail(`No existe la app de origen "${from}".`);
if (existsSync(join(root, name))) fail(`Ya existe la carpeta "${name}".`);

// Puertos: el siguiente par libre (la app, y el inspector del worker).
const apps = readdirSync(root).filter((d) => existsSync(join(root, d, "worker/wrangler.toml")));
const used = apps.map((a) => Number(/^port = (\d+)/m.exec(readFileSync(join(root, a, "worker/wrangler.toml"), "utf8"))?.[1] ?? 8787));
let port = Math.max(8787, ...used) + 1;
if (port === 8788) port++; // 8788 es del servicio de pagos
const inspector = 9300 + apps.length;

const SKIP = new Set(["node_modules", "dist", ".wrangler", ".dev.vars"]);
cpSync(join(root, from), join(root, name), { recursive: true, filter: (src) => !SKIP.has(src.split("/").pop()) });

/** Reemplaza el nombre viejo por el nuevo en archivos de configuración y de texto (no toca el código de la app). */
const rewrite = (file, fn) => { const p = join(root, name, file); if (existsSync(p)) writeFileSync(p, fn(readFileSync(p, "utf8"))); };
const rename = (s) => s.replaceAll(from, name);
for (const f of ["package.json", "frontend/package.json", "worker/package.json", "README.md"]) rewrite(f, rename);
rewrite("worker/wrangler.toml", (s) => rename(s).replace(/^port = \d+/m, `port = ${port}`).replace(/^inspector_port = \d+/m, `inspector_port = ${inspector}`));
rewrite("frontend/vite.config.ts", (s) => s.replace("localhost:8787", `localhost:${port}`));

// Claves de desarrollo y alta local como cliente del servicio de pagos.
const secret = randomBytes(32).toString("hex"), eventsSecret = randomBytes(32).toString("hex");
writeFileSync(join(root, name, "worker/.dev.vars"), `ADMIN_TOKEN=dev-token\nAPP_BASE_URL=http://localhost:${port}\nSVC_SECRET_CORE=${secret}\nSVC_SECRET_EVENTS=${eventsSecret}\n`);
try {
  execFileSync("node", ["scripts/client.ts", "create", "--local", "--id", name, "--name", name, "--app-url", `http://localhost:${port}`, "--events-url", `http://localhost:${port}/api/internal/payment-events`, "--secret", secret, "--events-secret", eventsSecret], { cwd: join(root, "payments"), stdio: "ignore" });
  console.log(`✔ Registrada como cliente local de payments (id: ${name})`);
} catch {
  console.log(`! No pude registrarla en payments. Corré: npm run migrate:local --prefix payments  y después:\n  node payments/scripts/client.ts create --local --id ${name} --name ${name} --app-url http://localhost:${port} --events-url http://localhost:${port}/api/internal/payment-events --secret ${secret} --events-secret ${eventsSecret}`);
}

console.log(`
✔ Creada la carpeta ${name}/ (puerto ${port}). Siguientes pasos:
  1. npm install
  2. npm run migrate:local --prefix ${name}
  3. npm run build --prefix ${name} && npm run dev --prefix ${name}      → http://localhost:${port}
  4. Revisar lo propio de esa entidad (textos, catálogo, migraciones): se copió tal cual de "${from}".
  5. Producción: wrangler d1 create ${name}, poner su database_id en ${name}/worker/wrangler.toml, y
     npm run client -w payments -- create --id ${name} --name "..." --app-url https://... --events-url https://.../api/internal/payment-events --remote
`);
