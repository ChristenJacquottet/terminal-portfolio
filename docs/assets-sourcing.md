# Assets: what we can fetch, what we ship, what to download next

Where the desk's models and textures come from, how to rebuild them without the Blender app, and a
shopping list of better sources. Every pick follows `docs/art-direction.md`: one palette, big shapes
first, detail in textures. Licences: CC0 needs nothing; CC BY needs a line in `src/credit.ts` and the
README.

## What works from a cloud session (checked November 2026)

| Source | Reachable here | Notes |
| --- | --- | --- |
| Poly Haven (`api.polyhaven.com`, `dl.polyhaven.org`) | yes | CC0. The API refuses Python's default user agent: send any `User-Agent`. Models come as glTF at 1K/2K/4K(/8K); textures per map. |
| ambientCG (`ambientcg.com/get?file=…`) | yes | CC0. Zips per resolution (`<Id>_1K-JPG.zip`, …), OpenGL normals included. |
| Sketchfab | search API only | `api.sketchfab.com/v3/search` answers (licence, faces, texture sizes); downloads need a login, so the owner fetches them. |
| Smithsonian Open Access 3D (`3d.si.edu`, `api.si.edu`) | no | 403 "site temporarily unavailable"; the API also needs a key. Try again later or from a desktop. |
| Kenney | no | 403 from the site. Low-poly game style anyway, not this desk's look. |
| Poly Pizza | no | 403. |
| Blender (`bpy` wheel) | **yes** | `bpy` 5.3.0 on PyPI is a 427 MB manylinux wheel for **Python 3.13 only**. `uv venv -p 3.13 .bpy && uv pip install -p .bpy/bin/python bpy` (uv fetches a 3.13 if the machine lacks one). `scripts/restyle.py` runs unchanged as `.bpy/bin/python scripts/restyle.py -- in.gltf out.glb art/restyle.json --prop <name>`, about 5 to 15 s per prop at 2K, and its output matches the Blender app's (checked on the lamp at 1K against the shipped texture). `scripts/build-props.sh` takes `BPY_PYTHON=.bpy/bin/python`. |

So the whole pipeline (fetch, restyle, optimize) runs headless on Linux for anything from Poly Haven
and ambientCG. Sketchfab sources still need a human with a login.

## Shipped in this pass

Download sizes (what the desk fetches after `exit`):

| | Before | After |
| --- | --- | --- |
| `public/models/props.glb` | 2,965 KB | 3,953 KB |
| `public/models/apple-ii.glb` | 751 KB | 751 KB (unchanged) |
| Room textures (desktop) | 91 KB (oak 768/1024/256 px, floor 512) | 1,516 KB |
| Room textures (phones, `public/textures/half`) | 91 KB (the same files) | 272 KB |
| `world-map.webp` | 157 KB | 157 KB |
| **Desk total, desktop** | **3.96 MB** | **6.38 MB** |
| **Desk total, phones** | **3.96 MB** | **5.13 MB** |

(Decimal KB/MB, as a network panel shows them.) Where the extra 2.4 MB went: 1.42 MB on the room
(the desk top alone is 0.99 MB: it fills a third of the wide shot and every close-up lands on it),
0.99 MB on the 13 props below.

**Room surfaces** (`scripts/room-textures.mjs`, wired in `src/room.ts`):

