import "./style.css";
import { art, projects, syncedAt } from "./content";
import { run, s } from "./output";
import { Terminal } from "./terminal";
import { THEMES, crtOn, currentTheme, onDisplayChange, restoreDisplay, setCrt, setTheme } from "./themes";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

restoreDisplay();

// Theme swatches and the CRT switch in the title bar.
const swatches = $("swatches");
for (const theme of THEMES) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "swatch";
  b.title = theme.label;
  b.setAttribute("aria-label", `theme ${theme.label}`);
  b.style.background = `linear-gradient(135deg, ${theme.bg} 50%, ${theme.fg} 50%)`;
  b.addEventListener("click", () => setTheme(theme.name));
  b.dataset.theme = theme.name;
  swatches.append(b);
}
const crtButton = $<HTMLButtonElement>("crt-toggle");
crtButton.addEventListener("click", () => setCrt(!crtOn()));
const syncControls = () => {
  for (const b of swatches.querySelectorAll<HTMLElement>(".swatch")) b.setAttribute("aria-pressed", String(b.dataset.theme === currentTheme()));
  crtButton.setAttribute("aria-pressed", String(crtOn()));
  crtButton.textContent = crtOn() ? "crt:on" : "crt:off";
};
onDisplayChange(syncControls);
syncControls();

// VHS on-screen display: tape counter and date stamp.
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const now = new Date();
$("osd-date").textContent = `${MONTHS[now.getMonth()]}. ${String(now.getDate()).padStart(2, "0")} ${now.getFullYear()}`;
const started = Date.now();
setInterval(() => {
  const t = Math.floor((Date.now() - started) / 1000);
  $("timecode").textContent = `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}, 1000);

const term = new Terminal($("term"), $("output"), $("prompt-line"), $("prompt"), $("mirror"), $<HTMLInputElement>("input"), $("title"));

async function boot() {
  const promptLine = $("prompt-line");
  promptLine.hidden = true;
  const skip = () => (term.skip = true);
  window.addEventListener("pointerdown", skip, { once: true });

  const bios = [
    "CJ-BIOS 26.10  (c) christen jacquottet",
    "memory check ............... 640K ok",
    "mounting ~/imagination ..... ok",
    "mounting ~/implementation .. ok",
    `loading ${projects.length} case studies ...... ok`,
    `content synced ............. ${syncedAt}`,
  ];
  for (const line of bios) {
    term.print([[s(line, "dim")]]);
    await term.pause(110);
  }
  await term.pause(420);
  $("output").replaceChildren();

  term.print([{ kind: "art", rows: art, maxHeight: 0.58 }, []]);
  await term.pause(700);
  promptLine.hidden = false;
  term.skip = false;
  window.removeEventListener("pointerdown", skip);

  await term.type("whoami");
  term.print([
    [],
    [s("type a command, or click one: ", "dim"), run("ls"), s(" · ", "dim"), run("projects"), s(" · ", "dim"), run("neofetch"), s(" · ", "dim"), run("theme"), s(" · ", "dim"), run("help")],
  ]);

  // Shareable links: christenjacquottet.com/#cat ~/shipped/world-cup-host
  const fromHash = decodeURIComponent(location.hash.slice(1)).trim();
  if (fromHash) await term.type(fromHash, 10);
  term.focus();
}

void boot();
