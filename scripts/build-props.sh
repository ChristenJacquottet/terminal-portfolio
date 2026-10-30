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
  "rack|lab/ph_steel_frame_shelves_01/steel_frame_shelves_01_1k.gltf|512"
  "switch|lab/sf_02_switch_tplink8/model.glb|256"
  "nas|lab/sf_03_nas_qnap/model.glb|256"
  "crt|lab/sf_04_crt_sony_pvm/model.glb|512"
  "pegboard|lab/sf_05_pegboard_sousinho/model.glb|512"
  "pliers|lab/ph_pliers/pliers_1k.gltf|256"
  "screwdrivers|lab/ph_screwdrivers_02/screwdrivers_02_1k.gltf|256"
  "cutters|lab/sf_06_wire_cutter_robin/model.glb|256"
  "thinkpad|lab/sf_10_laptop_thinkpad_closed/model.glb|256"
  "macbook|lab/sf_10_laptop_aluminum_closed/model.glb|256"
  "mac128k|lab/sf_11_mac_128k_connor/model.glb|512"
  "c64|lab/sf_12_c64_hoschu/model.glb|512"
  "ivy|lab/sf_13_potted_ivy_meemoe/model.glb|512"
  "monstera|lab/sf_14_monstera_angemturc/model.glb|512"
  "kiev|lab/sf_18_camera_kiev4am/model.glb|512"
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
