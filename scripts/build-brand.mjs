#!/usr/bin/env node
/**
 * Build web-ready brand assets from the full-resolution masters.
 *
 *   pnpm brand:build
 *
 * Masters live in brand-source/ and are not served. Output goes to
 * apps/web/public/brand/ as WebP (transparent art) and JPEG (social card).
 */
import { createRequire } from "node:module";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "brand-source");
const OUT = join(root, "apps", "web", "public", "brand");

/** [master, output name, max width] */
const ART = [
  ["mascot-fire.png", "mascot-fire", 1000],
  ["mascot-torch.png", "mascot-torch", 820],
  ["mascot-head.png", "mascot-head", 560],
  ["emblem.png", "emblem", 480],
  ["wordmark.png", "wordmark", 1100],
  ["free-burns.png", "free-burns", 860],
];

await mkdir(OUT, { recursive: true });

for (const [master, name, width] of ART) {
  const to = join(OUT, `${name}.webp`);
  await sharp(join(SRC, master)).resize({ width, withoutEnlargement: true }).webp({ quality: 86, effort: 6, alphaQuality: 90 }).toFile(to);
  const { size } = await stat(to);
  console.log(`${name}.webp`.padEnd(20), `${(size / 1e3).toFixed(0)}KB`);
}

await sharp(join(SRC, "banner.png"))
  .resize({ width: 1200 })
  .flatten({ background: "#050505" })
  .jpeg({ quality: 80, mozjpeg: true })
  .toFile(join(OUT, "social-card.jpg"));

for (const [size, name] of [
  [180, "apple-icon.png"],
  [64, "icon.png"],
]) {
  await sharp(join(SRC, "emblem.png"))
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, name));
}

console.log("brand assets written to apps/web/public/brand");
