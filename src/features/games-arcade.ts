// The arcade lives on the Sony PVM. Click the C64 or the joystick (or type `play`): the camera
// frames the tube and it switches from the lab's status page to a green-phosphor title menu of
// cartridges (SNAKE, BLOCKS, PONG), high scores kept in this browser. Arrows or WASD play, Space
// or Enter starts, Escape leaves. While a game runs the keys belong to it, not to the terminal,
// and the joystick on the desk tilts with them.
//
// Render on demand: the game steps on its own fixed tick (a timer, nothing per frame), and only a
// tick or a key that changed the picture repaints the tube's texture and asks the desk for one
// frame. The stick's tilt eases with the desk's `animate`. Leaving, sitting down, a click away or
// a hidden tab stops it all.
import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Quaternion, Vector3, type Material, type Object3D, type Texture } from "three";
import { bus } from "../bus";
import { CARTS, H, W, hud, type Cart, type Dir, type Ev } from "./games-carts";
import { GREEN, createTube, loadScores, pad, pixelText, saveScore } from "./games-screen";
import type { DeskApi, Feature } from "./types";

type Mode = "menu" | "ready" | "play" | "paused" | "over";

let desk: DeskApi | null = null;
const carts: Cart[] = CARTS.map((make) => make());
let on = false;
let mode: Mode = "menu";
let choice = 0;
let cart: Cart | null = null;
let blinkOn = true;
let newHigh = false;
let timer = 0;
let watchdog = 0;
let restoreFocus: HTMLElement | null = null;
let texture: Texture | null = null;
const held = new Set<Dir>();

// ── the tube ──────────────────────────────────────────────────────────────────────────────────
const tube = createTube(W, H);

function overlay(l: CanvasRenderingContext2D, lines: [string, number, string][]) {
  const h = lines.reduce((n, [, s]) => n + s * 7 + 14, 26);
  const y0 = Math.round(H / 2 - h / 2 + 8);
  l.clearRect(96, y0, W - 192, h);
  l.strokeStyle = GREEN.mid;
  l.lineWidth = 2;
  l.strokeRect(100, y0 + 4, W - 200, h - 8);
  let y = y0 + 18;
  for (const [text, s, color] of lines) {
    if (text) pixelText(l, text, W / 2, y, s, color, "center");
    y += s * 7 + 14;
  }
}

function menu(l: CanvasRenderingContext2D) {
  const scores = loadScores();
  pixelText(l, "ARCADE", W / 2, 34, 6, GREEN.bright, "center");
  pixelText(l, "INSERT A CARTRIDGE", W / 2, 90, 2, GREEN.mid, "center");
  carts.forEach((c, i) => {
    const y = 132 + i * 46;
    const sel = i === choice;
    if (sel) {
      l.strokeStyle = GREEN.mid;
      l.lineWidth = 2;
      l.strokeRect(62, y - 10, W - 124, 41);
      if (blinkOn) pixelText(l, ">", 76, y, 3, GREEN.bright);
    }
    pixelText(l, c.title, 108, y, 3, sel ? GREEN.bright : GREEN.mid);
    pixelText(l, `HI ${pad(scores[c.id] ?? 0)}`, W - 80, y + 4, 2, sel ? GREEN.mid : GREEN.dim, "right");
  });
  if (blinkOn) pixelText(l, "PRESS SPACE", W / 2, 286, 3, GREEN.bright, "center");
  pixelText(l, carts[choice].controls, W / 2, 322, 2, GREEN.mid, "center");
  pixelText(l, "ESC LEAVES", W / 2, 344, 2, GREEN.dim, "center");
}

function content(l: CanvasRenderingContext2D) {
  if (mode === "menu" || !cart) return menu(l);
  cart.draw(l);
  hud(l, cart.title, cart.score(), Math.max(cart.score(), loadScores()[cart.id] ?? 0));
  if (mode === "ready") overlay(l, [["READY", 4, GREEN.bright], [cart.controls, 2, GREEN.mid]]);
  else if (mode === "paused") overlay(l, [["PAUSED", 4, GREEN.bright], [blinkOn ? "SPACE GOES ON" : "", 2, GREEN.mid]]);
  else if (mode === "over")
    overlay(l, [
      ["GAME OVER", 4, GREEN.bright],
      [newHigh ? `NEW HIGH ${pad(cart.score())}` : `SCORE ${pad(cart.score())}`, 2, newHigh && !blinkOn ? GREEN.dim : GREEN.bright],
      ["SPACE AGAIN · ESC MENU", 2, GREEN.mid],
    ]);
}

