# terminal-portfolio

My portfolio as a working terminal: the same ASCII art and look as my [GitHub profile](https://github.com/ChristenJacquottet), terminal colour schemes, and every published case study from [christenjacquottet.com](https://christenjacquottet.com) as a file you can `ls`, `cat` and `open`. Type `exit` to step back from the screen: it is an Apple II on a desk under a lamp, and you can keep typing on it.

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
- **The desk.** `exit` loads a three.js scene: the computer on a desk under a lamp, with the live terminal on its tube (as DOM, through CSS3D, so text stays sharp and typing still works). Drag to look around, click the screen to sit back down. Nothing 3D loads before that: the page is ~36 KB gzipped, the desk chunk ~175 KB plus a 1 MB model, and it only renders while something moves.
- **Shareable.** `/#cat ~/shipped/super-bowl-ai` opens the terminal and runs the command.

## Content

`src/content/generated.json` is generated; don't edit it by hand.

```bash
npm run sync   # needs ../personal-portfolio (with node_modules) and ../ChristenJacquottet
```

The sync loads projects through the portfolio's own publication resolver, so the terminal can only show what the site publishes. Copy comes from the site's `content/site.ts`, and the art from the profile repo's `ascii-art.svg`. Hand-written bits (folder names, short names, open-source list) are in `src/content.ts`.

## The model

`public/models/apple-ii.glb` is built from the Sketchfab download with `npm run model -- path/to/scene.gltf` (114 MB → about 1 MB). `public/models/props.glb` (the lamp, cassette player, notepads, pens, spectacles and duck, ~0.7 MB) is built from Poly Haven downloads with `npm run props -- path/to/downloads`; it loads after the computer, so `exit` never waits for it. The mug and the floppies are made in code (`src/props.ts`).

## Credit

- 3D model: "[Apple II Computer](https://sketchfab.com/3d-models/apple-ii-computer-b5d316548d634f16a72dd503db0aa01b)" by [dark_igorek](https://sketchfab.com/dark_igorek), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credited in the desk view and in `credits`.
- Desk props: [Poly Haven](https://polyhaven.com/models) (CC0): Desk Lamp Arm 01, Portable Cassette Player, Office Notepads, Stationery Supplies, Round Spectacles, Rubber Duck Toy.
- The first version of this repo was [Nathaniel Macapinlac's WebShell](https://github.com/nasan016/webshell) template (MIT). This is a rewrite; his history is kept below it.
