import fs from "node:fs";
import path from "node:path";

/**
 * Vite writes the admin SPA to dist/static/admin-ui so its JS/CSS are served
 * from the working /static/* asset prefix. The HTML entry point is moved to
 * dist/admin/index.html, where the Worker serves it for /admin SPA routes.
 */
const source = path.resolve("dist/static/admin-ui/index.html");
const targetDir = path.resolve("dist/admin");
const target = path.join(targetDir, "index.html");

if (!fs.existsSync(source)) {
  console.error("The admin build did not produce dist/static/admin-ui/index.html.");
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
fs.rmSync(source);

console.log("Prepared admin shell at dist/admin/index.html");
