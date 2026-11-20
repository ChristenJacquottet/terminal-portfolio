#!/usr/bin/env node
// Encodes the room's surface textures (desk top, floor, wall relief) into public/textures as WebP,
// at full size and at half size for phones (public/textures/half/, picked in src/room.ts).
//   node scripts/room-textures.mjs path/to/downloads
// Sources, all CC0:
//   Poly Haven oak_wood_planks 2K (https://polyhaven.com/a/oak_wood_planks): <dir>/oak_wood_planks/oak_wood_planks_{diff,nor_gl,rough}_2k.*
//   Poly Haven old_wood_floor 2K (https://polyhaven.com/a/old_wood_floor): <dir>/old_wood_floor/old_wood_floor_{diff,nor_gl}_2k.*
//   ambientCG Wallpaper001A 1K-JPG (https://ambientcg.com/a/Wallpaper001A): <dir>/Wallpaper001A/Wallpaper001A_1K-JPG_NormalGL.jpg
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/room-textures.mjs path/to/downloads");
  process.exit(1);
}
const out = "public/textures";
fs.mkdirSync(path.join(out, "half"), { recursive: true });

// [output name, source, size, kind]. Colour maps are lossy; normals keep more quality (their
// errors show as lighting); roughness is one channel, stored grey.
const JOBS = [
  ["oak_diff", "oak_wood_planks/oak_wood_planks_diff_2k.jpg", 2048, "color"],
  ["oak_nor_gl", "oak_wood_planks/oak_wood_planks_nor_gl_2k.png", 2048, "normal"],
  ["oak_rough", "oak_wood_planks/oak_wood_planks_rough_2k.png", 1024, "grey"],
  ["floor_diff", "old_wood_floor/old_wood_floor_diff_2k.jpg", 1024, "color"],
  ["floor_nor_gl", "old_wood_floor/old_wood_floor_nor_gl_2k.png", 1024, "normal"],
  ["wall_nor_gl", "Wallpaper001A/Wallpaper001A_1K-JPG_NormalGL.jpg", 1024, "normal"],
];

const encode = (img, kind) => {
  if (kind === "normal") return img.webp({ quality: 86, effort: 6, smartSubsample: true });
  if (kind === "grey") return img.toColourspace("b-w").webp({ quality: 72, effort: 6 });
  return img.webp({ quality: 82, effort: 6, smartSubsample: true });
};

let total = 0;
let half = 0;
for (const [name, file, size, kind] of JOBS) {
  const input = fs.readFileSync(path.join(src, file));
  for (const [dir, dim] of [
    [out, size],
    [path.join(out, "half"), size / 2],
  ]) {
    const buf = await encode(sharp(input).removeAlpha().resize(dim, dim, { kernel: "lanczos3" }), kind).toBuffer();
    fs.writeFileSync(path.join(dir, `${name}.webp`), buf);
    if (dir === out) total += buf.length;
    else half += buf.length;
    console.log(`${path.join(dir, name)}.webp ${dim}px ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
console.log(`room textures: ${(total / 1024).toFixed(0)} KB (phones ${(half / 1024).toFixed(0)} KB)`);
