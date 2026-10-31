#!/usr/bin/env bash
# Rebuilds public/models/apple-ii.glb from the Sketchfab glTF download (114 MB → ~640 KB).
#   scripts/build-model.sh path/to/scene.gltf
# Hero baseColour maps go to 1024 px, ORM/normal maps to 256 px, rear cable to 256/128 px, all WebP;
# duplicate UV sets and dead textures are pruned, non-screen meshes are simplified, and geometry is meshopt-compressed.
set -euo pipefail
src="${1:?usage: scripts/build-model.sh path/to/scene.gltf}"
node scripts/optimize-model.mjs "$src" public/models/apple-ii.glb
ls -lh public/models/apple-ii.glb
