import "./style.css";
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

function stepBack() {
  desk ??= loadDesk().then(({ createDesk }) =>
    createDesk({
      host: $("desk"),
      screenEl: $("screen"),
      glow: currentScheme().fg,
      onProgress: () => {},
      run: (command) => void term.type(command, 12),
      onSitDown: () => {
        term.print([[s(`Last login: ${stamp(new Date())} on ttys000`, "dim")]]);
        term.focus();
      },
    }),
  );
  desk
    .then((d) => d.stepBack())
    .catch(() => {
      desk = null;
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

void boot();
