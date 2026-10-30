export const THEMES = [
  { name: "github", label: "github: white and green, like the profile readme", bg: "#0d1117", fg: "#7ee787" },
  { name: "phosphor", label: "phosphor: green crt", bg: "#04140a", fg: "#33ff66" },
  { name: "amber", label: "amber: amber monochrome monitor", bg: "#160d00", fg: "#ffb000" },
  { name: "vhs", label: "vhs: tape bleed and tracking", bg: "#0b0a1c", fg: "#ff5cd6" },
  { name: "dos", label: "dos: white on blue", bg: "#0000a8", fg: "#ffff57" },
] as const;

export type ThemeName = (typeof THEMES)[number]["name"];

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

export const isTheme = (name: string): name is ThemeName => THEMES.some((t) => t.name === name);
export const currentTheme = () => (root.dataset.theme ?? "github") as ThemeName;
export const crtOn = () => root.dataset.crt !== "off";
export const onDisplayChange = (fn: () => void) => listeners.add(fn);

export function setTheme(name: ThemeName) {
  root.dataset.theme = name;
  store.set("cjsh.theme", name);
  const theme = THEMES.find((t) => t.name === name)!;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.bg);
  listeners.forEach((fn) => fn());
}

export function nextTheme(): ThemeName {
  const i = THEMES.findIndex((t) => t.name === currentTheme());
  return THEMES[(i + 1) % THEMES.length].name;
}

export function setCrt(on: boolean) {
  root.dataset.crt = on ? "on" : "off";
  store.set("cjsh.crt", on ? "on" : "off");
  listeners.forEach((fn) => fn());
}

export function restoreDisplay() {
  const saved = store.get("cjsh.theme");
  setTheme(saved && isTheme(saved) ? saved : "github");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const crt = store.get("cjsh.crt");
  setCrt(crt ? crt === "on" : !reduced);
}
