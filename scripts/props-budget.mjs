// Per-prop budgets for public/models/props.glb, shared by scripts/optimize-props.mjs (full rebuild)
// and scripts/upgrade-props.mjs (swap one prop's textures in place).
import sharp from "sharp";

// Order must match props=() in scripts/build-props.sh.
export const PROPS = [
  { name: "lamp", bc: 384, aux: 128, ratio: 0.22, error: 0.018 },
  { name: "pens", bc: 256, aux: 128, ratio: 0.35, error: 0.01, keepHierarchy: true },
  { name: "spectacles", bc: 256, aux: 128, ratio: 0.24, error: 0.012 },
  { name: "duck", bc: 128, aux: 128, ratio: 0.28, error: 0.012 },
  { name: "camera", bc: 384, aux: 128, ratio: 0.16, error: 0.012 },
  { name: "plant", bc: 256, aux: 128, ratio: 0.24, error: 0.014 },
  { name: "clock", bc: 512, aux: 128, ratio: 0.35, error: 0.008, keepHierarchy: true },
  { name: "frame", bc: 256, aux: 128, ratio: 1, error: 0 },
  { name: "globe", bc: 512, aux: 192, ratio: 0.32, error: 0.008, keepHierarchy: true },
  { name: "super8", bc: 384, aux: 128, ratio: 0.25, error: 0.012 },
  { name: "phone", bc: 512, aux: 192, ratio: 0.2, error: 0.012, keepHierarchy: true },
  { name: "longhorn", bc: 256, aux: 128, ratio: 0.3, error: 0.012 },
  { name: "rugby", bc: 256, aux: 128, ratio: 0.4, error: 0.01 },
  { name: "skateboard", bc: 384, aux: 128, ratio: 0.26, error: 0.012 },
  { name: "clapper", bc: 256, aux: 128, ratio: 0.35, error: 0.01, keepHierarchy: true },
  { name: "biplane", bc: 256, aux: 128, ratio: 0.16, error: 0.024, pruneSmall: true },
  { name: "chair", bc: 384, aux: 128, ratio: 0.35, error: 0.01 },
  { name: "suitcase", bc: 384, aux: 128, ratio: 0.35, error: 0.01 },
  { name: "breadboard", bc: 256, aux: 128, ratio: 0.1, error: 0.02, pruneSmall: true },
  { name: "multimeter", bc: 512, aux: 128, ratio: 0.26, error: 0.01 },
  { name: "joystick", bc: 256, aux: 128, ratio: 0.26, error: 0.012 },
  { name: "answering", bc: 256, aux: 128, ratio: 0.36, error: 0.01 },
  { name: "rack", bc: 384, aux: 128, ratio: 1, error: 0 }, // unsimplified: vertical raycast finds shelf heights
  { name: "switch", bc: 256, aux: 128, ratio: 0.5, error: 0.01 },
  { name: "nas", bc: 256, aux: 128, ratio: 0.6, error: 0.01 },
  { name: "crt", bc: 512, aux: 192, ratio: 0.22, error: 0.012 },
  { name: "pegboard", bc: 384, aux: 192, ratio: 1, error: 0 },
  { name: "pliers", bc: 256, aux: 128, ratio: 0.26, error: 0.012 },
  { name: "screwdrivers", bc: 256, aux: 128, ratio: 0.26, error: 0.012 },
  { name: "cutters", bc: 256, aux: 128, ratio: 0.35, error: 0.012 },
  { name: "thinkpad", bc: 256, aux: 128, ratio: 0.55, error: 0.008 },
  { name: "macbook", bc: 256, aux: 128, ratio: 0.5, error: 0.008 },
  { name: "c64", bc: 384, aux: 128, ratio: 0.35, error: 0.01 },
  { name: "ivy", bc: 256, aux: 128, ratio: 0.75, error: 0.008 },
  { name: "monstera", bc: 256, aux: 128, ratio: 0.45, error: 0.01 },
  { name: "kiev", bc: 384, aux: 128, ratio: 0.24, error: 0.012 },
];

// The Poly Haven props the camera gets close to (the wide shot, DeskApi.frame close-ups) build from
// their 2K sources (scripts/build-props.sh) and keep more of them: base colour up to 2K where there
// is printing to read (Walkman, clock face, multimeter dial), normal/roughness up to 1K.
// scripts/upgrade-props.mjs swaps these into an existing props.glb without a full rebuild.
const CLOSE_UP = {
  lamp: { bc: 1536, aux: 1024 },
  pens: { bc: 1024, aux: 512 },
  spectacles: { bc: 1024, aux: 512 },
  duck: { bc: 512, aux: 512 },
  camera: { bc: 1024, aux: 512 },
  plant: { bc: 1024, aux: 512 },
  clock: { bc: 2048, aux: 512 },
  frame: { bc: 1024, aux: 512 },
  multimeter: { bc: 2048, aux: 1024 },
  rack: { bc: 1024, aux: 512 },
  pliers: { bc: 1024, aux: 512 },
  screwdrivers: { bc: 1024, aux: 512 },
};

// Detail over bytes: the first speed pass simplified so hard that edges went faceted. Meshopt
// compresses geometry well, so keep near-full triangles and twice the texture size (capped at 1K).
for (const prop of PROPS) {
  if (prop.ratio < 1) {
    prop.ratio = Math.max(prop.ratio, 0.3);
    prop.error = Math.min(prop.error, 0.0015);
  }
  prop.bc = Math.min(1024, prop.bc * 2);
  prop.aux = Math.min(512, prop.aux * 2);
  Object.assign(prop, CLOSE_UP[prop.name]);
}

export function compactGlb(glb) {
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

export function materialBudget(prop, matName) {
  let bc = prop.bc;
  let aux = prop.aux;
  let dropAux = false;
  if (prop.name === "camera" && /strap/i.test(matName)) {
    bc = 512;
    aux = 256;
  } else if (prop.name === "globe" && /base/i.test(matName)) {
    bc = 256;
    aux = 128;
  } else if (prop.name === "phone" && /transparent/i.test(matName)) {
    bc = 128;
    aux = 128;
  } else if (prop.name === "crt") {
    if (/crt_back/i.test(matName)) {
      bc = 128;
      aux = 0;
      dropAux = true;
    } else if (/crt_top/i.test(matName)) {
      bc = 256;
      aux = 128;
    }
  }
  return { bc, aux, dropAux };
}

export async function encodeWebp(imgBytes, maxDim, quality) {
  const meta = await sharp(imgBytes).metadata();
  const w = meta.width ?? maxDim;
  const h = meta.height ?? maxDim;
  const longest = Math.max(w, h);
  let pipe = sharp(imgBytes);
  if (longest > maxDim) {
    const scale = maxDim / longest;
    pipe = pipe.resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), {
      kernel: "lanczos3",
    });
  }
  const candidate = await pipe
    .webp({ quality, alphaQuality: 78, effort: 6, smartSubsample: true })
    .toBuffer();
  if (meta.format === "webp" && longest <= maxDim && imgBytes.byteLength <= candidate.byteLength) {
    return Buffer.from(imgBytes);
  }
  return candidate;
}
