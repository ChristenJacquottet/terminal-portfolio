#!/usr/bin/env node
// Optimizes public/models/apple-ii.glb without shifting the CRT tube or Disk II bounds:
//   node scripts/optimize-model.mjs <in.glb|scene.gltf> <out.glb>

import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  compactPrimitive,
  dedup,
  dequantize,
  getBounds,
  listTextureInfoByMaterial,
  meshopt,
  prune,
  reorder,
  weldPrimitive,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: node scripts/optimize-model.mjs <in.glb|scene.gltf> <out.glb>");
  process.exit(1);
}

function compactGlb(glb) {
  const buf = Buffer.from(glb.buffer, glb.byteOffset, glb.byteLength);
  const version = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  const jsonObj = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const minJson = Buffer.from(JSON.stringify(jsonObj), "utf8");
  const pad = (4 - (minJson.length % 4)) % 4;
  const paddedJson = pad ? Buffer.concat([minJson, Buffer.alloc(pad, 0x20)]) : minJson;
  const rest = buf.subarray(20 + jsonLen);
  const total = 12 + 8 + paddedJson.length + rest.length;
  const out = Buffer.allocUnsafe(total);
  out.write("glTF", 0, 4, "ascii");
  out.writeUInt32LE(version, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(paddedJson.length, 12);
  out.writeUInt32LE(jsonType, 16);
  paddedJson.copy(out, 20);
  rest.copy(out, 20 + paddedJson.length);
  return out;
}

async function encodeWebp(imgBytes, maxDim, quality) {
  const meta = await sharp(imgBytes).metadata();
  const w = meta.width ?? maxDim;
  const h = meta.height ?? maxDim;
  const longest = Math.max(w, h);
  if (meta.format === "webp" && longest <= maxDim) return null;
  let pipe = sharp(imgBytes);
  if (longest > maxDim) {
    const scale = maxDim / longest;
    pipe = pipe.resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), {
      kernel: "lanczos3",
    });
  }
  return pipe.webp({ quality, alphaQuality: 85, effort: 6, smartSubsample: true }).toBuffer();
}

function simplifyAttr(prim, ratio, error) {
  weldPrimitive(prim);
  const pos = prim.getAttribute("POSITION");
  const idx = prim.getIndices();
  if (!pos || !idx) return;
  const tris = idx.getCount() / 3;
  if (tris <= 300) return;
  const nrm = prim.getAttribute("NORMAL")?.getArray();
  const uv = prim.getAttribute("TEXCOORD_0")?.getArray();
  const vCount = pos.getCount();
  const stride = (nrm ? 3 : 0) + (uv ? 2 : 0);
  const srcIdx = new Uint32Array(idx.getArray());
  const targetCount = Math.max(120, Math.floor(tris * ratio)) * 3;
  let dstIdx;
  if (stride > 0) {
    const attrs = new Float32Array(vCount * stride);
    const weights = [];
    if (nrm) weights.push(0.015, 0.015, 0.015);
    if (uv) weights.push(0.08, 0.08);
    for (let v = 0; v < vCount; v++) {
      let o = v * stride;
      if (nrm) {
        attrs[o++] = nrm[v * 3];
        attrs[o++] = nrm[v * 3 + 1];
        attrs[o++] = nrm[v * 3 + 2];
      }
      if (uv) {
        attrs[o++] = uv[v * 2];
        attrs[o++] = uv[v * 2 + 1];
      }
    }
    [dstIdx] = MeshoptSimplifier.simplifyWithAttributes(
      srcIdx,
      pos.getArray(),
      3,
      attrs,
      stride,
      weights,
      null,
      targetCount,
      error,
      ["Permissive", "LockBorder"],
    );
  } else {
    [dstIdx] = MeshoptSimplifier.simplify(srcIdx, pos.getArray(), 3, targetCount, error, ["Permissive", "LockBorder"]);
  }
  idx.setArray(dstIdx.length <= 65535 ? new Uint16Array(dstIdx) : dstIdx);
  compactPrimitive(prim);
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const doc = await io.read(inPath);
const root = doc.getRoot();
await doc.transform(dequantize());

const sceneBefore = getBounds(root.listScenes()[0]);

for (const mat of root.listMaterials()) {
  for (const info of listTextureInfoByMaterial(mat)) {
    if (info.getTexCoord() !== 0) info.setTexCoord(0);
  }
  const mName = mat.getName();
  if (/monitor_screen/i.test(mName)) {
    mat.setBaseColorTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setNormalTexture(null);
    mat.setOcclusionTexture(null);
    mat.setEmissiveTexture(null);
    continue;
  }
  const nm = mat.getNormalTexture();
  if (nm?.getImage()) {
    const stats = await sharp(Buffer.from(nm.getImage())).stats();
    if (stats.channels.slice(0, 3).every((c) => c.stdev < 0.5)) {
      mat.setNormalTexture(null);
    }
  }
}

for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const sem of [...prim.listSemantics()]) {
      if (sem === "TEXCOORD_1" || sem === "TEXCOORD_2" || sem === "TANGENT") {
        prim.setAttribute(sem, null);
      }
    }
  }
}

const texBudget = new Map();
const bump = (tex, maxDim, q) => {
  if (!tex) return;
  const cur = texBudget.get(tex);
  if (!cur || maxDim > cur.maxDim) texBudget.set(tex, { maxDim, q });
};
for (const mat of root.listMaterials()) {
  const isCable = /cable/i.test(mat.getName());
  bump(mat.getBaseColorTexture(), isCable ? 256 : 1024, isCable ? 78 : 82);
  bump(mat.getEmissiveTexture(), isCable ? 256 : 512, 80);
  bump(mat.getMetallicRoughnessTexture(), isCable ? 128 : 256, 78);
  bump(mat.getOcclusionTexture(), isCable ? 128 : 256, 78);
  bump(mat.getNormalTexture(), isCable ? 128 : 256, 78);
}

for (const [tex, { maxDim, q }] of texBudget) {
  const raw = tex.getImage();
  if (!raw) continue;
  const updated = await encodeWebp(Buffer.from(raw), maxDim, q);
  if (updated) {
    tex.setImage(new Uint8Array(updated));
    tex.setMimeType("image/webp");
  }
}

let trisBefore = 0;
let trisAfter = 0;
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const countTris = () => {
      const idx = prim.getIndices();
      return idx ? idx.getCount() / 3 : (prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    };
    trisBefore += countTris();
    const mName = prim.getMaterial()?.getName() ?? "";
    if (!/monitor_screen/i.test(mName)) {
      const isCable = /cable/i.test(mName);
      simplifyAttr(prim, isCable ? 0.15 : 0.36, isCable ? 0.018 : 0.0045);
    }
    trisAfter += countTris();
  }
}

await doc.transform(
  dedup(),
  prune({ keepLeaves: true }),
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);

const sceneAfter = getBounds(root.listScenes()[0]);
const rawOut = await io.writeBinary(doc);
const finalBuf = compactGlb(rawOut);
fs.writeFileSync(outPath, finalBuf);

console.log(
  `optimized ${outPath}: ${(finalBuf.length / 1024).toFixed(1)} KB, tris ${Math.round(trisBefore)} -> ${Math.round(trisAfter)}, bounds shift max=${Math.max(
    ...sceneBefore.min.map((v, i) => Math.abs(v - sceneAfter.min[i])),
    ...sceneBefore.max.map((v, i) => Math.abs(v - sceneAfter.max[i])),
  ).toExponential(2)}`,
);
