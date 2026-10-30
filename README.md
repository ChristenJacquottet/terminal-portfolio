# terminal-portfolio

My portfolio as a working terminal: the same ASCII art and look as my [GitHub profile](https://github.com/ChristenJacquottet), terminal colour schemes, and every published case study from [christenjacquottet.com](https://christenjacquottet.com) as a file you can `ls`, `cat` and `open`. Type `exit` to step back from the screen: it is an Apple II on a steel desk by a window onto 1980s Dallas at golden hour, and you can keep typing on it.

```console
$ ls -l ~/shipped
$ cat ~/shipped/world-cup-host
$ grep voice
$ projects | grep award
$ theme amber
$ exit
```

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

## What it does

- **A real shell, small.** Folders and files, `cd`, `ls -lt`, `cat`, `tree`, `open`, pipes into `grep` and `head`, `;` and `&&`, tab completion for commands, paths and themes, and history on ↑ ↓ that survives a reload. `help` lists the rest; a few commands aren't listed.
- **Clickable.** Every name in the output is a button that types and runs its command, so nobody has to know Unix to read it.
- **Colour schemes.** `theme` lists them with their ANSI palettes: `github` (white and green, like the profile README), `phosphor`, `amber`, `homebrew`, `pro`, `solarized`, `dracula` and `dos`. `theme <name>` switches, and the choice is saved, shown in `~/.cjshrc` (`ls -a`). `crt off` drops the scanlines and glow; reduced-motion settings start with it off.
- **The desk.** `exit` loads a three.js scene: the computer on a desk in a room, with the live terminal on its tube. The terminal stays DOM (through CSS3D, so text stays sharp and typing still works) and sits *under* the WebGL canvas, which draws the curved glass as a hole with darkened edges and a reflection of the window, so the flat page reads as a curved CRT and the bezel crops it from any angle. On the way out, the screen takes on the exact shape of the glass (one small render of the close-up), so the hand-off to the 3D tube is seamless; the props wait until the camera lands and arrive with their shaders compiled and textures uploaded, so the flight never drops a frame. Drag to look around (zoom is clamped near the wide shot), click the screen to sit back down. Nothing 3D loads before that: the page is ~37 KB gzipped, the desk chunk ~190 KB, the computer and desk models 1.2 MB, and the props 2.9 MB after them. It only renders while something moves. The light is the low sun through the blinds and the desk lamp (its light sits on the lamp's bulb, aimed down the bulb's axis, and moves with the lamp), with real shadows; the shadow maps are drawn once and again only when something in the room moves, so orbiting and idling don't pay for them.
- **The things on the desk** are true to me: a wooden racquet and a pennant (college tennis), a globe and a print of Réunion's peaks (where I was born), a Super 8 camera and a 35mm camera (filmmaking and photography), a graph-paper notebook (computer science), and a "CAN YOU HEAR ME?" card by the phone (the video call where the mic died and we held up paper). The rest comes from my old "what's on your fridge" timeline: a cork board of every place home has been (Réunion, French Guiana, Normandy, Indiana, London, Dallas), a longhorn skull (DFW), a rugby ball, a skateboard (I built them for friends), my first bitcoin, the baccalauréat and a grad cap, a slate and a studio light (directing and shooting), a toy plane and a suitcase, and a pixel portrait from collecting digital art.
- **Arrange it yourself.** Open `/?edit` (on `npm run dev`) and the desk comes up with a layout editor: click any prop, or pick it from the list, then move (G), rotate (R) or scale (S) it with the gizmo, or type exact numbers; H hides it, F flies the camera to it, shift snaps. The camera is free while you edit. Changes are kept as a draft in the browser; **save to layout.json** writes them into `src/layout.json`, which is what visitors get, and **copy json** puts the same thing on the clipboard. The editor is its own chunk and never loads outside edit mode.
- **Shareable.** `/#cat ~/shipped/super-bowl-ai` opens the terminal and runs the command.

## Content

`src/content/generated.json` is generated; don't edit it by hand.

```bash
npm run sync   # needs ../personal-portfolio (with node_modules) and ../ChristenJacquottet
```

The sync loads projects through the portfolio's own publication resolver, so the terminal can only show what the site publishes. Copy comes from the site's `content/site.ts`, and the art from the profile repo's `ascii-art.svg`. Hand-written bits (folder names, short names, open-source list) are in `src/content.ts`.

## The model

`public/models/apple-ii.glb` is built from the Sketchfab download with `npm run model -- path/to/scene.gltf` (114 MB → about 1 MB). `public/models/desk.glb` is Poly Haven's Metal Office Desk through `gltf-transform optimize` (meshopt, WebP). `public/models/props.glb` (~2.9 MB) merges the Poly Haven and Sketchfab props listed in `scripts/build-props.sh`, built with `npm run props -- path/to/downloads`; it loads after the computer, so `exit` never waits for it. The room, the wallpaper, the Dallas skyline, the racquet, ball, notebook, card, pennant, print, mug, floppies, bitcoin, grad cap, cork board, diploma and pixel portrait are made in code (`src/room.ts`, `src/props.ts`). The longhorn scan (830k faces) is decimated and re-oriented in Blender before the build; the steps are in `scripts/build-props.sh`.

## Credit

- 3D model: "[Apple II Computer](https://sketchfab.com/3d-models/apple-ii-computer-b5d316548d634f16a72dd503db0aa01b)" by [dark_igorek](https://sketchfab.com/dark_igorek), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credited in the desk view and in `credits`.
- Desk props, CC BY 4.0, credited in `credits`: "[Longhorn Skull_1](https://sketchfab.com/3d-models/longhorn-skull-1-f456325f5fce42f7b66bc1ee6c839e8b)" by The Aurochs Foundation, "[Old rugby ball](https://sketchfab.com/3d-models/old-rugby-ball-806e841289804bffba1c89757582f0ca)" by alban, "[Skateboard_01](https://sketchfab.com/3d-models/skateboard-01-bc02544579d34003a703962d7b930e7b)" by CrazyScans, "[Black film slate or clapperboard](https://sketchfab.com/3d-models/black-film-slate-or-clapperboard-f971698c983d4256a269424e88b17872)" by Bendar Multimedia, "[Vintage Toy Airplane 2](https://sketchfab.com/3d-models/vintage-toy-airplane-2-b40dc984692746b3a5132adffc3a14ad)" by berilbasak, "[Simple Studio Light](https://sketchfab.com/3d-models/simple-studio-light-771d351d2329444fab348909ebfd160b)" by AleixoAlonso, "[Old Computer Chair](https://sketchfab.com/3d-models/old-computer-chair-a311529b1ec349c48f789bf4e1f99e89)" by Slava Izvekov, "[Antique Globe](https://sketchfab.com/3d-models/antique-globe-78b47132c6be42bcb664545a69b380d9)" by Matthew Collings, "[Super 8 Camera (Canon 310XL)](https://sketchfab.com/3d-models/super-8-camera-canon-310xl-7218feba753b4b4bbdac135af36ac4a3)" by meesvanhout, "[rubik's cube](https://sketchfab.com/3d-models/rubiks-cube-155420e09a124ec3a3bcca0852280672)" by Shivansh Singh, "[SFM Telephone](https://sketchfab.com/3d-models/sfm-telephone-90ea20bab1aa41c9a537f80c5b9ea287)" by G=.
- Desk, floor and props from [Poly Haven](https://polyhaven.com) (CC0): Metal Office Desk, Old Wood Floor, Desk Lamp Arm 01, Portable Cassette Player, Camera 01, Potted Plant 04, Wall Clock, Hanging Picture Frame 01, Stationery Supplies, Round Spectacles, Rubber Duck Toy, Vintage Suitcase.
- The first version of this repo was [Nathaniel Macapinlac's WebShell](https://github.com/nasan016/webshell) template (MIT). This is a rewrite; his history is kept below it.
