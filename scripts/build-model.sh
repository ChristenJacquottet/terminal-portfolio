#!/usr/bin/env bash
# Rebuilds public/models/apple-ii.glb from the Sketchfab glTF download (114 MB → ~1 MB).
#   scripts/build-model.sh path/to/scene.gltf
# Normal and roughness maps go to 512 px, colour maps to 1024 px, all WebP; geometry is meshopt-compressed.
set -euo pipefail
src="${1:?usage: scripts/build-model.sh path/to/scene.gltf}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
npx --no-install gltf-transform resize "$src" "$tmp/stage.glb" --pattern "*{normal,metallicRoughness}*" --width 512 --height 512
npx --no-install gltf-transform optimize "$tmp/stage.glb" public/models/apple-ii.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false
ls -lh public/models/apple-ii.glb
