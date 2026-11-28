"""Run from the repository root with blender -b --python scripts/build-bunk-cover.py."""
from math import cos, exp, pi, sin
from pathlib import Path

import bpy

# Tailor the cover in metres. Cross sections run from the wall, around the mattress
# edge and down to the hem. Keep continuous UVs across the bend for the woven check.
columns = 28
rows = [
    (0.00, 0.008), (0.09, 0.014), (0.18, 0.021), (0.28, 0.028),
    (0.38, 0.024), (0.49, 0.017), (0.58, 0.014), (0.61, 0.010),
    (0.633, -0.003), (0.647, -0.035), (0.654, -0.094), (0.653, -0.161),
    (0.649, -0.175),
]
vertices, faces, texcoords = [], [], []
for j, (depth, height) in enumerate(rows):
    for i in range(columns + 1):
        u = i / columns
        phase = 2 * pi * (4.7 * u + 0.26 * depth)
        fold = sin(phase) + 0.44 * sin(phase * 1.81 + 0.9)
        hang = max(0, -height / 0.175)
        # One corner has been turned back. The far end is still tucked under the roll.
        lifted = exp(-((u - 0.09) / 0.17) ** 2) * (depth / 0.65) ** 3
        x = (u - 0.5) * 1.18 + 0.014 * sin(6 * depth + u) + 0.018 * lifted
        y = depth + hang * (0.026 * fold - 0.053 * lifted)
        z = height + 0.019 * fold + 0.023 * sin(2 * pi * u) * depth + 0.068 * lifted
        vertices.append((x, -y, z))
        texcoords.append((u, 1 - j / (len(rows) - 1)))
        if i and j:
            k = len(vertices) - 1
            faces.append((k-columns-2, k-1, k, k-columns-1))
mesh = bpy.data.meshes.new("Draped watch blanket")
mesh.from_pydata(vertices, [], faces)
mesh.update()
uv = mesh.uv_layers.new(name="warp and weft")
for loop in mesh.loops:
    uv.data[loop.index].uv = texcoords[loop.vertex_index]
for face in mesh.polygons:
    face.use_smooth = True
blanket = bpy.data.objects.new("Watch blanket", mesh)
bpy.context.collection.objects.link(blanket)
bpy.ops.object.select_all(action='DESELECT')
blanket.select_set(True)
bpy.context.view_layer.objects.active = blanket
bpy.ops.export_scene.gltf(
    filepath=str(Path.cwd() / "public/models/watch-blanket.glb"),
    use_selection=True, export_materials='NONE', export_normals=True,
    export_texcoords=True, export_animations=False,
)
