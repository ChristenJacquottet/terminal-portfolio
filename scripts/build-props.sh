#!/usr/bin/env bash
# Rebuilds public/models/props.glb from Poly Haven (CC0) 1k glTF downloads.
#   scripts/build-props.sh path/to/downloads
# Expects <dir>/<id>/<id>_1k.gltf for each id below (https://polyhaven.com/a/<id>). The order matters:
# src/props.ts reads the merged scenes in this order.
set -euo pipefail
src="${1:?usage: scripts/build-props.sh path/to/downloads}"
ids=(desk_lamp_arm_01 portable_cassette_player office_notepads stationery_supplies round_spectacles rubber_duck_toy)
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for id in "${ids[@]}"; do
  npx --no-install gltf-transform optimize "$src/$id/${id}_1k.gltf" "$tmp/$id.glb" --compress false --texture-compress webp --texture-size 512 --simplify false
done
npx --no-install gltf-transform merge $(printf "$tmp/%s.glb " "${ids[@]}") "$tmp/merged.glb"
npx --no-install gltf-transform simplify "$tmp/merged.glb" "$tmp/simple.glb" --ratio 0.5 --error 0.0005
npx --no-install gltf-transform meshopt "$tmp/simple.glb" public/models/props.glb
ls -lh public/models/props.glb
