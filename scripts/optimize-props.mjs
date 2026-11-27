#!/usr/bin/env node
// Merges and optimizes the restyled prop GLBs (or re-optimizes an existing merged props.glb)
// into public/models/props.glb using per-prop screen-size texture and triangle budgets:
//   node scripts/optimize-props.mjs <restyle-dir|merged.glb> <out.glb>

import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  compactPrimitive,
  dedup,
  dequantize,
  flatten,
  getBounds,
  join,
  listTextureInfoByMaterial,
  mergeDocuments,
  meshopt,
  palette,
  prune,
  reorder,
  unpartition,
  weldPrimitive,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { PROPS, compactGlb, encodeWebp, materialBudget } from "./props-budget.mjs";

const [inArg, outPath] = process.argv.slice(2);
if (!inArg || !outPath) {
  console.error("usage: node scripts/optimize-props.mjs <restyle-dir|merged.glb> <out.glb>");
  process.exit(1);
}

function materialHasTexture(mat) {
  if (!mat) return false;
  return Boolean(
    mat.getBaseColorTexture() ||
      mat.getNormalTexture() ||
      mat.getMetallicRoughnessTexture() ||
      mat.getOcclusionTexture() ||
      mat.getEmissiveTexture(),
  );
}

function simplifyAttr(prim, ratio, error, flags = ["Permissive", "LockBorder"]) {
  weldPrimitive(prim);
  const pos = prim.getAttribute("POSITION");
  const idx = prim.getIndices();
  if (!pos || !idx) return;
  const tris = idx.getCount() / 3;
  if (tris <= 120) return;
  const nrm = prim.getAttribute("NORMAL")?.getArray();
  const uv = prim.getAttribute("TEXCOORD_0")?.getArray();
  const vCount = pos.getCount();
  const stride = (nrm ? 3 : 0) + (uv ? 2 : 0);
  const srcIdx = new Uint32Array(idx.getArray());
  const targetCount = Math.min(idx.getCount(), Math.max(36, Math.floor(tris * ratio)) * 3);
  let dstIdx;
  if (stride > 0) {
    const attrs = new Float32Array(vCount * stride);
    const weights = [];
    if (nrm) weights.push(0.01, 0.01, 0.01);
    if (uv) weights.push(0.05, 0.05);
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
      flags,
    );
  } else {
    [dstIdx] = MeshoptSimplifier.simplify(srcIdx, pos.getArray(), 3, targetCount, error, flags);
  }
  idx.setArray(dstIdx.length <= 65535 ? new Uint16Array(dstIdx) : dstIdx);
  compactPrimitive(prim);
}


// This display plane belongs to the product scan. It would enlarge the NAS bounds and hover rim.
function removeNasPlane(scene) {
  const planes = [];
  scene.traverse((node) => {
    if (node.getName() === "Plane__0") planes.push(node);
  });
  for (const plane of planes) plane.dispose();
}

