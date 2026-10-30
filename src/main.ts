import "./style.css";
import { art } from "./content";
import type { Desk } from "./desk";
import { run, s } from "./output";
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
      glass: currentScheme().bg,
      onProgress: () => {},
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
  void desk?.then((d) => d.setGlow(currentScheme().fg, currentScheme().bg));
});

const term = new Terminal($("term"), $("output"), $("prompt-line"), $("prompt"), $("mirror"), $<HTMLInputElement>("input"), stepBack);

// Warm the desk code (not the model) once the page is idle, unless the visitor is saving data.
const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
if (!connection?.saveData) {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 2500));
  idle(() => void loadDesk(), { timeout: 6000 });
}

async function boot() {
  term.print([{ kind: "art", rows: art, maxHeight: 0.55 }, [], [s(`Last login: ${stamp(new Date())} on ttys000`, "dim")]]);
  await term.pause(500);
  await term.type("whoami");
  term.print([
    [],
    [s("try ", "dim"), run("ls"), s(", ", "dim"), run("projects"), s(", ", "dim"), run("theme"), s(" or ", "dim"), run("help"), s(". ", "dim"), run("exit"), s(" steps back from the screen.", "dim")],
  ]);

  // Shareable links: /#cat ~/shipped/world-cup-host
  const fromHash = decodeURIComponent(location.hash.slice(1)).trim();
  if (fromHash) await term.type(fromHash, 10);
  term.focus();
}

void boot();
