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
- **The desk.** `exit` loads a three.js scene: my room at 2 AM, sometime in 1983 (the brief is `docs/art-direction.md`). The terminal stays DOM (through CSS3D, so text stays sharp and typing still works) and sits *under* the WebGL canvas, which draws the curved glass as a hole with darkened edges and a reflection of the window, so the flat page reads as a curved CRT. Stepping back is one move: the screen narrows into the shape of the glass at the same text size, keeps its scrollback, and the camera carries the motion on, zooming at an even rate. Outside the blinds is Dallas at night (painted in code); the light is the desk lamp from its bulb (with a glow inside the shade), the moon and the city through the blinds, and the screen, which lights the keys in the theme's colour. Shadows are real but drawn only when something moves. Nothing 3D loads before `exit`: the page is ~39 KB gzipped, the desk chunk ~200 KB, the computer and desk models 1.2 MB, then the props 2.4 MB, which arrive with their shaders compiled so the flight never drops a frame. It only renders while something moves.
- **Touch anything.** Hovering a prop names it, with a soft rim of light; clicking does what it would do. The floppy box holds a disk for each featured project: pick one and it goes into the Disk II and opens the case study. The phone gets you in touch, the tape goes into the Walkman and plays, the lamp switches off (and the room goes to moonlight), the globe spins, the camera flashes, the Rubik's cube turns its faces (and solves itself if you leave it), the bitcoin flips. Everything can also be done from the terminal.
- **Sound.** Key clicks, switches, the disk drive and the tape, mostly synthesised in the browser (`src/audio.ts`); a few CC0 and public-domain recordings and a CC0 synthwave track in `public/audio/` (sources in `public/audio/CREDITS.md`). The room's rain and the tube's hum come up as you lean back from the screen and go quiet when you sit down. `sound off` or the button at the desk mutes it; `/?soundtest` auditions every cue.
- **The things on the desk** are true to me: a wooden racquet and a pennant (college tennis), a globe and a print of Réunion's peaks (where I was born), a Super 8 camera and a 35mm camera (filmmaking and photography), a graph-paper notebook (computer science), and a "CAN YOU HEAR ME?" card by the phone (the video call where the mic died and we held up paper). The rest comes from my old "what's on your fridge" timeline: a cork board of every place home has been (Réunion, French Guiana, Normandy, Indiana, London, Dallas), a steer skull (DFW), a rugby ball, a skateboard (I built them for friends), my first bitcoin, the baccalauréat and a grad cap, a slate and a spotlight (directing and shooting), a toy plane and a suitcase, and a pixel portrait from collecting digital art.
- **Arrange it yourself.** Open `/?edit` (on `npm run dev`) and the desk comes up with a layout editor: click any prop, or pick it from the list, then move (G), rotate (R) or scale (S) it with the gizmo, or type exact numbers; H hides it, F flies the camera to it, shift snaps. The camera is free while you edit. Changes are kept as a draft in the browser; **save to layout.json** writes them into `src/layout.json`, which is what visitors get, and **copy json** puts the same thing on the clipboard. The editor is its own chunk and never loads outside edit mode.
- **Shareable.** `/#cat ~/shipped/super-bowl-ai` opens the terminal and runs the command.

## Content

`src/content/generated.json` is generated; don't edit it by hand.

```bash
npm run sync   # needs ../personal-portfolio (with node_modules) and ../ChristenJacquottet
```

The sync loads projects through the portfolio's own publication resolver, so the terminal can only show what the site publishes. Copy comes from the site's `content/site.ts`, and the art from the profile repo's `ascii-art.svg`. Hand-written bits (folder names, short names, open-source list) are in `src/content.ts`.

## The model

