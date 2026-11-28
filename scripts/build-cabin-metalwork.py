"""Build the No. 23 wheelhouse and galley fittings with Blender in background mode.

Dimensions and placements use the cabin's X,Y(up),Z grid in metres. Each bay
exports as one indexed mesh with vertex paint and UVs in the cabin finish atlas.
"""

from math import cos, pi, sin
from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector

STEEL = "#71807a"
IRON = "#434943"
BRASS = "#b6a277"
CREAM = "#dbceab"
DARK = "#333a39"
ENAMEL = "#728e89"
PAPER = "#dacba2"
WEB = "#c09765"


def part(name, rings, color, smooth=False, tile=(0, 1), cap=True):
    """Loft matching closed rings. End caps can be omitted on hollow sheet profiles."""
    count = len(rings[0])
    verts = [Vector((x, -z, y)) for ring in rings for x, y, z in ring]
    faces = [
        (j * count + i, j * count + (i + 1) % count, (j + 1) * count + (i + 1) % count, (j + 1) * count + i)
        for j in range(len(rings) - 1)
        for i in range(count)
    ]
    if cap:
        faces += [tuple(reversed(range(count))), tuple(range(len(verts) - count, len(verts)))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    paint = mesh.color_attributes.new(name="COLOR_0", type="BYTE_COLOR", domain="POINT")
    rgb = tuple(int(color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    for p in paint.data:
        p.color_srgb = (*rgb, 1)
    uv = mesh.uv_layers.new(name="Cabin finishes")
    mins = [min(v[d] for v in verts) for d in range(3)]
    span = max(0.38, *(max(v[d] for v in verts) - mins[d] for d in range(3)))
    for face in mesh.polygons:
        face.use_smooth = smooth and len(face.vertices) == 4
        axis = sorted(range(3), key=lambda i: abs(face.normal[i]))[:2]
        axis.sort()
        for k in face.loop_indices:
            v = verts[mesh.loops[k].vertex_index]
            u, t = [0.5 * tile[j] + (8 + 496 * (v[d] - mins[d]) / span) / 1024 for j, d in enumerate(axis)]
            # The glTF exporter inverts V. The shared Three canvas atlas uses flipY.
            uv.data[k].uv = (u, 1 - t)


def rounded(x, z, w, d, r):
    points = []
    for cx, cz, phase in [(1, 1, 0), (-1, 1, pi / 2), (-1, -1, pi), (1, -1, 3 * pi / 2)]:
        for i in range(4):
            a = phase + i * pi / 6
            points.append((x + cx * (w / 2 - r) + r * cos(a), z + cz * (d / 2 - r) + r * sin(a)))
    return points[::-1]


def press(name, x, z, profile, color):
    rings = [[(px, y, pz) for px, pz in rounded(x, z, w, d, r)] for y, w, d, r in profile]
    part(name, rings, color)


def turned(name, x, z, profile, color, n=28):
    rings = [
        [(x + r * cos(-i * 2 * pi / n), y, z + r * sin(-i * 2 * pi / n)) for i in range(n)]
        for y, r in profile
    ]
    part(name, rings, color, True)


def tube(name, path, radii, color, n=10, cap=True):
    path = [Vector(p) for p in path]
    if isinstance(radii, (int, float)):
        radii = [radii] * len(path)
    forward = (path[1] - path[0]).normalized()
    axis = min([Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))], key=lambda v: abs(v.dot(forward)))
    rings = []
    for i, (p, r) in enumerate(zip(path, radii)):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        axis = (axis - tangent * axis.dot(tangent)).normalized()
        b = tangent.cross(axis)
        rings.append([p + r * (axis * cos(2 * pi * j / n) + b * sin(2 * pi * j / n)) for j in range(n)])
    part(name, rings, color, True, cap=cap)


def wheelhouse():
    # Stamped access covers: a rolled outer flange, sloping draw and a recessed centre.
    for i, z in enumerate([1.13, 1.76, 2.4]):
        press("Gasket", -3.925, z, [(1.06, 0.47, 0.59, 0.036), (1.075, 0.47, 0.59, 0.036)], DARK)
        press(
            "Pressed removable lid",
            -3.925,
            z,
            [
                (1.075, 0.465, 0.585, 0.037),
                (1.083, 0.465, 0.585, 0.037),
                (1.087, 0.421, 0.544, 0.046),
                (1.104, 0.388, 0.507, 0.055),
                (1.104, 0.344, 0.462, 0.052),
                (1.093, 0.323, 0.442, 0.05),
            ],
            ["#9baba8", "#aabaaf", "#9ca9a3"][i],
        )
        x = -3.88
        tube(
            "Lift handle",
            [
                (x, 1.094, z - 0.065),
                (x, 1.121, z - 0.065),
                (x, 1.136, z - 0.052),
                (x, 1.136, z + 0.052),
                (x, 1.121, z + 0.065),
                (x, 1.094, z + 0.065),
            ],
            0.007,
            IRON,
        )
    # Piano hinge and releasable side stays carry the radio from the windshield
    # sill. The lid handle has 94mm of free space and the shelf folds up for service.
    press(
        "Folding radio shelf",
        -3.985,
        1.78,
        [(1.23, 0.388, 0.476, 0.017), (1.246, 0.388, 0.476, 0.017)],
        ENAMEL,
    )
    for z in [1.56, 1.99]:
        tube("Rear jamb mounting pad", [(-4.178, 1.129, z), (-4.156, 1.129, z)], 0.027, IRON, 12)
        tube(
            "Folding shelf stay", [(-4.159, 1.129, z), (-3.974, 1.188, z), (-3.818, 1.23, z)], 0.012, STEEL, 8
        )
        tube(
            "Removable clevis pin", [(-3.974, 1.188, z - 0.017), (-3.974, 1.188, z + 0.017)], 0.015, BRASS, 10
        )
    tube("Continuous shelf hinge", [(-4.169, 1.244, 1.533), (-4.169, 1.244, 2.025)], 0.012, IRON, 12)
    # Sill-mounted chart easel. A thumbwheel and captive pin release its left cheek.
    for z in [2.22, 2.91]:
        part(
            "Folding easel cheek",
            [[(-4.19, 1.088, d), (-4.16, 1.088, d), (-4.145, 1.454, d)] for d in [z - 0.01, z + 0.01]],
            ENAMEL,
        )
        tube("Easel pivot", [(-4.165, 1.125, z - 0.017), (-4.165, 1.125, z + 0.017)], 0.019, BRASS)

    def board(u, v, n=0):
        return (-4.072 - 0.342 * v + 0.940 * n, 1.31 + 0.940 * v + 0.342 * n, 2.565 - u)

    part(
        "Phenolic map board",
        [
            [board(u, v, n) for u, v in [(-0.35, -0.201), (0.35, -0.201), (0.35, 0.201), (-0.35, 0.201)]]
            for n in [-0.016, 0]
        ],
        "#916d4c",
    )
    for v in [-0.18, 0.18]:
        tube("Chart spindle", [board(-0.342, v, 0.017), board(0.342, v, 0.017)], 0.015, PAPER, 16)
        tube("Knurled spool knob", [board(0.344, v, 0.017), board(0.368, v, 0.017)], 0.021, IRON, 12)
    # Bellows-sided courier satchel. Its flap bulges over two folded survey sheets.
    z = 2.48

    def bag(name, outline, sections, color, tile):
        part(
            name,
            [
                [(x, base + (y - 0.95) * scale, z + u * width) for u, y in outline]
                for x, base, scale, width in sections
            ],
            color,
            tile=tile,
        )

    body = [
        (-0.193, 1.08),
        (0.187, 1.075),
        (0.209, 0.982),
        (0.2, 0.827),
        (0.182, 0.802),
        (-0.175, 0.807),
        (-0.203, 0.833),
        (-0.209, 0.994),
    ]
    bag(
        "Canvas gusset",
        body,
        [(-2.757, 0.951, 1, 0.96), (-2.702, 0.957, 1.05, 1), (-2.647, 0.95, 1, 0.98)],
        "#99a18b",
        (1, 1),
    )
    flap = [
        (-0.198, 1.088),
        (0.182, 1.082),
        (0.201, 1.044),
        (0.193, 0.968),
        (0.16, 0.942),
        (0.047, 0.934),
        (-0.135, 0.951),
        (-0.193, 0.969),
    ]
    bag(
        "Hide rain flap",
        flap,
        [(-2.727, 0.961, 0.96, 0.99), (-2.655, 0.959, 1, 1), (-2.636, 0.947, 1, 0.985)],
        "#aa815e",
        (1, 0),
    )
    for u in [-0.122, 0.116]:
        # Straps follow the fold; a narrow loose tongue emerges below the brass keeper.
        for h, x, length in [(1.014, -2.63, 0.072), (0.95, -2.626, 0.061), (0.891, -2.635, 0.068)]:
            strap = [
                (u - 0.0125, h + length / 2),
                (u + 0.0125, h + length / 2),
                (u + 0.0125, h - length / 2),
                (u - 0.0125, h - length / 2),
            ]
            bag("25mm webbing", strap, [(x, 0.95, 1, 1), (x + 0.005, 0.95, 1, 1)], WEB, (1, 1))
        tube(
            "Brass buckle",
            [
                (-2.618, 0.953, z + u - 0.018),
                (-2.618, 0.953, z + u + 0.018),
                (-2.618, 0.929, z + u + 0.018),
                (-2.618, 0.929, z + u - 0.018),
                (-2.618, 0.953, z + u - 0.018),
            ],
            0.0032,
            BRASS,
            6,
        )
    # A blue linen-backed chart is folded into the seat pocket with its corners exposed.
    for offset, tint in [(0, "#86a4a0"), (0.005, PAPER)]:
        pts = [(-0.164, 1.073), (0.003, 1.066), (-0.012, 1.157), (-0.17, 1.134)]
        bag("Folded chart", pts, [(-2.731 + offset, 0.95, 1, 1), (-2.728 + offset, 0.95, 1, 1)], tint, (1, 1))


def galley():
    x, z = -0.39, 3.16
    # A compact spirit/gas range with a formed pan, black trivet and guard rail.
    press(
        "Hob body",
        x,
        z,
        [
            (1.042, 0.625, 0.46, 0.036),
            (1.062, 0.652, 0.478, 0.04),
            (1.139, 0.652, 0.478, 0.04),
            (1.16, 0.673, 0.49, 0.04),
            (1.168, 0.673, 0.49, 0.04),
            (1.17, 0.624, 0.444, 0.035),
        ],
        CREAM,
    )
    for bx in [x - 0.144, x + 0.143]:
        turned("Cast burner", bx, z, [(1.171, 0.087), (1.179, 0.087), (1.184, 0.071), (1.192, 0.069)], DARK)
        for i in range(4):
            a = i * pi / 2
            tube(
                "Pot support",
                [
                    (bx + cos(a) * r, y, z + sin(a) * r)
                    for r, y in [(0.092, 1.171), (0.092, 1.199), (0.049, 1.199)]
                ],
                0.006,
                IRON,
                6,
            )
        tube("Control", [(bx, 1.103, 2.92), (bx, 1.103, 2.897)], 0.029, IRON, 14)
        tube("Ivory indicator", [(bx, 1.114, 2.894), (bx + 0.004, 1.124, 2.894)], 0.003, CREAM, 6)
    for px in [x - 0.29, x + 0.29]:
        for pz in [2.957, 3.364]:
            turned("Fiddle socket", px, pz, [(1.172, 0.016), (1.184, 0.015), (1.188, 0.009)], BRASS, 12)
    for pz in [2.957, 3.364]:
        tube(
            "Retaining fiddle",
            [
                (x - 0.29, 1.183, pz),
                (x - 0.29, 1.224, pz),
                (x - 0.278, 1.235, pz),
                (x + 0.278, 1.235, pz),
                (x + 0.29, 1.224, pz),
                (x + 0.29, 1.183, pz),
            ],
            0.0065,
            STEEL,
        )
    # Raised shoulder and dark rolled bead catch the light separately from the lid.
    k = x + 0.11
    turned(
        "Kettle body",
        k,
        z,
        [
            (1.201, 0.083),
            (1.207, 0.106),
            (1.223, 0.118),
            (1.245, 0.126),
            (1.325, 0.125),
            (1.356, 0.118),
            (1.383, 0.094),
            (1.393, 0.076),
            (1.398, 0.076),
        ],
        "#be8150",
        32,
    )
    turned(
        "Rolled black enamel lip", k, z, [(1.393, 0.073), (1.395, 0.079), (1.401, 0.08), (1.404, 0.075)], IRON
    )
    turned("Domed lid", k, z, [(1.402, 0.076), (1.411, 0.066), (1.418, 0.047), (1.421, 0.019)], "#c69965")
    turned("Bakelite lid pull", k, z, [(1.421, 0.01), (1.43, 0.01), (1.434, 0.021), (1.445, 0.019)], DARK, 16)
    # The spout sweeps outward, then flares to an open mouth.
    path = [
        (k - 0.096, 1.262, z),
        (k - 0.139, 1.28, z),
        (k - 0.163, 1.31, z),
        (k - 0.178, 1.35, z),
        (k - 0.191, 1.374, z),
        (k - 0.201, 1.381, z),
    ]
    tube("Drawn spout", path, [0.039, 0.036, 0.028, 0.020, 0.019, 0.024], "#be8150", 18, False)
    tube("Spout throat", [path[-2], path[-1]], [0.015, 0.019], DARK, 18, False)
    for s in [-1, 1]:
        px = k + s * 0.113
        tube("Riveted bail lug", [(px, 1.327, z), (px + s * 0.008, 1.327, z)], 0.018, IRON, 14)
    arc = [
        (k + 0.122 * cos(i * pi / 16), 1.327 + 0.205 * sin(i * pi / 16), z + 0.023 * sin(i * pi / 16))
        for i in range(17)
    ]
    tube("Wire bail", arc, 0.006, STEEL)
    tube("Turned wooden handgrip", arc[6:11], [0.011, 0.016, 0.017, 0.016, 0.011], "#76523a", 12)
    # A shallow frying pan hangs by its folding wire handle on the wall alongside the stove.
    px = -1.815
    ys = [
        (3.382, 0.066),
        (3.37, 0.076),
        (3.35, 0.099),
        (3.344, 0.107),
        (3.338, 0.107),
        (3.34, 0.10),
        (3.357, 0.077),
        (3.363, 0.06),
    ]
    rings = [
        [(px + r * cos(i * 2 * pi / 28), 1.407 + r * sin(i * 2 * pi / 28), d) for i in range(28)]
        for d, r in ys
    ]
    part("Pressed frying pan", rings, "#617b7e", True)
    tube(
        "Folding wire handle",
        [
            (px - 0.026, 1.495, 3.349),
            (px - 0.019, 1.551, 3.353),
            (px - 0.016, 1.578, 3.36),
            (px, 1.586, 3.36),
            (px + 0.016, 1.578, 3.36),
            (px + 0.019, 1.551, 3.353),
            (px + 0.026, 1.495, 3.349),
        ],
        0.004,
        STEEL,
    )
    tube("Pan peg", [(px, 1.566, 3.446), (px, 1.566, 3.35), (px, 1.586, 3.344)], 0.006, BRASS)

    # Nika leaves the cut face toward the passage. The crust cap tapers away
    # from the knife cut; a separate heel leans on its lower edge.
    crumb = [
        (-0.071, 0),
        (0.064, 0),
        (0.074, 0.019),
        (0.071, 0.046),
        (0.06, 0.068),
        (0.036, 0.084),
        (-0.009, 0.089),
        (-0.047, 0.08),
        (-0.066, 0.062),
        (-0.076, 0.036),
    ]

    def loaf_ring(cx, scale, lean=0):
        return [(cx + lean * h, 1.065 + h * scale, 3.235 + dz * scale) for dz, h in crumb]

    part(
        "Rye loaf brown crust",
        [
            loaf_ring(cx, k)
            for cx, k in [(-1.063, 1), (-1.048, 1.02), (-0.967, 1.04), (-0.929, 0.92), (-0.916, 0.71)]
        ],
        "#ac7142",
        True,
        tile=(1, 0),
    )
    part("Fresh rye crumb", [loaf_ring(-1.064, 0.94), loaf_ring(-1.065, 0.94)], "#e0b789", tile=(1, 1))
    part("Saved heel", [loaf_ring(-1.143, 0.81, 0.27), loaf_ring(-1.127, 0.92, 0.27)], "#ad774e", tile=(1, 0))
    part("Heel crumb", [loaf_ring(-1.144, 0.78, 0.27), loaf_ring(-1.145, 0.78, 0.27)], "#d7b182", tile=(1, 1))
    for i, (dz, h, r) in enumerate(
        [
            (-0.025, 0.038, 0.003),
            (0.044, 0.026, 0.002),
            (0.013, 0.054, 0.004),
            (-0.033, 0.057, 0.002),
            (0.01, 0.023, 0.002),
            (-0.045, 0.026, 0.003),
        ]
    ):
        for x, scale, lean in [(-1.066, 1, 0), (-1.146, 0.78, 0.27)]:
            px = x + h * lean
            tube(
                "Crumb pore",
                [
                    (px, 1.065 + h * scale, 3.235 + dz * scale),
                    (px - 0.0008, 1.065 + h * scale, 3.235 + dz * scale),
                ],
                r,
                "#956c4c",
                6,
            )
    # An old enamel maker ran a narrow ivory band round the lower shoulder.
    turned("Kettle lining", k, z, [(1.253, 0.1263), (1.257, 0.1263)], "#c7aa78", 32)

    # The outer flange, well and plug seat are drawn from a single sheet. The left
    # end of the wooden worktop is open underneath, down to the cabinet carcass.
    rings = []
    for cx, y, w, d, r in [
        (-1.56, 1.038, 0.703, 0.471, 0.037),
        (-1.56, 1.045, 0.708, 0.477, 0.038),
        (-1.56, 1.052, 0.695, 0.464, 0.038),
        (-1.62, 1.052, 0.439, 0.368, 0.064),
        (-1.62, 1.043, 0.414, 0.342, 0.058),
        (-1.624, 0.995, 0.363, 0.288, 0.056),
        (-1.632, 0.982, 0.323, 0.249, 0.069),
        (-1.654, 0.978, 0.049, 0.049, 0.021),
    ]:
        rings.append([(px, y, pz) for px, pz in rounded(cx, 3.14, w, d, r)])
    part("Pressed wash well and draining wing", rings, "#a8bab4", True, cap=False)
    turned("Perforated waste", -1.654, 3.14, [(0.976, 0.024), (0.980, 0.024)], STEEL, 18)
    for i in range(5):
        a = i * 2 * pi / 5
        turned(
            "Strainer slot",
            -1.654 + 0.012 * cos(a),
            3.14 + 0.012 * sin(a),
            [(0.98, 0.003), (0.981, 0.003)],
            DARK,
            6,
        )
    for i in range(6):
        pz = 2.99 + i * 0.055
        tube(
            "Swaged drainer rib",
            [
                (-1.397, 1.051, pz),
                (-1.382, 1.056, pz),
                (-1.255, 1.056, pz + 0.012),
                (-1.239, 1.051, pz + 0.012),
            ],
            0.004,
            STEEL,
            6,
        )


for name, build in [("wheelhouse", wheelhouse), ("galley", galley)]:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    build()
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()
    bpy.context.object.name = name + " metalwork"
    with TemporaryDirectory() as work:
        raw = Path(work) / (name + ".glb")
        bpy.ops.export_scene.gltf(
            filepath=str(raw),
            use_selection=True,
            export_materials="NONE",
            export_vertex_color="ACTIVE",
            export_all_vertex_colors=True,
            export_normals=True,
            export_texcoords=True,
            export_animations=False,
        )
        output = Path.cwd() / "public/models" / (name + "-metalwork.glb")
        cli = Path.cwd() / "node_modules/@gltf-transform/cli/bin/cli.js"
        run(["node", str(cli), "meshopt", str(raw), str(output), "--level", "high"], check=True)
