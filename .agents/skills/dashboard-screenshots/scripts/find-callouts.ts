// Lists images that contain red callout borders (pixels near #e8212e) so recaptures can reproduce them.
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const assets = resolve(import.meta.dir, "../../../../src/frontend/src/assets/dashboard");
const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.png$/.test(f) && files.push(p); });
walk(assets);
for (const f of files) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += 3) if (data[i] > 200 && data[i + 1] < 70 && data[i + 2] < 80 && data[i] - data[i + 1] > 150) n++;
  if (n > info.width * 2) console.log(`${f.slice(assets.length + 1).replace(/\\/g, "/")}\t${n}`);
}