const draw = (g: CanvasRenderingContext2D) => tube(g, content);

/** Repaints the tube and draws one frame: no shadow pass, nothing else moves. */
function paint() {
  const pvm = desk?.pvm();
  if (!desk || !pvm || !on) return;
  if (!texture) return pvm.repaint();
  draw(pvm.ctx);
  texture.needsUpdate = true;
  desk.request();
}

/** The canvas texture on the PVM's glass, so a tick can update it without relighting the room. */
function findTexture(crt: Object3D): Texture | null {
  let found: Texture | null = null;
  crt.traverse((o) => {
    const mats = (o as Mesh).material as Material | Material[] | undefined;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const map = (m as Material & { map?: Texture | null }).map;
      if (!found && m.name === "pvm_light" && map) found = map;
    }
  });
  return found;
}

const sfx = (cue: string, volume?: number) => desk?.sound?.play(cue, { pan: 0.35, volume });

// ── the loop: a fixed tick, a repaint only when something changed ───────────────────────────
function schedule() {
  window.clearTimeout(timer);
  if (!on || document.hidden) return;
  const ms = mode === "play" && cart ? cart.tick() : mode === "ready" ? 900 : 520;
  timer = window.setTimeout(tick, ms);
}

function tick() {
  if (!on) return;
  if (mode === "play" && cart) {
    const ev = cart.step(held);
    if (handle(ev)) paint();
  } else if (mode === "ready") {
    mode = "play";
    paint();
  } else {
    blinkOn = !blinkOn; // the cursor and PRESS SPACE blink: one frame every half second
    paint();
  }
  schedule();
}

/** Plays what a step or a key did; true if the picture changed. */
function handle(ev: Ev): boolean {
  if (ev.sound) sfx(ev.sound);
  if (ev.over && cart) {
    mode = "over";
    blinkOn = true;
    newHigh = saveScore(cart.id, cart.score());
    held.clear();
    stick(null);
    sfx("arcadeOver");
    schedule();
    return true;
  }
  return Boolean(ev.changed);
}

function start(i: number) {
  choice = i;
  cart = carts[i];
  cart.reset();
  mode = "ready";
  newHigh = false;
  sfx("arcadeStart");
  desk?.holdCaption(`Sony PVM · ${cart.title.toLowerCase()} · esc for the menu`);
  paint();
  schedule();
}

function toMenu() {
  if (cart && (mode === "play" || mode === "paused")) saveScore(cart.id, cart.score());
  mode = "menu";
  blinkOn = true;
  held.clear();
  stick(null);
  desk?.holdCaption("Sony PVM · arcade · esc to leave");
  paint();
  schedule();
}

// ── keys: while the arcade is on they're its, not the terminal's or the page's ──────────────
const DIRS: Record<string, Dir> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
};

function onKey(e: KeyboardEvent) {
  if (!on || e.metaKey || e.ctrlKey || e.altKey) return; // the browser keeps its shortcuts
  e.preventDefault();
  e.stopImmediatePropagation();
  const dir = DIRS[e.code];
  if (e.type === "keyup") {
    if (dir) {
      held.delete(dir);
      stick([...held].pop() ?? null);
    }
    return;
  }
  const fire = e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter";
  if (dir) {
    held.add(dir);
    stick(dir);
  }
  if (e.key === "Escape") {
    if (mode === "menu") leave();
    else toMenu();
    return;
  }
  if (e.repeat && fire) return;
  switch (mode) {
    case "menu":
      if (dir === "up" || dir === "down") {
        choice = (choice + (dir === "up" ? carts.length - 1 : 1)) % carts.length;
        blinkOn = true;
        sfx("arcadeBlip");
        paint();
        schedule();
      } else if (fire) start(choice);
      return;
    case "ready":
      if (!dir && !fire) return;
      mode = "play";
      if (dir) handle(cart!.press(dir));
      paint();
      schedule();
      return;
    case "play": {
      if (!dir && !fire) return;
      if (handle(cart!.press(dir ?? "fire"))) paint();
      return;
    }
    case "paused":
      if (fire) {
        mode = "play";
        paint();
        schedule();
      }
      return;
    case "over":
      if (fire) start(choice);
  }
}

