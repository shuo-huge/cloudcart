/**
 * Copies the committed brand icon set from `brand/` to the root of the
 * Workers static-assets output, so `/favicon.ico`, `/favicon.svg`,
 * `/apple-touch-icon.png` and friends resolve without a Worker route.
 */
import fs from "node:fs";
import path from "node:path";

const source = path.resolve("brand");
const target = path.resolve("dist");
const files = [
  "favicon.ico",
  "favicon.svg",
  "favicon-16.png",
  "favicon-32.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
];

if (!fs.existsSync(source)) {
  console.error("The brand/ directory is missing.");
  process.exit(1);
}
if (!fs.existsSync(target)) {
  console.error("dist/ is missing. Run the storefront build first.");
  process.exit(1);
}

for (const file of files) {
  const from = path.join(source, file);
  if (!fs.existsSync(from)) {
    console.error(`Missing brand asset: ${file}. Run \`pnpm icons\` first.`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(target, file));
}

console.log(`Prepared ${files.length} brand icon files at dist/.`);
