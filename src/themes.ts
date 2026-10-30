// Colour schemes, the way a terminal emulator defines them: background, foreground, cursor and
// the eight ANSI colours. The shell's tones (dim, bright, accent, err) map onto the palette.

type Font = "plex" | "pixel";

export type Scheme = {
  name: string;
  about: string;
  font: Font;
  /** Retro monitors bloom; modern schemes only get a faint glow with crt on. */
  phosphor: boolean;
  bg: string;
  fg: string;
  dim: string;
  bright: string;
  accent: string;
  err: string;
  /** black, red, green, yellow, blue, magenta, cyan, white */
  ansi: [string, string, string, string, string, string, string, string];
};

export const THEMES: Scheme[] = [
  {
    name: "github",
    about: "white and green, like the profile readme",
    font: "plex",
    phosphor: false,
    bg: "#0d1117",
    fg: "#c9d1d9",
    dim: "#6e7681",
    bright: "#f0f6fc",
    accent: "#7ee787",
    err: "#ff7b72",
    ansi: ["#484f58", "#ff7b72", "#7ee787", "#d29922", "#58a6ff", "#bc8cff", "#39c5cf", "#b1bac4"],
  },
  {
    name: "phosphor",
    about: "p1 green crt",
    font: "pixel",
    phosphor: true,
    bg: "#031a0b",
    fg: "#33ff66",
    dim: "#1c9c3e",
    bright: "#c6ffd4",
    accent: "#e8ff7a",
    err: "#ffdf5e",
    ansi: ["#0b3d1a", "#7dff9c", "#33ff66", "#e8ff7a", "#1c9c3e", "#9dffb6", "#62ff8a", "#c6ffd4"],
  },
  {
    name: "amber",
    about: "p3 amber crt",
    font: "pixel",
    phosphor: true,
    bg: "#140c00",
    fg: "#ffb000",
    dim: "#a86c00",
    bright: "#ffe3a6",
    accent: "#fff1c9",
    err: "#ff6a3d",
    ansi: ["#3d2800", "#ff6a3d", "#ffb000", "#ffd166", "#a86c00", "#ffc94d", "#ffe3a6", "#fff1c9"],
  },
  {
    name: "homebrew",
    about: "green on black, the old mac terminal profile",
    font: "plex",
    phosphor: false,
    bg: "#000000",
    fg: "#28fe14",
    dim: "#13870a",
    bright: "#c8ffc0",
    accent: "#fffd38",
    err: "#ff4d4d",
    ansi: ["#000000", "#990000", "#00a600", "#999900", "#0000b2", "#b200b2", "#00a6b2", "#bfbfbf"],
  },
  {
    name: "pro",
    about: "white on black",
    font: "plex",
    phosphor: false,
    bg: "#000000",
    fg: "#f2f2f2",
    dim: "#7f7f7f",
    bright: "#ffffff",
    accent: "#00d900",
    err: "#e50000",
    ansi: ["#000000", "#990000", "#00a600", "#999900", "#2009db", "#b200b2", "#00a6b2", "#bfbfbf"],
  },
  {
    name: "solarized",
    about: "solarized dark",
    font: "plex",
    phosphor: false,
    bg: "#002b36",
    fg: "#93a1a1",
    dim: "#586e75",
    bright: "#fdf6e3",
    accent: "#b58900",
    err: "#dc322f",
    ansi: ["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5"],
  },
  {
    name: "dracula",
    about: "dracula",
    font: "plex",
    phosphor: false,
    bg: "#282a36",
    fg: "#f8f8f2",
    dim: "#6272a4",
    bright: "#ffffff",
    accent: "#50fa7b",
    err: "#ff5555",
    ansi: ["#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2"],
  },
  {
    name: "dos",
    about: "white on vga blue",
    font: "pixel",
    phosphor: false,
    bg: "#0000a8",
    fg: "#a8a8a8",
    dim: "#5757ff",
    bright: "#ffffff",
    accent: "#ffff57",
    err: "#ff5757",
    ansi: ["#000000", "#a80000", "#00a800", "#a85400", "#0000a8", "#a800a8", "#00a8a8", "#a8a8a8"],
  },
];

export type ThemeName = string;

const root = document.documentElement;
const listeners = new Set<() => void>();

// Storage can be missing or blocked (private windows, previews); the terminal works without it.
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* not persisted */
    }
  },
};

const FONTS: Record<Font, { family: string; size: string; leading: string }> = {
  plex: { family: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', size: "15px", leading: "1.4" },
  pixel: { family: '"VT323", ui-monospace, Menlo, monospace', size: "21px", leading: "1.2" },
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

let current: Scheme = THEMES[0];
let crt = true;

export const isTheme = (name: string) => THEMES.some((t) => t.name === name);
export const currentTheme = () => current.name;
export const currentScheme = () => current;
export const crtOn = () => crt;
export const onDisplayChange = (fn: () => void) => listeners.add(fn);

function apply() {
  const t = current;
  const font = { ...FONTS[t.font] };
  if (window.matchMedia("(max-width: 560px)").matches) font.size = t.font === "pixel" ? "18px" : "13px";
  const vars: Record<string, string> = {
    "--bg": t.bg,
    "--fg": t.fg,
    "--dim": t.dim,
    "--bright": t.bright,
    "--accent": t.accent,
    "--err": t.err,
    "--font": font.family,
    "--size": font.size,
    "--leading": font.leading,
    "--glow": !crt ? "none" : t.phosphor ? `0 0 2px ${rgba(t.fg, 0.85)}, 0 0 9px ${rgba(t.fg, 0.4)}` : `0 0 5px ${rgba(t.fg, 0.22)}`,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.crt = crt ? "on" : "off";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
  listeners.forEach((fn) => fn());
}

export function setTheme(name: ThemeName) {
  current = THEMES.find((t) => t.name === name) ?? THEMES[0];
  store.set("cjsh.theme", current.name);
  apply();
}

export function nextTheme(): ThemeName {
  const i = THEMES.indexOf(current);
  return THEMES[(i + 1) % THEMES.length].name;
}

export function setCrt(on: boolean) {
  crt = on;
  store.set("cjsh.crt", on ? "on" : "off");
  apply();
}

window.matchMedia("(max-width: 560px)").addEventListener("change", () => apply());

export function restoreDisplay() {
  const saved = store.get("cjsh.theme");
  current = THEMES.find((t) => t.name === saved) ?? THEMES[0];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const savedCrt = store.get("cjsh.crt");
  crt = savedCrt ? savedCrt === "on" : !reduced;
  apply();
}