`public/models/apple-ii.glb` is built from the Sketchfab download with `npm run model -- path/to/scene.gltf` (114 MB → about 1 MB). `public/models/desk.glb` is Poly Haven's Metal Office Desk through `gltf-transform optimize` (meshopt, WebP). `public/models/props.glb` (~2.5 MB) merges the Poly Haven and Sketchfab props listed in `scripts/build-props.sh`, each restyled towards one palette in Blender first (`scripts/restyle.py`, `art/restyle.json`, `art/palette.json`), built with `npm run props -- path/to/downloads`; it loads after the computer, so `exit` never waits for it. The room, the wallpaper, the Dallas skyline, the racquet, ball, notebook, card, pennant, print, mug, floppy box, bitcoin, Rubik's cube, grad cap, cork board, diploma and pixel portrait are made in code (`src/room.ts`, `src/props.ts`). 

## Credit

- 3D model: "[Apple II Computer](https://sketchfab.com/3d-models/apple-ii-computer-b5d316548d634f16a72dd503db0aa01b)" by [dark_igorek](https://sketchfab.com/dark_igorek), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credited in the desk view and in `credits`.
- Desk props, CC BY 4.0, credited in `credits`: "[Antique Globe](https://sketchfab.com/3d-models/antique-globe-78b47132c6be42bcb664545a69b380d9)" by Matthew Collings, "[Super 8 Camera (Canon 310XL)](https://sketchfab.com/3d-models/super-8-camera-canon-310xl-7218feba753b4b4bbdac135af36ac4a3)" by meesvanhout, "[Corded Retro Phone](https://sketchfab.com/3d-models/corded-retro-phone-60c04d4db45e4a3da26980d2cb31fe85)" by Tatyana Volkova, "[Answering Machine](https://sketchfab.com/3d-models/answering-machine-30b67732d9cb43ccbbd168f18360579c)" by jordofred, "[Cow Skull](https://sketchfab.com/3d-models/cow-skull-0b35b10c8a2e43ca8d1dd61bf0fefdd4)" by ForevereQ, "[Rugby](https://sketchfab.com/3d-models/rugby-e0c6627ca92545079644aea5506befe7)" by Rodrigo.Alarcao, "[Wood Penny Skateboard](https://sketchfab.com/3d-models/wood-penny-skateboard-618044c27b3040ae8bea4e38b3e9555f)" by natmr, "[Black film slate or clapperboard](https://sketchfab.com/3d-models/black-film-slate-or-clapperboard-f971698c983d4256a269424e88b17872)" by Bendar Multimedia, "[Vintage Toy Airplane 2](https://sketchfab.com/3d-models/vintage-toy-airplane-2-b40dc984692746b3a5132adffc3a14ad)" by berilbasak, "[Spotlight](https://sketchfab.com/3d-models/spotlight-60fde1a809e24dc2b7afc6bfd9b016f1)" by katsiaryna_kruhlenia, "[Old Suitcase // Game Ready](https://sketchfab.com/3d-models/old-suitcase-game-ready-1c927d3999e643bcaba078f03b7b2ee7)" by Alex Murias, "[Old Computer Chair](https://sketchfab.com/3d-models/old-computer-chair-a311529b1ec349c48f789bf4e1f99e89)" by Slava Izvekov, "[Set of Electronic Components](https://sketchfab.com/3d-models/cc0-set-of-electronic-components-f4cb777b4ea3490587008e24b61bcf75)" by literallylara, "[Atari Joystick](https://sketchfab.com/3d-models/atari-joystick-a9c8e3c680d64fedbe5abfb43c9708b5)" by Antony, "[Sony Walkman TPS-L2 (the headphones)](https://sketchfab.com/3d-models/sony-walkman-tps-l2-cassette-player-3cad4141c9aa4e67ba1d2ab1e5b9d277)" by berilbasak.
- Desk, floor and props from [Poly Haven](https://polyhaven.com) (CC0): Metal Office Desk, Old Wood Floor, Desk Lamp Arm 01, Portable Cassette Player, Camera 01, Potted Plant 04, Wall Clock, Hanging Picture Frame 01, Stationery Supplies, Round Spectacles, Rubber Duck Toy, Vintage Suitcase.
- The first version of this repo was [Nathaniel Macapinlac's WebShell](https://github.com/nasan016/webshell) template (MIT). This is a rewrite; his history is kept below it.
