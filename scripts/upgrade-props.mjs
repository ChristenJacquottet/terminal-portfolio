#!/usr/bin/env node
// Swaps higher-resolution textures into an existing public/models/props.glb, one prop at a time,
// without rebuilding (the Sketchfab sources aren't in the repo). Geometry, node names, scene order
// and every other prop stay byte-for-byte as they are; only the listed props' texture images change.
//
//   node scripts/upgrade-props.mjs <restyle-dir> [props.glb] [prop,prop,...]
//
// <restyle-dir> holds <name>-restyle.glb files from scripts/restyle.py (Blender, or the bpy wheel:
// `uv pip install bpy` into a Python 3.13 venv, then `python scripts/restyle.py -- in out art/restyle.json`).
// Each material is matched by name; only texture slots the prop already uses are replaced, at the
// budgets in scripts/props-budget.mjs, so earlier decisions (dropped maps, flat normals) hold.

import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { PROPS, compactGlb, encodeWebp, materialBudget } from "./props-budget.mjs";

const [dir, glbPath = "public/models/props.glb", onlyArg] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/upgrade-props.mjs <restyle-dir> [props.glb] [prop,prop,...]");
  process.exit(1);
}
const only = onlyArg ? new Set(onlyArg.split(",")) : null;

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const doc = await io.read(glbPath);
const root = doc.getRoot();
const scenes = root.listScenes();
if (scenes.length !== PROPS.length) throw new Error(`Expected ${PROPS.length} prop scenes, found ${scenes.length}`);

const SLOTS = [
  ["BaseColor", "bc"],
  ["Emissive", "bc"],
  ["Normal", "aux"],
  ["MetallicRoughness", "aux"],
  ["Occlusion", "aux"],
];
const sizeOf = (img) => img?.byteLength ?? 0;
const before = fs.statSync(glbPath).size;

for (let i = 0; i < PROPS.length; i++) {
  const prop = PROPS[i];
  if (only && !only.has(prop.name)) continue;
  const file = path.join(dir, `${prop.name}-restyle.glb`);
  if (!fs.existsSync(file)) continue;

  const src = await io.read(file);
  const srcMats = new Map(src.getRoot().listMaterials().map((m) => [m.getName(), m]));
  const mats = new Set();
  scenes[i].traverse((n) => {
    for (const p of n.getMesh()?.listPrimitives() ?? []) if (p.getMaterial()) mats.add(p.getMaterial());
  });

  let was = 0;
  let now = 0;
  for (const mat of mats) {
    const from = srcMats.get(mat.getName());
    if (!from) {
      console.warn(`[${prop.name}] no material "${mat.getName()}" in ${file}`);
      continue;
    }
    const budget = materialBudget(prop, mat.getName());
    for (const [slot, kind] of SLOTS) {
      const cur = mat[`get${slot}Texture`]();
      const next = from[`get${slot}Texture`]();
      if (!cur || !next?.getImage()) continue;
      const maxDim = budget[kind];
      if (!maxDim) continue;
      let img = Buffer.from(next.getImage());
      if (slot === "Normal") {
        const stats = await sharp(img).stats();
        if (stats.channels.slice(0, 3).every((c) => c.stdev < 0.5)) continue;
      }
      const quality = kind === "bc" ? (maxDim >= 512 ? 80 : 78) : 74;
      img = await encodeWebp(img, maxDim, quality);
      was += sizeOf(cur.getImage());
      now += img.byteLength;
      const tex = doc.createTexture(cur.getName()).setImage(new Uint8Array(img)).setMimeType("image/webp");
      mat[`set${slot}Texture`](tex);
    }
  }
  console.log(`${prop.name}: textures ${(was / 1024).toFixed(0)} KB -> ${(now / 1024).toFixed(0)} KB`);
}

await doc.transform(dedup({ propertyTypes: ["Texture"] }), prune({ keepLeaves: true, propertyTypes: ["Texture"] }));
// Re-encode geometry the way optimize-props.mjs wrote it (meshopt "high": filtered), not the default.
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
const out = compactGlb(await io.writeBinary(doc));
fs.writeFileSync(glbPath, out);
console.log(`${glbPath}: ${(before / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
