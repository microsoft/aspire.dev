// Review aid: bun scripts/sheet.ts <out.png> <image paths relative to assets/dashboard...>
// Tiles the given images (downscaled, in order, 3 per row) into one PNG so many captures can be checked at a glance.
import { join, resolve } from "node:path";
import sharp from "sharp";

const [out, ...files] = process.argv.slice(2);
const assets = resolve(import.meta.dir, "../../../../src/frontend/src/assets/dashboard");
const cols = 3, cell = 640;
const tiles = await Promise.all(files.map(async (f) => {
  const img = sharp(join(assets, f)).resize({ width: cell, height: cell, fit: "inside", background: "#888" });
  return { input: await img.toBuffer() };
}));
const rows = Math.ceil(tiles.length / cols);
const rowH = cell;
await sharp({ create: { width: cols * (cell + 8), height: rows * (rowH + 8), channels: 3, background: "#777" } })
  .composite(tiles.map((t, i) => ({ ...t, left: (i % cols) * (cell + 8), top: Math.floor(i / cols) * (rowH + 8) })))
  .png().toFile(out);
console.log(`${files.length} tiles -> ${out}`);