function takeKeys() {
  restoreFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  restoreFocus?.blur();
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
}

function giveKeysBack() {
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("keyup", onKey, true);
  if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  restoreFocus = null;
}

// ── the joystick's stick ──────────────────────────────────────────────────────────────────────
let pivot: Object3D | null = null;
let tilt = { x: 0, z: 0 };
let tiltToken = 0;
const TILT = 0.27; // about 15 degrees, as far as a CX40 goes

/**
 * The joystick is one mesh: lift the stick (and its rubber boot) out into its own mesh on a pivot
 * at the top of the base, so it can lean. Triangles near the stick's axis and above the base.
 */
function splitStick(root: Object3D) {
  let mesh: Mesh | null = null;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!mesh && m.isMesh && !(m.material as Material).transparent) mesh = m;
  });
  if (!mesh) return;
  const src = mesh as Mesh;
  const geo = src.geometry as BufferGeometry;
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  if (!pos || !index) return;
  root.updateMatrixWorld(true);
  const rel = root.matrixWorld.clone().invert().multiply(src.matrixWorld);
  const pts: Vector3[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const p = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(rel);
    pts.push(p);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const height = maxY - minY;
  const top = pts.filter((p) => p.y > maxY - height * 0.08);
  const ax = top.reduce((s, p) => s + p.x, 0) / top.length;
  const az = top.reduce((s, p) => s + p.z, 0) / top.length;
  const near = (i: number) => pts[i].y > minY + height * 0.28 && Math.hypot(pts[i].x - ax, pts[i].z - az) < height * 0.18;
  const keep: number[] = [];
  const lift: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    (tri.every(near) ? lift : keep).push(...tri);
  }
  if (lift.length < 30 || lift.length > index.count * 0.5) return; // not the shape we expected: leave it whole
  const baseTop = Math.min(...lift.map((i) => pts[i].y));
  const at = new Vector3(ax, baseTop, az);
  // The stick's geometry, in the pivot's frame (the root's axes, origin where it leaves the base),
  // in plain floats (the model's are quantized).
  const stickGeo = new BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const n = attr.itemSize;
    const out = new Float32Array(attr.count * n);
    for (let i = 0; i < attr.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = attr.getComponent(i, c);
    stickGeo.setAttribute(name, new BufferAttribute(out, n));
  }
  stickGeo.setIndex(lift);
  stickGeo.applyMatrix4(rel);
  stickGeo.translate(-at.x, -at.y, -at.z);
  const baseGeo = geo.clone();
  baseGeo.setIndex(keep);
  src.geometry = baseGeo;
  const stickMesh = new Mesh(stickGeo, src.material);
  stickMesh.castShadow = src.castShadow;
  stickMesh.receiveShadow = src.receiveShadow;
  const p = new Group();
  p.name = "joystick-stick";
  p.position.copy(at);
  p.add(stickMesh);
  root.add(p);
  pivot = p;
}

/** Leans the stick towards `dir` (null: it springs back to the middle). */
function stick(dir: Dir | null) {
  if (!pivot || !desk) return;
  const to = { x: dir === "up" ? -TILT : dir === "down" ? TILT : 0, z: dir === "left" ? TILT : dir === "right" ? -TILT : 0 };
  if (to.x === tilt.x && to.z === tilt.z) return;
  const from = { ...tilt };
  const token = ++tiltToken;
  const back = !dir;
  void desk.animate(back ? 420 : 90, (t) => {
    if (token !== tiltToken || !pivot) return;
    // out: quick and firm; back: the spring in the base overshoots once and settles
    const k = back ? 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 2 * 1.3) : 1 - (1 - t) ** 2;
    tilt = { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
    pivot.rotation.set(tilt.x, 0, tilt.z);
    if (t >= 1) tilt = to;
  });
}

// ── coming and going ──────────────────────────────────────────────────────────────────────────
/**
 * Frames the PVM and takes over its tube; `game` starts a cartridge straight away. False when the
 * camera can't go yet (still flying back from the screen).
 */
