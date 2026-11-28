// Rebuild the static, UV-mapped exterior from Snupp's downloaded scene.gltf.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, flatten, join, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node scripts/optimize-crawler.mjs scene.gltf crawler.glb");
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(source);
const material = doc.getRoot().listMaterials()[0];
for (const [texture, size, quality] of [
  [material.getBaseColorTexture(), 2048, 85],
  [material.getNormalTexture(), 1024, 86],
  [material.getMetallicRoughnessTexture(), 1024, 84],
  [material.getEmissiveTexture(), 256, 83],
]) {
  const bytes = await sharp(texture.getImage()).resize(size, size, {fit:"inside"}).webp({quality, effort:6}).toBuffer();
  texture.setImage(bytes).setMimeType("image/webp");
}
doc.createExtension(EXTTextureWebP).setRequired(true);
await doc.transform(flatten(), join(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: .62, error: .001 }),
  dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(destination, doc);
