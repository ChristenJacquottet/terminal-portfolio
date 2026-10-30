import "./style.css";
import { audio, mountSoundToggle } from "./audio";
import { EMPLOYER, art, profile } from "./content";
import type { Desk } from "./desk";
import { run, s, type Line } from "./output";
import { Terminal } from "./terminal";
import { currentScheme, onDisplayChange, restoreDisplay } from "./themes";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

restoreDisplay();

const stamp = (d: Date) =>
  d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "");

// ── the desk (three.js), loaded only when someone types `exit` ───────────────
let desk: Promise<Desk> | null = null;
const loadDesk = () => import("./desk");

/** A terminal progress bar: `desk  [████████░░░░░░░░]  52%  mounting`. */
const bar = (f: number, label: string): Line => {
  const n = 24;
  const full = Math.round(Math.min(1, Math.max(0, f)) * n);
  return [s("desk  ", "dim"), s(`[${"█".repeat(full)}${"░".repeat(n - full)}]`, "accent"), s(` ${String(Math.round(f * 100)).padStart(3)}%  `), s(label, "dim")];
};

// The first time, everything loads behind a progress line before you step back, so nothing on the
// desk pops in afterwards. Later exits are instant.
let fraction = 0;
let show: ((next: Line) => void) | null = null;

function stepBack() {
  // printed on the next frame, under the command's "logout"
  requestAnimationFrame(() => {
    if (fraction < 1 && !show) show = term.live(bar(fraction, "mounting /dev/desk"));
  });
  desk ??= loadDesk().then(({ createDesk }) =>
    createDesk({
      host: $("desk"),
      screenEl: $("screen"),
      glow: currentScheme().fg,
      onProgress: (f) => {
        fraction = f;
        show?.(bar(f, f < 0.35 ? "apple-ii.glb" : f < 1 ? "props.glb" : "ready"));
      },
      onSitDown: () => {
        term.print([[s(`Last login: ${stamp(new Date())} on ttys000`, "dim")]]);
        term.focus();
      },
      run: (command) => void term.type(command, 12),
      sound: {
        play: (cue) => audio.play(cue),
        music: (on) => audio.music(on),
        loop: (name, on) => audio.loop(name, on),
        setInside: (t) => audio.setInside(t),
        mount: (parent) => void mountSoundToggle(parent),
        muted: () => audio.muted,
        setMuted: (m) => audio.setMuted(m),
      },
    }),
  );
  desk
    .then(async (d) => {
      await d.ready;
      fraction = 1;
      show = null;
      return d.stepBack();
    })
    .catch(() => {
      desk = null;
      show = null;
      term.print([[s("exit: couldn't load the desk on this device. you're still logged in.", "err")]]);
    });
}

onDisplayChange(() => {
  void desk?.then((d) => d.setGlow(currentScheme().fg));
});

const term = new Terminal($("term"), $("output"), $("prompt-line"), $("prompt"), $("mirror"), $<HTMLInputElement>("input"), stepBack);

// Warm the desk code (not the model) once the page is idle, unless the visitor is saving data.
const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
if (!connection?.saveData) {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 2500));
  idle(() => void loadDesk(), { timeout: 6000 });
}

async function boot() {
  const promptLine = $("prompt-line");
  promptLine.hidden = true;
  const skip = () => (term.skip = true);
  window.addEventListener("pointerdown", skip, { once: true });
  window.addEventListener("keydown", skip, { once: true });

  await term.reveal(art, { maxHeight: 0.55 });

  // The login message: who's here, then where to start.
  const motd: Line[] = [
    [],
    [s(`Last login: ${stamp(new Date())} on ttys000`, "dim")],
    [s(profile.name.toLowerCase(), "bright"), s(` · ${profile.role.toLowerCase()} · ${EMPLOYER}, ${profile.location.split(",")[0].toLowerCase()}`)],
    [s(profile.headline.toLowerCase())],
    [],
    [s("try ", "dim"), run("ls"), s(", ", "dim"), run("projects"), s(", ", "dim"), run("theme"), s(" or ", "dim"), run("help"), s(". ", "dim"), run("exit"), s(" steps back from the screen.", "dim")],
  ];
  for (const line of motd) {
    term.print([line]);
    await term.pause(70);
  }
  promptLine.hidden = false;
  term.skip = false;
  window.removeEventListener("pointerdown", skip);
  window.removeEventListener("keydown", skip);

  // Shareable links: /#cat ~/shipped/world-cup-host
  const fromHash = decodeURIComponent(location.hash.slice(1)).trim();
  if (fromHash) await term.type(fromHash, 10);
  // `?edit` opens the desk's layout editor (editor.ts), so go straight to the desk.
  if (new URLSearchParams(location.search).has("edit")) await term.type("exit", 10);
  term.focus();
}

// `?soundtest`: dev-only audition panel for every cue and loop (never loaded otherwise).
if (new URLSearchParams(location.search).has("soundtest")) {
  void import("./soundtest").then((m) => m.mountSoundTest());
}

void boot();