async function open(game?: string): Promise<boolean> {
  if (!desk) return false;
  const crt = desk.props.get("crt");
  const pvm = desk.pvm();
  if (!crt || !pvm) return false;
  const index = carts.findIndex((c) => c.id === game);
  if (!on) {
    const glass = crt.getObjectByName("crt-screen") ?? crt;
    const box = new Box3().setFromObject(glass).expandByScalar(0.02);
    const facing = new Vector3(0, 0, 1).applyQuaternion(crt.getWorldQuaternion(new Quaternion()));
    facing.y += 0.12; // a touch above, the way you'd lean in to play
    const flight = desk.frame(box, { dir: facing.normalize(), fill: 1, ms: 1000 });
    if (!desk.framed()) return false; // `frame` said no (it decides before its first await)
    on = true;
    mode = "menu";
    blinkOn = true;
    texture = findTexture(crt);
    pvm.override = draw;
    takeKeys();
    paint();
    sfx("arcadeOn");
    watchdog = window.setInterval(() => {
      // a click away, the glass (sitting down), anything that took the camera elsewhere: done
      if (on && (desk!.seated() || !desk!.framed())) leave(false);
    }, 250);
    await flight;
    if (!on) return true;
    if (index < 0) desk.holdCaption("Sony PVM · arcade · esc to leave");
  }
  if (index >= 0) start(index);
  else schedule();
  return true;
}

function leave(unframe = true) {
  if (!on || !desk) return;
  if (cart && (mode === "play" || mode === "paused")) saveScore(cart.id, cart.score());
  on = false;
  window.clearTimeout(timer);
  window.clearInterval(watchdog);
  held.clear();
  stick(null);
  const pvm = desk.pvm();
  if (pvm) {
    pvm.override = null;
    pvm.repaint();
  }
  giveKeysBack();
  desk.holdCaption(null);
  if (unframe && desk.framed()) void desk.unframe();
}

/** `play snake` from the terminal: wait until we're stepped back at the desk, then go. */
let playToken = 0;
function playFromTerminal(game?: string) {
  const until = performance.now() + 120000; // a first visit loads the whole desk first
  const mine = ++playToken;
  let wasUp = false;
  const tryOpen = () => {
    if (!desk || mine !== playToken || performance.now() > until) return;
    if (on) return void open(game);
    if (desk.seated()) {
      if (wasUp) return; // they sat back down before it got going: forget it
      return void window.setTimeout(tryOpen, 150);
    }
    wasUp = true;
    void open(game).then((ok) => {
      if (!ok) window.setTimeout(tryOpen, 150); // still flying back from the screen
    });
  };
  tryOpen();
}

// keys held when the window loses focus never come up: let go of them
window.addEventListener("blur", () => {
  if (!on) return;
  held.clear();
  stick(null);
});

document.addEventListener("visibilitychange", () => {
  if (!on) return;
  if (document.hidden) {
    window.clearTimeout(timer);
    if (mode === "play" || mode === "ready") mode = "paused";
    held.clear();
    stick(null);
  } else {
    paint();
    schedule();
  }
});

const arcade: Feature = {
  name: "games-arcade",
  hotspots: {
    c64: { kind: "games-arcade", label: "Commodore 64", hint: "1982 · 64 kilobytes · press play" },
    joystick: { kind: "games-arcade", label: "joystick", hint: "play on the PVM" },
  },
  props({ props }) {
    const joystick = props.get("joystick");
    if (joystick) splitStick(joystick);
  },
  actions: {
    async "games-arcade"({ object, sfx: play, motions, once, desk: getDesk, leave: hideChip }) {
      const d = getDesk();
      if (!d?.pvm() || !d.props.get("crt")) return void once(object, () => motions.wiggle(object, 0.05));
      if (on) return;
      hideChip();
      play("click", object, 0.8);
      await open();
    },
  },
  onDesk(d) {
    desk = d;
    bus.on("games:play", (p) => playFromTerminal(typeof p.game === "string" ? p.game : undefined));
    // `play` typed before the desk existed: it's waiting for us
    const early = bus.last("games:play");
    if (early && typeof early.at === "number" && Date.now() - early.at < 120000) playFromTerminal(typeof early.game === "string" ? early.game : undefined);
  },
};

export default arcade;

/** For games-rally.ts: whether the arcade has the tube (the rally count waits for the status page). */
export const arcadeOn = () => on;
