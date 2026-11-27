// Public sound API for the terminal and the 1983 desk.
// The AudioContext is created lazily on the first pointerdown/keydown; the Web Audio synth/DSP
// chunk (`./audio-engine`) is split out so the initial terminal bundle stays tiny, and no audio
// files are downloaded until after unlock.

export type Cue =
  | "key"
  | "keyReturn"
  | "keySpace"
  | "click"
  | "switch"
  | "diskInsert"
  | "diskRead"
  | "diskEject"
  | "tapeInsert"
  | "tapeButton"
  | "lidOpen"
  | "lidClose"
  | "phoneUp"
  | "phoneDown"
  | "paper"
  | "tap"
  | "clapper"
  | "shutter"
  | "spin"
  | "slosh"
  | "lampOn"
  | "boot"
  // Cues added by features live in src/cues/*.ts (see the README there); any name is allowed.
  | (string & {});

type Engine = typeof import("./audio-engine");

const STORAGE_KEY = "cjsh.sound";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

let muted = (() => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "off" || v === "false" || v === "0" || v === "muted";
  } catch {
    return false;
  }
})();
let unlocked = false;
let inside = 0;
let rackPan = 0.65;
let rackPresence = 0.35;
let wantRoom = false;
let wantHum = false;
let wantMusic = false;

let ctx: AudioContext | null = null;
let engine: Engine | null = null;
let enginePromise: Promise<Engine> | null = null;
const listeners = new Set<(muted: boolean) => void>();

function loadEngine(): Promise<Engine> {
  enginePromise ??= import("./audio-engine").then((m) => {
    engine = m;
    m.setRackMix(rackPan, rackPresence);
    if (ctx) {
      m.attach(ctx, { muted, inside, room: wantRoom, hum: wantHum, music: wantMusic });
    }
    return m;
  });
  return enginePromise;
}

function ensureContext(): AudioContext | null {
  if (!unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    if (engine) {
      engine.attach(ctx, { muted, inside, room: wantRoom, hum: wantHum, music: wantMusic });
    } else {
      void loadEngine();
    }
  }
  if (!muted && ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

function onGesture(e: Event) {
  if (!e.isTrusted) return;
  // Some keys (Escape, modifiers) aren't a gesture the browser lets audio start on: wait for one that is.
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  if (activation && !activation.isActive) return;
  unlocked = true;
  if (!muted) ensureContext();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
  window.addEventListener("keydown", onGesture, { capture: true, passive: true });
}

function setMuted(m: boolean) {
  const next = Boolean(m);
  if (next === muted) return;
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
  } catch {
    /* not persisted */
  }
  if (!muted && unlocked) ensureContext();
  engine?.updateMuted(muted);
  listeners.forEach((fn) => fn(muted));
}

export const audio: {
  /** `pan` is -1 (left) … 1 (right), where the thing is on screen. */
  play(cue: Cue, opts?: { volume?: number; rate?: number; pan?: number }): void;
  loop(name: "room" | "hum", on: boolean): void;
  music(on: boolean): Promise<void>;
  setInside(t: number): void;
  setRackMix(pan: number, presence: number): void;
  muted: boolean;
  setMuted(m: boolean): void;
  onChange(fn: (muted: boolean) => void): () => void;
} = {
  play(cue, opts) {
    if (muted || !unlocked || !ensureContext()) return;
    const vol = clamp(opts?.volume ?? 1, 0, 2);
    if (vol <= 0) return;
    const rate = clamp(opts?.rate ?? 1, 0.25, 4);
    const pan = clamp(opts?.pan ?? 0, -1, 1);
    if (engine) engine.playCue(cue, vol, rate, pan);
    else void loadEngine().then((m) => m.playCue(cue, vol, rate, pan));
  },

  loop(name, on) {
    const flag = Boolean(on);
    if (name === "room") wantRoom = flag;
    else wantHum = flag;
    if (flag && !muted && unlocked) ensureContext();
    engine?.setLoop(name, flag);
  },

  async music(on) {
    wantMusic = Boolean(on);
    if (!wantMusic) {
      await engine?.setMusic(false);
      return;
    }
    if (muted || !unlocked || !ensureContext()) return;
    const eng = engine ?? (await loadEngine());
    await eng.setMusic(true);
  },

  setRackMix(pan, presence) {
    if (Math.abs(rackPan - pan) < 0.012 && Math.abs(rackPresence - presence) < 0.012) return;
    rackPan = pan;
    rackPresence = presence;
    engine?.setRackMix(pan, presence);
  },

  setInside(t) {
    inside = clamp(Number.isFinite(t) ? t : 0, 0, 1);
    engine?.updateInside(inside);
  },

  get muted() {
    return muted;
  },
  set muted(m: boolean) {
    setMuted(m);
  },

  setMuted,

  onChange(fn) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

const SVG_HEAD = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.2h2.6L9.2 3v10L5.6 9.8H3z"/>`;
const ICON_ON = `${SVG_HEAD}<path d="M11.6 5.5a3.6 3.6 0 0 1 0 5"/><path d="M13.6 3.6a6.3 6.3 0 0 1 0 8.8"/></svg>`;
const ICON_OFF = `${SVG_HEAD}<path d="M11.8 6l3.2 4"/><path d="M15 6l-3.2 4"/></svg>`;

/** Mounts a small 12px IBM Plex Mono mute chip for the desk view (matching `.credit`). */
export function mountSoundToggle(parent: HTMLElement): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sound-toggle";

  const render = (isMuted: boolean) => {
    btn.dataset.muted = String(isMuted);
    btn.setAttribute("aria-pressed", String(!isMuted));
    btn.setAttribute("aria-label", isMuted ? "Unmute sound" : "Mute sound");
    btn.innerHTML = `${isMuted ? ICON_OFF : ICON_ON}<span>sound ${isMuted ? "off" : "on"}</span>`;
  };
  render(audio.muted);
  audio.onChange(render);

  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("pointerup", (e) => e.stopPropagation());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = !audio.muted;
    audio.setMuted(next);
    if (!next) audio.play("click", { volume: 0.75 });
  });

  parent.append(btn);
  return btn;
}
