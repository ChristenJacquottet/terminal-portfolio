// Shared by the consequences features (power strip, UPS, NAS, Pi cluster, soldering station): the
// lab's LEDs as things you can switch one by one, the PVM's footer line, and the mains, so a power
// cut can reach everything plugged into the strip. Not a feature itself (no default export).
import type { BufferAttribute, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from "three";
import type { DeskApi } from "./types";

/** A merged LED quad mesh (lab.ts `ledCluster`, alive.ts `addSwitchLeds`), one brightness per LED. */
export type Leds = {
  mesh: Mesh;
  count: number;
  /** Sets LED `i` to `k` (0 off, 1 its own colour). */
  set: (i: number, k: number) => void;
  /** Every LED at `k`. */
  all: (k: number) => void;
};

/** The LED meshes inside `root` (additive, vertex-coloured, unlit), with their colours as made. */
export function ledsIn(root: Object3D | undefined | null): Leds[] {
  const found: Leds[] = [];
  root?.traverse((o) => {
    const mesh = o as Mesh;
    const mat = mesh.material as MeshBasicMaterial | undefined;
    if (!mesh.isMesh || !mat?.isMeshBasicMaterial || !mat.vertexColors || mat.toneMapped) return;
    const colour = mesh.geometry.getAttribute("color") as BufferAttribute | undefined;
    if (!colour) return;
    // the colours as made, kept from the first look (before the heartbeat dims any activity light)
    const base = (mesh.userData.ledBase ??= (colour.array as Float32Array).slice()) as Float32Array;
    const perLed = 6; // one quad each, two triangles, not indexed (alive.ts mergeGeos)
    const count = colour.count / perLed;
    const set = (i: number, k: number) => {
      for (let v = 0; v < perLed; v++) {
        const at = i * perLed + v;
        colour.setXYZ(at, base[at * 3] * k, base[at * 3 + 1] * k, base[at * 3 + 2] * k);
      }
      colour.needsUpdate = true;
    };
    found.push({ mesh, count, set, all: (k) => { for (let i = 0; i < count; i++) set(i, k); } });
  });
  return found;
}

// ── the PVM's footer line: shared ────────────────────────────────────────────────────────────────
// Whoever started most recently has the line; another's updates wait their turn, and when the
// latest clears its message, the one before it shows again (a build passing over a backup).
const footers = new Map<string, string>(); // in the order they started
/** Writes the PVM's footer for `owner` (null: `owner` is done with it). */
export function footer(desk: DeskApi, owner: string, text: string | null) {
  const pvm = desk.pvm();
  if (!pvm) return;
  if (text === null) footers.delete(owner);
  else footers.set(owner, text); // a Map keeps an updated key where it first went in
  const shown = [...footers.values()].pop() ?? null;
  if (shown === pvm.state.footer) return;
  pvm.state.footer = shown;
  pvm.repaint();
}

/** Sets a service line on the PVM ("coffee", "ok"), adding it if it isn't there. */
export function service(desk: DeskApi, name: string, state: string, ok: boolean) {
  const pvm = desk.pvm();
  if (!pvm) return;
  const line = pvm.state.services.find((s) => s[0] === name);
  if (line) {
    line[1] = state;
    line[2] = ok;
  } else pvm.state.services.push([name, state, ok]);
  pvm.repaint();
}

// ── the mains ───────────────────────────────────────────────────────────────────────────────────
const cutListeners = new Set<() => void>();
let busy = false;
export const mains = {
  /** Something on the strip wants to know when the power goes (the iron cools, a backup stops). */
  onCut(fn: () => void) {
    cutListeners.add(fn);
  },
  cut() {
    for (const fn of cutListeners) fn();
  },
  /** One outage at a time (the strip and the UPS share the room's lights). */
  get busy() {
    return busy;
  },
  set busy(b: boolean) {
    busy = b;
  },
};

// ── the lab coming back on ──────────────────────────────────────────────────────────────────────
/** The PVM's tube, and how to scale it about its own middle (a CRT collapsing to a line). */
export function pvmTube(desk: DeskApi) {
  const screen = desk.props.get("crt")?.getObjectByName("crt-screen") as Mesh | undefined;
  if (!screen) return null;
  screen.geometry.computeBoundingBox();
  const c = screen.geometry.boundingBox!.getCenter(screen.position.clone());
  const mat = screen.material as MeshStandardMaterial;
  mat.userData.lit ??= mat.emissiveIntensity || 0.92;
  const lit = mat.userData.lit as number;
  return {
    screen,
    /** Scales the picture to (sx, sy) about its centre, at `glow` of its brightness. */
    set(sx: number, sy: number, glow: number, dx = 0) {
      screen.visible = sx > 0.002 && sy > 0.002;
      screen.scale.set(Math.max(0.002, sx), Math.max(0.002, sy), 1);
      screen.position.set(c.x * (1 - sx) + dx, c.y * (1 - sy), 0);
      mat.emissiveIntensity = lit * glow;
    },
  };
}

/** The lab's lights, as switchable sets, found once. */
export function labLeds(desk: DeskApi) {
  const of = (name: string) => ledsIn(desk.props.get(name));
  return {
    strip: of("powerstrip"),
    switch: of("switch"),
    pis: of("picluster"),
    ups: of("ups"),
    nas: of("nas"),
    iron: of("soldering"),
  };
}

const wait = (desk: DeskApi, ms: number) => desk.animate(ms, () => {});

/**
 * The lab comes back after an outage, not in a snap: the strip's switch, the PVM's degauss thunk
 * and its picture opening from a line, the switch's power light and then its ports one by one, the
 * Pis, the UPS. Call it the moment the room's lights are back (blackout resolved): it darkens the
 * lab's own lights first, in the same tick, so nothing is seen at full before its turn.
 * `reboot`: the Apple II was on the strip too, so its terminal boots again.
 */
export async function powerOn(desk: DeskApi, o: { reboot: boolean; skipUps?: boolean }) {
  const leds = labLeds(desk);
  const tube = pvmTube(desk);
  const sets = [...leds.switch, ...leds.pis, ...leds.nas, ...(o.skipUps ? [] : leds.ups)];
  for (const l of sets) l.all(0);
  // the iron's LED belongs to the iron: it stays as the station left it
  tube?.set(1, 0, 0);
  desk.request();
  const play = (cue: string, volume = 1) => desk.sound?.play(cue, { volume });

  const steps: [number, () => void][] = [];
  steps.push([140, () => play("degauss")]);
  if (o.reboot) {
    steps.push([380, () => {
      play("degauss", 0.6);
      void desk.terminal.reboot();
    }]);
  }
  const sw = leds.switch[0];
  if (sw) {
    steps.push([620, () => sw.set(0, 1)]); // power
    for (let i = 1; i < sw.count; i++) steps.push([820 + i * 95, () => sw.set(i, 1)]);
  }
  const pi = leds.pis[0];
  if (pi) for (let b = 0; b < pi.count / 2; b++) {
    steps.push([1000 + b * 130, () => pi.set(b * 2, 1)]);
    steps.push([1250 + b * 130, () => pi.set(b * 2 + 1, 1)]);
  }
  for (const n of leds.nas) steps.push([1150, () => n.set(0, 1)]); // status only: the disks are idle
  if (!o.skipUps) for (const u of leds.ups) steps.push([900, () => u.all(1)]);
  steps.sort((a, b) => a[0] - b[0]);

  let next = 0;
  const start = performance.now();
  const total = 1900;
  await desk.animate(total, () => {
    const ms = performance.now() - start;
    while (next < steps.length && steps[next][0] <= ms) steps[next++][1]();
    if (tube) {
      // the PVM: dark, a bright line at 140 ms, opening to the full picture with a degauss wobble
      const t = (ms - 140) / 900;
      if (t <= 0) tube.set(1, 0, 0);
      else {
        const open = Math.min(1, t * 2.6);
        const wobble = Math.sin(t * 38) * Math.exp(-4 * t) * 0.006;
        tube.set(1, 0.012 + 0.988 * (1 - (1 - open) ** 3), (t < 0.12 ? 2.2 : 1 + 1.2 * Math.exp(-5 * t)) * Math.min(1, t * 8), wobble);
      }
    }
  });
  while (next < steps.length) steps[next++][1]();
  tube?.set(1, 1, 1);
  desk.relight();
  await wait(desk, 1);
}
