/**
 * Regenerates the CloudCart favicon/app icon set from the SVG masters in
 * `brand/`. The generated PNG/ICO files are committed so a normal build does
 * not need a browser; run this script only when the master artwork changes.
 *
 * Usage: pnpm icons
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "brand");
const docsPublic = path.join(root, "apps", "docs", "public");

const PNG_JOBS = [
  { source: "icon.svg", size: 16, file: "favicon-16.png", transparent: true },
  { source: "icon.svg", size: 32, file: "favicon-32.png", transparent: true },
  { source: "icon-square.svg", size: 180, file: "apple-touch-icon.png", transparent: false },
  { source: "icon-square.svg", size: 192, file: "icon-192.png", transparent: false },
  { source: "icon-square.svg", size: 512, file: "icon-512.png", transparent: false },
  { source: "icon-maskable.svg", size: 512, file: "icon-maskable-512.png", transparent: false },
];

const ICO_SIZES = [16, 32, 48];

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((image, index) => {
    const entry = index * 16;
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

const svgCache = new Map();
async function readSvg(name) {
  if (!svgCache.has(name)) {
    svgCache.set(name, await fsp.readFile(path.join(brandDir, name), "utf8"));
  }
  return svgCache.get(name);
}

async function renderPng(page, source, size, file, transparent) {
  const svg = await readSvg(source);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>
      html, body { margin: 0; padding: 0; background: ${transparent ? "transparent" : "#173d2b"}; }
      svg { display: block; width: ${size}px; height: ${size}px; }
    </style></head><body>${svg}</body></html>`,
  );
  const target = path.join(brandDir, file);
  await page.screenshot({ path: target, omitBackground: transparent });
  return { file: target, data: await fsp.readFile(target) };
}

async function main() {
  await fsp.mkdir(docsPublic, { recursive: true });
  await fsp.copyFile(path.join(brandDir, "icon.svg"), path.join(brandDir, "favicon.svg"));
  await fsp.copyFile(path.join(brandDir, "icon.svg"), path.join(docsPublic, "favicon.svg"));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pngs = new Map();

  try {
    for (const job of PNG_JOBS) {
      const result = await renderPng(page, job.source, job.size, job.file, job.transparent);
      pngs.set(job.file, result.data);
      console.log(`icon ${job.file} (${job.size}×${job.size})`);
    }

    // The ICO bundles PNG-compressed frames, supported by every current browser.
    const frames = [];
    for (const size of [16, 32, 48]) {
      const rendered = await renderPng(page, "icon.svg", size, `fallback-${size}.png`, true);
      frames.push({ size, data: rendered.data });
    }
    await fsp.writeFile(path.join(brandDir, "favicon.ico"), buildIco(frames));
    for (const size of [16, 32, 48]) {
      await fsp.rm(path.join(brandDir, `fallback-${size}.png`), { force: true });
    }
    console.log("icon favicon.ico (16, 32, 48)");
  } finally {
    await browser.close();
  }

  // Keep the docs site's public assets in sync with the masters.
  for (const file of [
    "favicon.ico",
    "favicon-16.png",
    "favicon-32.png",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
  ]) {
    await fsp.copyFile(path.join(brandDir, file), path.join(docsPublic, file));
  }

  console.log(`Icons written to ${path.relative(root, brandDir)} and ${path.relative(root, docsPublic)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
