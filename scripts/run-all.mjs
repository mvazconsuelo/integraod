/** Corre un script de npm en el servicio de pagos y en cada app (toda carpeta que tenga worker/wrangler.toml). */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = process.argv[2];
const apps = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(`${root}${d.name}/worker/wrangler.toml`)).map((d) => d.name);

for (const dir of ["payments", ...apps]) {
  console.log(`\n▶ ${dir}: npm run ${script}`);
  execFileSync("npm", ["run", script, "--prefix", `${root}${dir}`], { stdio: "inherit" });
}
