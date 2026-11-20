#!/usr/bin/env bash
# Rebuilds public/models/props.glb from the downloads below.
#   scripts/build-props.sh path/to/downloads
# Poly Haven (CC0): <dir>/<id>/<id>_2k.gltf (https://polyhaven.com/a/<id>); 2K for the props the camera gets
# close to (their budgets are in scripts/props-budget.mjs). The others are still 1K.
# Sketchfab (CC BY, credited in src/credit.ts): <dir>/sketchfab/<name>.glb, the 1k-texture glb download.
# The order matters: src/props.ts and scripts/optimize-props.mjs read the merged scenes in this order.
set -euo pipefail
export PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1
src="${1:?usage: scripts/build-props.sh path/to/downloads}"
props=(
  "lamp|desk_lamp_arm_01/desk_lamp_arm_01_2k.gltf"
  "cassette|portable_cassette_player/portable_cassette_player_2k.gltf"
  "pens|stationery_supplies/stationery_supplies_2k.gltf"
  "spectacles|round_spectacles/round_spectacles_2k.gltf"
  "duck|rubber_duck_toy/rubber_duck_toy_2k.gltf"
  "camera|Camera_01/Camera_01_2k.gltf"
  "plant|potted_plant_04/potted_plant_04_2k.gltf"
  "clock|wall_clock/wall_clock_2k.gltf"
  "frame|hanging_picture_frame_01/hanging_picture_frame_01_2k.gltf"
  "globe|sketchfab/globe.glb"
  "super8|sketchfab/super8.glb"
  "phone|sketchfab/phone-rotary.glb"
  "longhorn|sketchfab/skull.glb"
  "rugby|sketchfab/rugby-ball.glb"
  "skateboard|sketchfab/cruiser.glb"
  "clapper|sketchfab/clapper.glb"
  "biplane|sketchfab/biplane.glb"
  "studiolight|sketchfab/spotlight.glb"
  "chair|sketchfab/chair.glb"
  "suitcase|sketchfab/suitcase.glb"
  "breadboard|sketchfab/breadboard.glb"
  "multimeter|retro_multimeter/retro_multimeter_2k.gltf"
  "joystick|sketchfab/joystick.glb"
  "headphones|sketchfab/walkman-tpsl2.glb"
  "answering|sketchfab/answering/scene.gltf"
  "rack|lab/ph_steel_frame_shelves_01/steel_frame_shelves_01_2k.gltf"
  "switch|lab/sf_02_switch_tplink8/model.glb"
  "nas|lab/sf_03_nas_qnap/model.glb"
  "crt|lab/sf_04_crt_sony_pvm/model.glb"
  "pegboard|lab/sf_05_pegboard_sousinho/model.glb"
  "pliers|lab/ph_pliers/pliers_2k.gltf"
  "screwdrivers|lab/ph_screwdrivers_02/screwdrivers_02_2k.gltf"
  "cutters|lab/sf_06_wire_cutter_robin/model.glb"
  "thinkpad|lab/sf_10_laptop_thinkpad_closed/model.glb"
  "macbook|lab/sf_10_laptop_aluminum_closed/model.glb"
  "mac128k|lab/sf_11_mac_128k_connor/model.glb"
  "c64|lab/sf_12_c64_hoschu/model.glb"
  "ivy|lab/sf_13_potted_ivy_meemoe/model.glb"
  "monstera|lab/sf_14_monstera_angemturc/model.glb"
  "kiev|lab/sf_18_camera_kiev4am/model.glb"
)
blender="${BLENDER:-/Applications/Blender 2.app/Contents/MacOS/Blender}"
# No Blender app (Linux, CI)? Blender as a Python module works too: the bpy wheel needs Python 3.13
# (`uv venv -p 3.13 .bpy && uv pip install -p .bpy/bin/python bpy`), then BPY_PYTHON=.bpy/bin/python.
restyle() {
  if [ -n "${BPY_PYTHON:-}" ]; then "$BPY_PYTHON" scripts/restyle.py -- "$@"
  else "$blender" -b -Y --python scripts/restyle.py -- "$@"; fi
}
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pids=()
for entry in "${props[@]}"; do
  IFS='|' read -r name path <<<"$entry"
  restyle "$src/$path" "$tmp/$name-restyle.glb" art/restyle.json >/dev/null &
  pids+=("$!")
  if [ "${#pids[@]}" -ge 4 ]; then
    for pid in "${pids[@]}"; do wait "$pid"; done
    pids=()
  fi
done
for pid in "${pids[@]+"${pids[@]}"}"; do wait "$pid"; done

node scripts/optimize-props.mjs "$tmp" public/models/props.glb
ls -lh public/models/props.glb
