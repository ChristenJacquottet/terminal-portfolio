#!/usr/bin/env bash
# Rebuilds public/models/props.glb from the downloads below.
#   scripts/build-props.sh path/to/downloads
# Poly Haven (CC0): <dir>/<id>/<id>_1k.gltf (https://polyhaven.com/a/<id>).
# Sketchfab (CC BY, credited in src/credit.ts): <dir>/sketchfab/<name>.glb, the 1k-texture glb download.
# longhorn-up.glb is the 830k-face scan decimated in Blender first (Decimate 0.03 per mesh, ~30k faces), then
# joined and turned to face +z along its principal axes.
# The order matters: src/props.ts reads the merged scenes in this order.
set -euo pipefail
src="${1:?usage: scripts/build-props.sh path/to/downloads}"
# name | source | texture size
props=(
  "lamp|desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf|512"
  "cassette|portable_cassette_player/portable_cassette_player_1k.gltf|512"
  "pens|stationery_supplies/stationery_supplies_1k.gltf|256"
  "spectacles|round_spectacles/round_spectacles_1k.gltf|256"
  "duck|rubber_duck_toy/rubber_duck_toy_1k.gltf|256"
  "camera|Camera_01/Camera_01_1k.gltf|512"
  "plant|potted_plant_04/potted_plant_04_1k.gltf|512"
  "clock|wall_clock/wall_clock_1k.gltf|512"
  "frame|hanging_picture_frame_01/hanging_picture_frame_01_1k.gltf|256"
  "globe|sketchfab/globe.glb|512"
  "super8|sketchfab/super8.glb|512"
  "cube|sketchfab/rubik.glb|256"
  "phone|sketchfab/phone.glb|512"
  "longhorn|sketchfab/longhorn-up.glb|256"
  "rugby|sketchfab/rugby.glb|512"
  "skateboard|sketchfab/skateboard.glb|512"
  "clapper|sketchfab/clapper.glb|256"
  "biplane|sketchfab/biplane.glb|512"
  "studiolight|sketchfab/studiolight.glb|256"
  "chair|sketchfab/chair.glb|512"
  "suitcase|vintage_suitcase/vintage_suitcase_1k.gltf|512"
)
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
names=()
for entry in "${props[@]}"; do
  IFS='|' read -r name path size <<<"$entry"
  npx --no-install gltf-transform optimize "$src/$path" "$tmp/$name.glb" --compress false --texture-compress webp --texture-size "$size" --simplify false
  names+=("$tmp/$name.glb")
done
npx --no-install gltf-transform merge "${names[@]}" "$tmp/merged.glb"
npx --no-install gltf-transform simplify "$tmp/merged.glb" "$tmp/simple.glb" --ratio 0.5 --error 0.0005
npx --no-install gltf-transform meshopt "$tmp/simple.glb" public/models/props.glb
ls -lh public/models/props.glb