- Desk top: Poly Haven [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks) (Dimitrios Savva, CC0), the same oak as before, now 2048 px diffuse + 2048 px OpenGL normal (the pore grain) + 1024 px roughness. 1.0 MB of the room's 1.5 MB.
- Floor: Poly Haven [Old Wood Floor](https://polyhaven.com/a/old_wood_floor) (Guillaume Monsergent, CC0), the same floor, now 1024 px diffuse + a 1024 px normal map.
- Wall: the code-drawn early-80s pinstripe stays as the print (now drawn at 1024 px, 512 on phones, so the stripes stay crisp up close); under it, ambientCG [Wallpaper 001 A](https://ambientcg.com/a/Wallpaper001A) (CC0) gives the paper its relief as a 1024 px normal map at an 80 cm repeat, so the low sun rakes across it.
- Phones load every one of these at half size from `public/textures/half/` (same media query as `desk.ts`'s `isPhone`).
- Left out on purpose: roughness maps for the floor and wall (both sources are nearly uniform, a few KB of nothing), and the cutting mat (its 1 cm grid and rules are drawn in code; a normal map would fight the printed grid at the camera's distance).

**Props**: the 13 Poly Haven props were re-fetched at 2K, restyled with `bpy` (`art/restyle.json`
rules unchanged) and swapped into `props.glb` texture by texture with `scripts/upgrade-props.mjs`.
Geometry, node names, scene order and the other 27 props are untouched (normals re-encode within
1/127). Budgets live in `scripts/props-budget.mjs` (`CLOSE_UP`):

| Prop | Base colour / aux px, before | After | Texture bytes before → after (KiB) |
| --- | --- | --- | --- |
| lamp | 768 / 256 | 1536 / 1024 | 59 → 261 KB |
| cassette (Walkman) | 1024 / 384 | 2048 / 1024 | 76 → 249 KB |
| camera | 768 / 256 (strap 128) | 1024 / 512 (strap 512) | 80 → 183 KB |
| plant | 512 / 256 | 1024 / 512 | 44 → 137 KB |
| multimeter | 1024 / 256 | 2048 / 1024 | 40 → 134 KB |
| screwdrivers | 512 / 256 | 1024 / 512 | 35 → 110 KB |
| pliers | 512 / 256 | 1024 / 512 | 31 → 91 KB |
| pens | 512 / 256 | 1024 / 512 | 26 → 82 KB |
| clock | 1024 / 256 | 2048 / 512 | 30 → 77 KB |
| spectacles | 512 / 256 | 1024 / 512 | 20 → 58 KB |
| rack (steel shelves) | 768 / 256 | 1024 / 512 | 25 → 46 KB |
| frame | 512 / 256 | 1024 / 512 | 8 → 21 KB |
| duck | 256 / 256 | 512 / 512 | 3 → 8 KB |

To redo or extend it: fetch the 2K glTF and its `include` files from the Poly Haven files API
(`https://api.polyhaven.com/files/<id>` → `gltf["2k"]`), then

```sh
BPY=.bpy/bin/python
$BPY scripts/restyle.py -- dl/<id>/<id>_2k.gltf restyled/<name>-restyle.glb art/restyle.json --prop <name>
node scripts/upgrade-props.mjs restyled            # swaps every <name>-restyle.glb it finds
node scripts/room-textures.mjs dl                  # room surfaces
```

## Better candidates, prop by prop

"Here" means it can be fetched from a cloud session (Poly Haven, ambientCG); "manual" means a
Sketchfab download by the owner. Faces and texture sizes are the source's, before our budgets.

### The Apple II (the hero)

The current model is already the best-textured Apple II source: dark_igorek's
[Apple II Computer](https://sketchfab.com/3d-models/apple-ii-computer-b5d316548d634f16a72dd503db0aa01b)
(CC BY 4.0, 76.9K faces, 23 maps at 4096 px, 114 MB). The shipped `apple-ii.glb` keeps 1024 px base
colour and 256 px normal/ORM (`scripts/optimize-model.mjs`). The cheapest real upgrade:

1. **Manual, recommended**: re-download that same model and rebuild with higher budgets in
   `optimize-model.mjs`: 2048 px on the case and keyboard base colour, 1024 px normals on the case
   (the seams and vents), 512 px ORM. Expect roughly +0.8 to 1.2 MB. Same credit, no new licence.
2. Manual alternative with real wear: digitalheritageaustralia's
   [Apple II](https://sketchfab.com/models/7ec665750b06445cba88da02ad1b7025) (CC BY, 214K faces, one
   4096 px photoscan atlas, 10 MB glb). A museum scan: true proportions and grime, but one atlas means
   no separate keycap or screen materials; the CSS3D screen would need a hand-cut glass mesh.
3. Not better: felicio.art's [Apple II Old Computer](https://sketchfab.com/models/3693b0d5dca1428496ca40d51fe9357a)
   (CC BY, 47.6K faces, 28 × 2048), LinkN152's [APPLE II Computer](https://sketchfab.com/models/d63cf1fd519443648a31db6cab036ab9)
   (CC BY, 23K faces, 30 × 2048; it does model the Disk II drives and the monitor, useful as a parts bin).

### Lab gear made in code (`src/lab.ts`), real models to replace it

| Code-made | Candidate | Licence | Size | Where |
| --- | --- | --- | --- | --- |
| `piCluster` (four Raspberry Pis) | josaco, [Raspberry Pi 3](https://sketchfab.com/models/2d308283fc0f4d27b81f17a2793c5c4d) | CC BY | 6.9K faces, 1 × 2048 | manual. The right weight: one board, instance it four times. |
| | awillame, [Raspberry Pi 3 Reference Design Model B](https://sketchfab.com/models/9bdfd7a867394585a11bb36dd9f97b08) | CC BY | 196K faces, untextured | manual. Accurate CAD; needs heavy simplification and palette materials. |
| | Poly Haven [Circuit Board](https://polyhaven.com/a/circuit_board) (Benny Weimer) | CC0 | 14.4K tris, up to 4K | **here**. Not a Pi (a PC power-supply board), but a real PCB texture for a stand-in. |
| `ups` | Alex-Teine, [Power_strip_surge_protector](https://sketchfab.com/models/fc4f2d30689241909252701ca51e500c) is the nearest CC BY; no CC BY UPS found. GRXR.ca's [APC Battery Backup UPS](https://sketchfab.com/models/b5c5af44c00848d3bad02327e3cec236) is Sketchfab "Free Standard" (not CC: check the terms before shipping). | — | 164 faces, 3 × 2048 | manual. Keep the code-made UPS until a CC model turns up. |
| `solderingStation` | deslancer, [Soldering Iron Station](https://sketchfab.com/models/563f3a638d0e471baef919d0dacf77c3) | CC BY | 44.3K faces, 3 × 2048, 11 MB | manual. Best fit: base, dial, iron in its holder. |
| | literallylara, [[CC0] Generic Soldering Station](https://sketchfab.com/models/87789d4f4c5b43069a5dd47819f4b4a8) | CC0 in the title, CC BY on Sketchfab (credit it to be safe) | 14.3K faces, 6 × 4096 | manual. Same author as our breadboard components. |
| `powerStrip` | sousinho, [Power strip extension lead](https://sketchfab.com/models/2180b1f7b55b433285cbe08181a9e88a) | CC BY | 5.7K faces, 3 × 2048 | manual. Same author as the pegboard: matching style. |
| | Alex-Teine, [Power_strip_surge_protector](https://sketchfab.com/models/fc4f2d30689241909252701ca51e500c) | CC BY | 1.1K faces, 2 × 2048 | manual. Lighter. |
| `partsDrawers` | Jerovdl, [Plastic Storage Cabinet](https://sketchfab.com/models/b52d7639719e4b4ab72ec5261d559e51) | CC BY | 7.8K faces, 4 × 256 | manual. A small-parts cabinet of clear drawers, light. |
| | Jerovdl, [Low-Poly Plastic Drawer](https://sketchfab.com/models/ed1f429bb98548d3b3b8a17e16eebdb5) | CC BY | 14K faces, untextured | manual. |
| `cableSpool`, `tapeRoll`, `steelRule` | Poly Haven [Measuring Tape 01](https://polyhaven.com/a/measuring_tape_01) (2.9K tris), [Tongue Groove Pliers](https://polyhaven.com/a/tongue_groove_pliers) (2.7K), [Flathead Screwdriver](https://polyhaven.com/a/flathead_screwdriver) (2.3K), [Magnifying Glass 01](https://polyhaven.com/a/magnifying_glass_01) (7.2K) | CC0 | up to 4K | **here**. Pegboard and bench dressing that would read better than more code primitives. |

### Desk props (Sketchfab, CC BY) worth a better source

| Prop | Now | Candidate | Licence | Size | Where |
| --- | --- | --- | --- | --- | --- |
| joystick | Antony's Atari Joystick, 512 px | ian.valeta, [Atari Joystick - CX40 w/ Cord](https://sketchfab.com/models/30acad27ced04cef906d602e6554ec0d) | CC BY | 21.8K faces, 3 × 4096 | manual. Has the cord; the current one reads blurry up close. |
| phone | Tatyana Volkova's corded phone, 1024 px | mne1pox, [Phone VEF TA 68](https://sketchfab.com/models/c848036e1d5f455797476659dfd12b06) | CC BY | 64.9K faces, 3 × 4096 | manual. A real 70s rotary desk set; the restyle makes it beige. |
| answering machine | jordofred's, untextured | aefj1032, [Answering machine](https://sketchfab.com/models/de06095a3b4d46f09b218cdb51b51a0f) | CC BY | 15K faces, 1 × 8192 | manual. Textured buttons and labels. |
| globe | Matthew Collings' Antique Globe (1024 px of a 4096 source) | none better; raise its budget instead (the source is 6 × 4096) | CC BY | — | manual re-download, then `optimize-props.mjs` budget 2048. |
| Walkman (Poly Haven, shipped at 2K now) | — | Poly Haven [Cassette Player](https://polyhaven.com/a/cassette_player) (Oday Abuzaeed) is a second Walkman if one is ever wanted | CC0 | 4.8K tris | **here** |

### Poly Haven props near the camera (done here)

All 13 are now built from their 2K sources (see the table above). Going to 4K would roughly double
each again for little visible gain at the desk's distance; the clock face and the multimeter dial are
the only ones where 4K text would still read better in a `frame` close-up.

### Room surfaces, alternatives considered

- Desk: Poly Haven [Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01) is a single-sheet veneer
  (more "desk", less "floor") but much more yellow and figured; kept the planks the owner already
  approved. The README used to credit "Oak Veneer 01": the shipped texture was always Oak Wood Planks.
- Wall: ambientCG Wallpaper 002 A (finer woodchip), PaintedPlaster017 (plaster with hairline cracks),
  Poly Haven [Beige Wall 001](https://polyhaven.com/a/beige_wall_001). No CC0 source has a patterned
  early-80s print, so the print stays code-drawn.
- Floor: ambientCG Carpet016 (a berber, very 1980s) if the floor ever shows more than its edge.
