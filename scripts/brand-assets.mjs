import { createRequire } from "node:module";
import { writeFile, copyFile, mkdir } from "node:fs/promises";
const sharp = createRequire(
  new URL("../nexora-api/package.json", import.meta.url),
)("sharp");
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#173f35"/><path d="M337 164a130 130 0 1 0 0 184" fill="none" stroke="#f5f6ed" stroke-width="58" stroke-linecap="round"/><path d="M362 126v76m-38-38h76m-65-27 54 54m0-54-54 54" fill="none" stroke="#a8c49b" stroke-width="12" stroke-linecap="round"/></svg>';
const base = new URL("../nexora-backoffice/public/", import.meta.url);
await writeFile(new URL("favicon.svg", base), svg);
for (const [name, size] of [
  ["favicon-16x16.png", 16],
  ["favicon-32x32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(new URL(name, base).pathname);
const png = await sharp(Buffer.from(svg)).resize(32, 32).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 32;
ico[7] = 32;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile(new URL("favicon.ico", base), Buffer.concat([ico, png]));
const app = new URL("../horekia-app/public/", import.meta.url);
await mkdir(app, { recursive: true });
for (const name of [
  "favicon.svg",
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
])
  await copyFile(new URL(name, base), new URL(name, app));
await sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile(new URL("../horekia-app/assets/icon.png", import.meta.url).pathname);
await copyFile(
  new URL("icon-192.png", base),
  new URL("../horekia-app/assets/favicon.png", import.meta.url),
);
