#!/usr/bin/env bash
# Rebuilds public/models/props.glb from the downloads below.
#   scripts/build-props.sh path/to/downloads
# Poly Haven (CC0): <dir>/<id>/<id>_1k.gltf (https://polyhaven.com/a/<id>).
# Sketchfab (CC BY, credited in src/credit.ts): <dir>/sketchfab/<name>.glb, the 1k-texture glb download.
# The order matters: src/props.ts reads the merged scenes in this order.
set -euo pipefail
src="${1:?usage: scripts/build-props.sh path/to/downloads}"
# name | source | texture size | "parts" keeps the model's pieces as separate named nodes (src/props.ts rearranges them)
props=(
  "lamp|desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf|512"
  "cassette|portable_cassette_player/portable_cassette_player_1k.gltf|512|parts"
  "pens|stationery_supplies/stationery_supplies_1k.gltf|256|parts"
  "spectacles|round_spectacles/round_spectacles_1k.gltf|256"
  "duck|rubber_duck_toy/rubber_duck_toy_1k.gltf|256"
  "camera|Camera_01/Camera_01_1k.gltf|512"
  "plant|potted_plant_04/potted_plant_04_1k.gltf|512"
  "clock|wall_clock/wall_clock_1k.gltf|512"
  "frame|hanging_picture_frame_01/hanging_picture_frame_01_1k.gltf|256"
  "globe|sketchfab/globe.glb|512"
  "super8|sketchfab/super8.glb|512"
  "phone|sketchfab/phone-rotary.glb|512|parts"
  "longhorn|sketchfab/skull.glb|512"
  "rugby|sketchfab/rugby-ball.glb|512"
  "skateboard|sketchfab/cruiser.glb|512"
  "clapper|sketchfab/clapper.glb|256"
  "biplane|sketchfab/biplane.glb|512"
  "studiolight|sketchfab/spotlight.glb|512"
  "chair|sketchfab/chair.glb|512"
  "suitcase|sketchfab/suitcase.glb|512"
  "breadboard|sketchfab/breadboard.glb|512"
  "multimeter|retro_multimeter/retro_multimeter_1k.gltf|512"
  "joystick|sketchfab/joystick.glb|512"
  "headphones|sketchfab/walkman-tpsl2.glb|512|parts"
  "answering|sketchfab/answering/scene.gltf|256"
)
blender="${BLENDER:-/Applications/Blender 2.app/Contents/MacOS/Blender}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
names=()
for entry in "${props[@]}"; do
  IFS='|' read -r name path size parts <<<"$entry"
  keep=()
  [ "${parts:-}" = parts ] && keep=(--flatten false --join false)
  "$blender" -b -Y --python scripts/restyle.py -- "$src/$path" "$tmp/$name-restyle.glb" art/restyle.json
  npx --no-install gltf-transform optimize "$tmp/$name-restyle.glb" "$tmp/$name.glb" --compress false --texture-compress webp --texture-size "$size" --simplify false "${keep[@]+"${keep[@]}"}"
  names+=("$tmp/$name.glb")
done
npx --no-install gltf-transform merge "${names[@]}" "$tmp/merged.glb"
npx --no-install gltf-transform simplify "$tmp/merged.glb" "$tmp/simple.glb" --ratio 0.5 --error 0.0005
npx --no-install gltf-transform meshopt "$tmp/simple.glb" public/models/props.glb
ls -lh public/models/props.glb
