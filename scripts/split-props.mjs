// Keep off-bench furnishings out of the initial download. Preserve animation nodes and pivots.
import fs from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { compactGlb, PROPS } from "./props-budget.mjs";

const peripheral = new Set([
  "rugby",
  "skateboard",
  "chair",
  "suitcase",
  "pegboard",
  "pliers",
  "screwdrivers",
  "cutters",
  "ivy",
  "monstera",
  "kiev",
  "biplane",
  "longhorn",
]);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.decoder": MeshoptDecoder,
  "meshopt.encoder": MeshoptEncoder,
});
for (const pack of ["bench", "fittings"]) {
  const doc = await io.read(process.argv[2]);
  const scenes = doc.getRoot().listScenes();
  if (scenes.length !== PROPS.length) throw new Error("Prop manifest and scene count differ");
  for (const [i, scene] of scenes.entries()) {
    const name = PROPS[i].name;
    if (peripheral.has(name) === (pack === "fittings")) {
      scene.setName(name);
    } else {
      scene.dispose();
    }
  }
  await doc.transform(prune({ keepAttributes: true, keepLeaves: true }));
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await fs.writeFile(`public/models/${pack}.glb`, compactGlb(await io.writeBinary(doc)));
}