function cleanSceneMaterialsAndAttributes(scene, prop) {
  const mats = new Set();
  const prims = [];
  const walk = (n) => {
    const m = n.getMesh();
    if (m) {
      for (const p of m.listPrimitives()) {
        prims.push(p);
        if (p.getMaterial()) mats.add(p.getMaterial());
      }
    }
    for (const c of n.listChildren()) walk(c);
  };
  for (const c of scene.listChildren()) walk(c);

  for (const mat of mats) {
    const mName = mat.getName();
    if (prop.name === "frame" && (mName.includes("artwork") || mName.includes("glass"))) {
      mat.setBaseColorTexture(null);
      mat.setNormalTexture(null);
      mat.setMetallicRoughnessTexture(null);
      mat.setOcclusionTexture(null);
      mat.setEmissiveTexture(null);
    }
    const { dropAux } = materialBudget(prop, mName);
    if (dropAux) {
      mat.setNormalTexture(null);
      mat.setMetallicRoughnessTexture(null);
      mat.setOcclusionTexture(null);
    }
  }

  const usedCoords = new Set([0]);
  for (const mat of mats) {
    for (const info of listTextureInfoByMaterial(mat)) usedCoords.add(info.getTexCoord());
  }

  for (const prim of prims) {
    const pMat = prim.getMaterial();
    const hasTex = materialHasTexture(pMat);
    const keepUvForRuntime = prop.name === "frame" && (pMat?.getName() ?? "").includes("artwork");
    if (!hasTex && !keepUvForRuntime) {
      for (const sem of [...prim.listSemantics()]) {
        if (sem === "TANGENT" || sem.startsWith("TEXCOORD_")) prim.setAttribute(sem, null);
      }
      continue;
    }

    const uv0 = prim.getAttribute("TEXCOORD_0")?.getArray();
    for (const sem of [...prim.listSemantics()]) {
      if (sem === "TANGENT") {
        prim.setAttribute(sem, null);
        continue;
      }
      if (sem.startsWith("TEXCOORD_") && sem !== "TEXCOORD_0") {
        const idx = Number(sem.slice("TEXCOORD_".length));
        const arr = prim.getAttribute(sem)?.getArray();
        let identicalToUv0 = false;
        if (uv0 && arr && uv0.length === arr.length) {
          identicalToUv0 = true;
          for (let i = 0; i < uv0.length; i++) {
            if (Math.abs(uv0[i] - arr[i]) > 1e-6) {
              identicalToUv0 = false;
              break;
            }
          }
        }
        if (!usedCoords.has(idx) || identicalToUv0) {
          if (identicalToUv0 && pMat) {
            for (const info of listTextureInfoByMaterial(pMat)) {
              if (info.getTexCoord() === idx) info.setTexCoord(0);
            }
          }
          prim.setAttribute(sem, null);
        }
      }
    }
  }
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

let mergedDoc;
const isDir = fs.statSync(inArg).isDirectory();

if (isDir) {
  for (const prop of PROPS) {
    const file = path.join(inArg, `${prop.name}-restyle.glb`);
    const subDoc = await io.read(file);
    await subDoc.transform(dequantize());
    for (const a of subDoc.getRoot().listAnimations()) a.dispose();
    const sc = subDoc.getRoot().listScenes()[0];
    if (prop.name === "nas") removeNasPlane(sc);
    if (!prop.keepHierarchy) {
      await subDoc.transform(palette({ min: 3 }), flatten(), join());
    }
    await subDoc.transform(prune({ keepLeaves: true }));
    if (!mergedDoc) mergedDoc = subDoc;
    else mergeDocuments(mergedDoc, subDoc);
  }
  await mergedDoc.transform(unpartition());
} else {
  mergedDoc = await io.read(inArg);
  await mergedDoc.transform(dequantize());
  for (const a of mergedDoc.getRoot().listAnimations()) a.dispose();
}

const root = mergedDoc.getRoot();
const scenes = root.listScenes();
if (scenes.length !== PROPS.length) {
  throw new Error(`Expected ${PROPS.length} prop scenes, found ${scenes.length}`);
}

for (const mat of root.listMaterials()) {
  const nm = mat.getNormalTexture();
  if (nm?.getImage()) {
    const stats = await sharp(Buffer.from(nm.getImage())).stats();
    if (stats.channels.slice(0, 3).every((c) => c.stdev < 0.5)) {
      mat.setNormalTexture(null);
    }
  }
}

let trisBefore = 0;
let trisAfter = 0;
const texBudgets = new Map();
const bumpTex = (tex, maxDim, quality) => {
  if (!tex || maxDim <= 0) return;
  const cur = texBudgets.get(tex);
  if (!cur || maxDim > cur.maxDim) texBudgets.set(tex, { maxDim, quality });
};

for (let i = 0; i < PROPS.length; i++) {
  const prop = PROPS[i];
  const sc = scenes[i];
  if (prop.name === "nas") removeNasPlane(sc);
  cleanSceneMaterialsAndAttributes(sc, prop);

  const boundsBefore = getBounds(sc);
  const sizeBefore = boundsBefore.max.map((v, k) => Math.max(1e-5, v - boundsBefore.min[k]));

  const seenMats = new Set();
  const walk = (n) => {
    const m = n.getMesh();
    if (m) {
      for (const prim of m.listPrimitives()) {
        const countTris = () => {
          const idx = prim.getIndices();
          return idx ? idx.getCount() / 3 : (prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
        };
        trisBefore += countTris();
        const mat = prim.getMaterial();
        const mName = mat?.getName() ?? "";

        if (mat && !seenMats.has(mat)) {
          seenMats.add(mat);
          const { bc, aux } = materialBudget(prop, mName);
          bumpTex(mat.getBaseColorTexture(), bc, bc >= 512 ? 80 : 78);
          bumpTex(mat.getEmissiveTexture(), bc, 78);
          bumpTex(mat.getNormalTexture(), aux, 74);
          bumpTex(mat.getMetallicRoughnessTexture(), aux, 74);
          bumpTex(mat.getOcclusionTexture(), aux, 74);
        }

        const isBulb = mName.endsWith("_light");
        if (!isBulb && prop.ratio < 1) {
          let r = prop.ratio;
          let err = prop.error;
          const flags = ["Permissive", "LockBorder"];
          if (prop.name === "clapper" && /Material\.004/i.test(mName)) {
            // 3 mm bolts on the clapperboard hinge (1,500 tris each in source)
            r = 0.04;
            err = 0.1;
          } else if (prop.name === "breadboard" && /Plastic/i.test(mName)) {
            // Keep the printed breadboard housing crisp while pruning internal pin-hole clips
            r = 0.45;
            err = 0.005;
          } else if (prop.pruneSmall) {
            flags.push("Prune");
          }
          simplifyAttr(prim, r, err, flags);
        }
        trisAfter += countTris();
      }
    }
    for (const c of n.listChildren()) walk(c);
  };
  for (const c of sc.listChildren()) walk(c);

  const boundsAfter = getBounds(sc);
  const relShift = Math.max(
    ...boundsBefore.min.map((v, k) => Math.abs(v - boundsAfter.min[k]) / sizeBefore[k]),
    ...boundsBefore.max.map((v, k) => Math.abs(v - boundsAfter.max[k]) / sizeBefore[k]),
  );
  if (relShift > 0.02) {
    console.warn(`warning: [${prop.name}] bounds shifted by ${(relShift * 100).toFixed(2)}%`);
  }
}

await mergedDoc.transform(dedup(), prune({ keepLeaves: true }));

for (const tex of root.listTextures()) {
  const raw = tex.getImage();
  if (!raw) continue;
  const budget = texBudgets.get(tex) ?? { maxDim: 256, quality: 76 };
  const webp = await encodeWebp(Buffer.from(raw), budget.maxDim, budget.quality);
  tex.setImage(new Uint8Array(webp));
  tex.setMimeType("image/webp");
}

await mergedDoc.transform(
  dedup(),
  prune({ keepLeaves: true }),
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);

const rawGlb = await io.writeBinary(mergedDoc);
const finalBuf = compactGlb(rawGlb);
fs.writeFileSync(outPath, finalBuf);

let texTotal = 0;
for (const t of root.listTextures()) texTotal += t.getImage()?.byteLength ?? 0;
console.log(
  `optimized ${outPath}: ${(finalBuf.length / 1024).toFixed(1)} KB (textures ${(texTotal / 1024).toFixed(1)} KB across ${root.listTextures().length} maps, tris ${Math.round(trisBefore)} -> ${Math.round(trisAfter)})`,
);
