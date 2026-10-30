# terminal-portfolio

My portfolio as a working terminal: the same ASCII art and look as my [GitHub profile](https://github.com/ChristenJacquottet), five period-monitor themes, and every published case study from [christenjacquottet.com](https://christenjacquottet.com) as a file you can `ls`, `cat` and `open`.

```console
$ ls -l ~/shipped
$ cat ~/shipped/world-cup-host
$ grep voice
$ projects | grep award
$ theme amber
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
- **Themes.** `github` (white and green, like the profile README), `phosphor`, `amber`, `vhs` and `dos`. Switch with `theme <name>`, `theme next` or the swatches in the title bar. `crt off` drops the scanlines, glow, noise and tracking roll; reduced-motion settings start with it off.
- **Shareable.** `/#cat ~/shipped/super-bowl-ai` opens the terminal and runs the command.

## Content

`src/content/generated.json` is generated; don't edit it by hand.

```bash
npm run sync   # needs ../personal-portfolio (with node_modules) and ../ChristenJacquottet
```

The sync loads projects through the portfolio's own publication resolver, so the terminal can only show what the site publishes. Copy comes from the site's `content/site.ts`, and the art from the profile repo's `ascii-art.svg`. Hand-written bits (folder names, short names, open-source list) are in `src/content.ts`.

## Credit

The first version of this repo was [Nathaniel Macapinlac's WebShell](https://github.com/nasan016/webshell) template (MIT). This is a rewrite; his history is kept below it.
