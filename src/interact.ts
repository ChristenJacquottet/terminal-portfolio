// Everything on the desk you can touch. Hovering shows a label and a soft rim of light; clicking
// does what the thing would do: the lamp switches, the globe spins, the camera flashes, a floppy
// goes into the Disk II and opens its project, the phone gets you in touch, the tape plays.
// Props carry their hotspot in userData.hotspot (props.ts) or get one here by name. Everything you
// can do here can also be done from the terminal; the desk is a shortcut, never the only door.
import type { Liquid } from "./mug";
import { featureActions, featureHotspots, features } from "./features";
import type { ActionCtx, DeskApi } from "./features/types";
import {
  AdditiveBlending,
  Box3,
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Intersection,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  type PointLight,
  type Scene,
  type SpotLight,
} from "three";

export type Hotspot = {
  kind: string;
  label: string;
  hint?: string;
  /** Leads somewhere (a project, contact): a stronger cue than the toys. */
  nav?: boolean;
  command?: string;
};

/** The props that don't bring their own hotspot. Labels in my words; the hint says what a click does. */
const BY_NAME: Record<string, Hotspot> = {
  lamp: { kind: "lamp", label: "desk lamp" },
  phone: { kind: "phone", label: "the phone", hint: "get in touch", nav: true },
  globe: { kind: "spin", label: "the globe", hint: "give it a spin" },
  super8: { kind: "wiggle", label: "Super 8", hint: "filmmaking" },
  camera: { kind: "flash", label: "35mm camera", hint: "photography" },
  clapper: { kind: "hop", label: "the slate", hint: "directing" },
  studiolight: { kind: "wiggle", label: "spotlight", hint: "shooting" },
  notebook: { kind: "wiggle", label: "graph-paper notebook", hint: "computer science" },
  card: { kind: "hop", label: "CAN YOU HEAR ME?", hint: "the call where the mic died" },
  racquet: { kind: "wiggle", label: "a wooden racquet", hint: "tennis at Taylor" },
  ball: { kind: "bounce", label: "tennis ball" },
  pennant: { kind: "swing", label: "Taylor tennis" },
  frame: { kind: "swing", label: "Réunion's peaks", hint: "where I was born" },
  diploma: { kind: "swing", label: "the baccalauréat" },
  mortarboard: { kind: "hop", label: "grad cap", hint: "Taylor University" },
  longhorn: { kind: "wiggle", label: "steer skull", hint: "DFW" },
  answering: { kind: "answering", label: "answering machine", hint: "leave a message", nav: true },
  headphones: { kind: "headphones", label: "headphones" },
  breadboard: { kind: "wiggle", label: "breadboard", hint: "something half wired" },
  multimeter: { kind: "wiggle", label: "multimeter" },
  joystick: { kind: "wiggle", label: "joystick" },
  rugby: { kind: "bounce", label: "rugby ball" },
  skateboard: { kind: "wiggle", label: "a skateboard I built", hint: "I built them for friends" },
  bitcoin: { kind: "flip", label: "my first bitcoin", hint: "flip it" },
  biplane: { kind: "wiggle", label: "toy plane" },
  suitcase: { kind: "hop", label: "the suitcase", hint: "always moving" },
  pixelart: { kind: "swing", label: "pixel portrait", hint: "collecting digital art" },
  mug: { kind: "mug", label: "the mug", hint: "still warm" },
  cube: { kind: "twist", label: "Rubik's cube", hint: "give it a turn" },
  duck: { kind: "hop", label: "rubber duck", hint: "for debugging" },
  spectacles: { kind: "wiggle", label: "reading glasses" },
  pens: { kind: "wiggle", label: "pen cup" },
  clock: { kind: "swing", label: "the clock", hint: "it's late" },
  worldmap: { kind: "swing", label: "the world map", hint: "the one from my room" },
  corkboard: { kind: "swing", label: "the pinboard", hint: "workbench notes" },
  books: { kind: "wiggle", label: "books" },
  rack: { kind: "wiggle", label: "the home lab", hint: "it hums" },
  crt: { kind: "crt", label: "Sony PVM", hint: "lab status · run neofetch", nav: true, command: "neofetch" },
  mac128k: { kind: "hop", label: "Macintosh 128K", hint: "1984 · 128 kilobytes" },
  c64: { kind: "wiggle", label: "Commodore 64", hint: "1982 · 64 kilobytes" },
  switch: { kind: "wiggle", label: "8-port switch", hint: "link lights on" },
  nas: { kind: "wiggle", label: "the NAS", hint: "backups" },
  thinkpad: { kind: "wiggle", label: "laptops", hint: "a few generations of them" },
  macbook: { kind: "wiggle", label: "laptops", hint: "a few generations of them" },
  pegboard: { kind: "swing", label: "the pegboard" },
  pliers: { kind: "swing", label: "pliers" },
  screwdrivers: { kind: "swing", label: "screwdrivers" },
  cutters: { kind: "swing", label: "wire cutters" },
  ivy: { kind: "wiggle", label: "ivy" },
  monstera: { kind: "wiggle", label: "monstera" },
  kiev: { kind: "flash", label: "Kiev rangefinder", hint: "photography" },
  plant: { kind: "wiggle", label: "the plant" },
  chair: { kind: "wiggle", label: "my chair" },
};

/** The defaults, with every feature's labels over them (src/features). */
const HOTSPOTS: Record<string, Hotspot> = { ...BY_NAME, ...featureHotspots };

/** Where each postcard's place sits in my story; the rest just say "home, once". */
export const PLACES: Record<string, string> = { "LA RÉUNION": "where I was born", INDIANA: "college", DALLAS: "home now" };

/** The Disk II: the middle of its slot, the way out of it, a disk's pose inside it, and its IN USE light. */
export type Drive = { slot: Vector3; out: Vector3; quaternion: Quaternion; led: Mesh };

export type Target = { object: Object3D; spot: Hotspot; hit: Intersection };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** A damped wobble: starts at 0, rings `freq` times a second-ish, dies away. */
const wobble = (t: number, freq: number, decay: number) => Math.sin(t * Math.PI * 2 * freq) * Math.exp(-decay * t);
/** A toss: up fast, down under gravity, with one small bounce at the end (0 → 1 → 0, then a blip). */
const toss = (t: number) => (t < 0.8 ? Math.sin((t / 0.8) * Math.PI) ** 0.9 : 0.14 * Math.sin(((t - 0.8) / 0.2) * Math.PI));
/** Where a spring settles after a kick: overshoots once, then rests. */
const settle = (t: number) => 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 2 * 1.4);

export function createInteractions(o: {
  scene: Scene;
  camera: PerspectiveCamera;
  host: HTMLElement;
  /** Runs `step(t)` (0 → 1) each frame for `ms`, redrawing (and re-shadowing) as it goes. */
  animate: (ms: number, step: (t: number) => void) => Promise<void>;
  relight: () => void;
  /** Sit at the computer and type a command into the terminal. */
  sitDownAndRun: (command: string) => Promise<void>;
  lamp: SpotLight;
  flash: PointLight;
  drive: Drive | null;
  /** A cue, panned to where the prop is on screen. */
  sfx: (cue: string, opts?: { pan?: number; volume?: number }) => void;
  music: (on: boolean) => void;
  /** The sound switch, for the headphones (null when there's no sound layer). */
  muted: () => boolean | null;
  setMuted: (m: boolean) => void;
  time: () => "dusk" | "night";
  setTime: (time: "dusk" | "night") => void;
  /** The desk's API for features, once it exists. */
  desk: () => DeskApi | null;
}) {
  const { scene, camera } = o;
  const targets: Object3D[] = [];
  /** Where a prop is across the screen, -1..1, for panning its sound. */
  const ndc = new Vector3();
  const panOf = (x: Object3D) => {
    x.getWorldPosition(ndc).project(camera);
    return Number.isFinite(ndc.x) ? Math.max(-0.8, Math.min(0.8, ndc.x * 0.7)) : 0;
  };
  const sfx = (cue: string, x?: Object3D, volume?: number) => o.sfx(cue, { pan: x ? panOf(x) : 0, volume });
  const ray = new Raycaster();
  const pointer = new Vector2();

  // ── the label chip, which follows the pointer ──────────────────────────────────────
  const chip = document.createElement("div");
  chip.className = "prop-label";
  chip.hidden = true;
  o.host.append(chip);
  const showChip = (spot: Hotspot, label: string, hint: string | undefined, e: PointerEvent) => {
    chip.classList.toggle("nav", Boolean(spot.nav));
    chip.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = label;
    chip.append(b);
    if (hint) {
      const span = document.createElement("span");
      span.textContent = hint;
      chip.append(span);
    }
    chip.style.transform = `translate(${Math.round(e.clientX + 16)}px, ${Math.round(e.clientY + 18)}px)`;
    chip.hidden = false;
  };

  // ── the rim: an additive fresnel shell over whatever is hovered ────────────────────
  const rim = new ShaderMaterial({
    uniforms: { uColor: { value: new Color("#ffe8c2") }, uStrength: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        gl_FragColor = vec4(uColor * (0.12 + 1.6 * f) * uStrength, 1.0);
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  // A degenerate mesh so the rim's shader is compiled with everything else, not on first hover.
  const warm = new Mesh(new BufferGeometry().setFromPoints([new Vector3(), new Vector3(), new Vector3()]), rim);
  warm.frustumCulled = false;
  scene.add(warm);

  let lit: Object3D | null = null;
  const shells: Mesh[] = [];
  /** Returns whether anything changed (so the caller only redraws when it did). */
  const highlight = (object: Object3D | null, strength: number) => {
    const changed = object !== lit || rim.uniforms.uStrength.value !== (object ? strength : 0);
    if (object !== lit) {
      for (const s of shells.splice(0)) s.removeFromParent();
      lit = object;
      object?.traverseVisible((m) => {
        const mesh = m as Mesh;
        // not the rim itself, nor decals and shadows (transparent): those would light up as squares
        if (!mesh.isMesh || mesh.material === rim || (mesh.material as MeshStandardMaterial).transparent || !(mesh.geometry as BufferGeometry).getAttribute("normal")) return;
        const shell = new Mesh(mesh.geometry, rim);
        shell.raycast = () => {};
        shell.renderOrder = 2;
        mesh.add(shell);
        shells.push(shell);
      });
    }
    rim.uniforms.uStrength.value = object ? strength : 0;
    return changed;
  };

  // ── finding what's under the pointer ──────────────────────────────────────────────
  const spotOf = (object: Object3D): Hotspot | undefined => (object.name && featureHotspots[object.name]) || (object.userData.hotspot as Hotspot | undefined) || (object.name ? HOTSPOTS[object.name] : undefined);
  const shown = (object: Object3D) => {
    for (let p: Object3D | null = object; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  /**
   * The props, and boxes for what might stand in front of them (the computer's parts): testing a
   * few boxes instead of the computer's 77k triangles keeps hovering inside a frame.
   */
  const blockers: Box3[] = [];
  function setTargets(props: Iterable<Object3D>, occluders: Box3[]) {
    targets.length = 0;
    targets.push(...props);
    blockers.length = 0;
    blockers.push(...occluders);
  }

  const behind = new Vector3();
  function pick(e: PointerEvent, width: number, height: number): Target | null {
    pointer.set((e.clientX / width) * 2 - 1, -(e.clientY / height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(targets, true).find((h) => shown(h.object) && (h.object as Mesh).material !== rim);
    if (!hit) return null;
    for (const box of blockers) {
      if (ray.ray.intersectBox(box, behind) && behind.distanceTo(ray.ray.origin) < hit.distance) return null;
    }
    for (let p: Object3D | null = hit.object; p; p = p.parent) {
      const spot = spotOf(p);
      if (spot) return { object: p, spot, hit };
    }
    return null;
  }

  // ── state that changes labels ──────────────────────────────────────────────────────
  let lampOn = true;
  let busy = false;
  let inDrive: Object3D | null = null;
  let tapeIn = false;
  let playing = false;

  const labelFor = (t: Target): [string, string | undefined] => {
    const { spot } = t;
    for (const f of features) {
      const custom = f.label?.(t.object, spot);
      if (custom) return custom;
    }
    if (spot.kind === "lamp") return [spot.label, lampOn ? "switch it off" : "switch it on"];
    if (spot.kind === "headphones") return [spot.label, o.muted() ? "sound on" : "sound off"];
    if (spot.kind === "time") return [spot.label, o.time() === "dusk" ? "wait for night" : "back to dusk"];
    if (spot.kind === "walkman") return [spot.label, tapeIn ? (playing ? "pause" : "play") : "no tape in it"];
    if (spot.kind === "tape") return [spot.label, tapeIn ? "take it out" : spot.hint];
    if (spot.kind === "disk" && t.object === inDrive) return [spot.label, "it's in the drive: open it"];
    return [spot.label, spot.hint];
  };

  /** Shows what's under the pointer; true when the scene needs a redraw. */
  function hover(t: Target | null, e: PointerEvent): boolean {
    if (!t || busy) {
      chip.hidden = true;
      return highlight(null, 0);
    }
    const [label, hint] = labelFor(t);
    showChip(t.spot, label, hint, e);
    return highlight(t.object, t.spot.nav ? 1 : 0.65);
  }

  /** A label with no object behind it (the screen, which desk.ts handles itself). */
  function say(label: string, hint: string, e: PointerEvent): boolean {
    showChip({ kind: "screen", label, nav: true }, label, hint, e);
    return highlight(null, 0);
  }

  function leave(): boolean {
    chip.hidden = true;
    return highlight(null, 0);
  }

  // ── motions ────────────────────────────────────────────────────────────────────────
  const moving = new WeakSet<Object3D>();
  async function once(object: Object3D, run: () => Promise<void>) {
    if (moving.has(object)) return;
    moving.add(object);
    try {
      await run();
    } finally {
      moving.delete(object);
    }
  }
  const hop = (x: Object3D, height = 0.03, ms = 560) => {
    const y = x.position.y;
    const turn = x.rotation.y;
    const tilt = x.rotation.z;
    return o.animate(ms, (t) => {
      x.position.y = y + height * toss(t);
      x.rotation.y = turn + 0.22 * wobble(t, 1.1, 2.6);
      // lands a touch off-square, then rights itself
      x.rotation.z = tilt + (t > 0.8 ? 0.05 * Math.sin(((t - 0.8) / 0.2) * Math.PI) : 0);
    }).then(() => {
      x.position.y = y;
      x.rotation.y = turn;
      x.rotation.z = tilt;
    });
  };
  const bounce = (x: Object3D) => {
    const y = x.position.y;
    const turn = x.rotation.y;
    return o.animate(1150, (t) => {
      // three bounces, each lower and shorter, and it rolls a little as it goes
      const k = t < 0.45 ? t / 0.45 : t < 0.76 ? (t - 0.45) / 0.31 : (t - 0.76) / 0.24;
      const h = t < 0.45 ? 0.06 : t < 0.76 ? 0.024 : 0.007;
      x.position.y = y + h * Math.sin(k * Math.PI);
      x.rotation.y = turn + 0.5 * easeOut(t);
    }).then(() => {
      x.position.y = y;
      x.rotation.y = turn;
    });
  };
  const spin = (x: Object3D) => {
    const turn = x.rotation.y;
    const tilt = x.rotation.z;
    return o.animate(1900, (t) => {
      x.rotation.y = turn + easeOut(t) * Math.PI * 2;
      // the axis nods as it spins up, and settles as it slows
      x.rotation.z = tilt + 0.018 * wobble(t, 2.2, 2.4);
    }).then(() => {
      x.rotation.y = turn;
      x.rotation.z = tilt;
    });
  };
  /** A nudge: it turns a little, rocks on its base and lifts a hair, then comes to rest. */
  const wiggle = (x: Object3D, amount = 0.08) => {
    const turn = x.rotation.y;
    const tilt = x.rotation.z;
    const y = x.position.y;
    return o.animate(760, (t) => {
      x.rotation.y = turn + amount * wobble(t, 2.5, 4);
      x.rotation.z = tilt + amount * 0.35 * wobble(t + 0.04, 3.1, 5);
      x.position.y = y + 0.004 * Math.max(0, Math.sin(t * Math.PI * 1.6)) * (1 - t);
    }).then(() => {
      x.rotation.y = turn;
      x.rotation.z = tilt;
      x.position.y = y;
    });
  };
  /** Something hung on a nail swings from the nail, not its middle. */
  const swing = (x: Object3D) => {
    const tilt = x.rotation.z;
    const px = x.position.x;
    const py = x.position.y;
    // how far the top edge is above the holder's origin (the pin, for postcards: 0)
    x.updateMatrixWorld(true);
    const top = new Box3().setFromObject(x).max.y - x.getWorldPosition(new Vector3()).y;
    const reach = Math.max(0, top) / Math.max(1e-6, x.getWorldScale(new Vector3()).y) * (x.parent ? 1 / Math.max(1e-6, x.parent.getWorldScale(new Vector3()).y) : 1);
    return o.animate(1500, (t) => {
      const a = 0.055 * wobble(t, 1.5, 2.6);
      x.rotation.z = tilt + a;
      x.position.x = px + reach * Math.sin(a);
      x.position.y = py + reach * (1 - Math.cos(a));
    }).then(() => {
      x.rotation.z = tilt;
      x.position.x = px;
      x.position.y = py;
    });
  };
  const flip = async (x: Object3D) => {
    const y = x.position.y;
    const roll = x.rotation.x;
    const tilt = x.rotation.z;
    await o.animate(820, (t) => {
      x.position.y = y + 0.09 * Math.sin(t * Math.PI) ** 0.8;
      x.rotation.x = roll + easeOut(t) * Math.PI * 4;
    });
    x.position.y = y;
    x.rotation.x = roll;
    // it lands on its edge and rocks flat
    await o.animate(420, (t) => (x.rotation.z = tilt + 0.11 * wobble(t, 3.4, 4.5)));
    x.rotation.z = tilt;
  };
  /** The coffee: knock the cup, the coffee sloshes and rings, steam rises while it's warm. */
  const liquidOf = (x: Object3D): Liquid | null => {
    let found: Liquid | null = null;
    x.traverse((c) => {
      if (!found && c.userData.liquid) found = c.userData.liquid as Liquid;
    });
    return found;
  };
  // One loop drives the coffee, however it was started (a knock, or stepping back from the screen),
  // so a knock during the steam never runs the liquid twice.
  const mugTilt = { x: 0, z: 0 };
  let liquidRunning = false;
  async function runLiquid(liquid: Liquid) {
    if (liquidRunning) return;
    liquidRunning = true;
    try {
      let last = performance.now();
      let alive = true;
      while (alive) {
        await o.animate(400, () => {
          const now = performance.now();
          alive = liquid.step(Math.min(0.05, (now - last) / 1000), now, camera as Camera, mugTilt);
          last = now;
        });
      }
    } finally {
      liquidRunning = false;
    }
  }
  /** Knock the cup: it rocks on its base for a second, and the coffee answers. */
  const nudgeMug = async (x: Object3D) => {
    const liquid = liquidOf(x);
    const rx = x.rotation.x;
    const rz = x.rotation.z;
    const y = x.position.y;
    if (liquid) {
      liquid.knock(0.9);
      void runLiquid(liquid);
    }
    await o.animate(1000, (t) => {
      mugTilt.z = 0.085 * wobble(t, 2.1, 4.2);
      mugTilt.x = 0.03 * wobble(t + 0.05, 2.7, 5);
      x.rotation.z = rz + mugTilt.z;
      x.rotation.x = rx + mugTilt.x;
      x.position.y = y + 0.003 * Math.max(0, Math.sin(t * Math.PI * 2.2)) * (1 - t);
    });
    mugTilt.x = mugTilt.z = 0;
    x.rotation.x = rx;
    x.rotation.z = rz;
    x.position.y = y;
  };
  /** Steam off the coffee for a while (stepping back from the screen), without touching the cup. */
  function steamMug(ms: number) {
    const mug = scene.getObjectByName("mug");
    const liquid = mug ? liquidOf(mug) : null;
    if (!liquid) return Promise.resolve();
    liquid.steam(ms);
    return runLiquid(liquid);
  }

  /** The lamp at `k` of full: the cone, the spill inside the shade and the bulb's glow together. */
  function lampLevel(k: number) {
    const { lamp } = o;
    lamp.intensity = ((lamp.userData.on as number | undefined) ?? 2.6) * k;
    const spill = lamp.userData.spill as PointLight | undefined;
    if (spill) spill.intensity = 0.35 * k;
    const bulb = lamp.userData.bulb as MeshStandardMaterial | undefined;
    if (bulb) bulb.emissiveIntensity = 2.5 * k;
  }
  function setLamp(on: boolean) {
    lampOn = on;
    void once(o.lamp, async () => {
      if (on) {
        // a filament: a flicker as it catches, an overshoot, then steady
        await o.animate(260, (t) => {
          const catching = t < 0.35 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 52)) : 1;
          lampLevel(Math.min(1.08, settle(t) * 1.08) * catching);
        });
        lampLevel(1);
      } else {
        // off: the filament cools over a few frames
        await o.animate(140, (t) => lampLevel((1 - t) ** 2));
        lampLevel(0);
      }
      o.relight();
    });
  }

  async function camera35(x: Object3D) {
    sfx("shutter", x);
    x.updateMatrixWorld();
    o.flash.position.copy(x.getWorldPosition(new Vector3())).add(new Vector3(0, 0.08, 0.06));
    await o.animate(320, (t) => (o.flash.intensity = 6 * (1 - t) ** 2));
    o.flash.intensity = 0;
  }

  /** Moves `x` (re-parented to the scene, world pose kept) to a world pose along an arc. */
  function flyTo(x: Object3D, to: { position: Vector3; quaternion: Quaternion; scale?: Vector3 }, ms: number, lift = 0.12) {
    scene.attach(x);
    const p0 = x.position.clone();
    const q0 = x.quaternion.clone();
    const s0 = x.scale.clone();
    return o.animate(ms, (t) => {
      const e = ease(t);
      x.position.lerpVectors(p0, to.position, e);
      x.position.y += lift * 4 * e * (1 - e);
      x.quaternion.slerpQuaternions(q0, to.quaternion, e);
      if (to.scale) x.scale.lerpVectors(s0, to.scale, e);
    });
  }

  const worldPose = (x: Object3D) => ({
    position: x.getWorldPosition(new Vector3()),
    quaternion: x.getWorldQuaternion(new Quaternion()),
    scale: x.getWorldScale(new Vector3()),
  });

  // ── floppies ───────────────────────────────────────────────────────────────────────
  /** Puts a disk back in its slot in the box. */
  async function shelve(disk: Object3D) {
    const box = disk.userData.box as Object3D;
    const slot = disk.userData.slot as { position: Vector3; rotation: { x: number; y: number; z: number } };
    const home = new Mesh();
    box.add(home);
    home.position.copy(slot.position);
    home.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z);
    const to = worldPose(home);
    home.removeFromParent();
    sfx("diskEject", disk);
    if (o.drive) await slide(disk, o.drive, 0, 1);
    await flyTo(disk, to, 650);
    box.attach(disk);
    disk.position.copy(slot.position);
    disk.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z);
  }

  /** In and out of the drive, along its slot: 0 is all the way in, 1 is just outside. */
  function slide(disk: Object3D, drive: Drive, from: number, to: number) {
    return o.animate(320, (t) => {
      const k = from + (to - from) * ease(t);
      disk.position.copy(drive.slot).addScaledVector(drive.out, k * 0.15);
    });
  }

  async function load(disk: Object3D, command: string) {
    if (busy) return;
    busy = true;
    leave();
    try {
      if (inDrive && inDrive !== disk) {
        const old = inDrive;
        inDrive = null;
        await shelve(old);
      }
      if (inDrive !== disk && o.drive) {
        const { drive } = o;
        disk.userData.box ??= disk.parent;
        sfx("click", disk);
        const lifted = worldPose(disk);
        lifted.position.y += 0.1;
        await flyTo(disk, lifted, 260, 0);
        const outside = drive.slot.clone().addScaledVector(drive.out, 0.15);
        await flyTo(disk, { position: outside, quaternion: drive.quaternion, scale: lifted.scale }, 750, 0.06);
        sfx("diskInsert", disk);
        await slide(disk, drive, 1, 0);
        inDrive = disk;
        drive.led.visible = true;
        sfx("diskRead", disk);
        await o.animate(300, () => {});
      }
      await o.sitDownAndRun(command);
    } finally {
      if (o.drive) o.drive.led.visible = false;
      busy = false;
    }
  }

  // ── the Walkman ───────────────────────────────────────────────────────────────────
  let tapeHome: { parent: Object3D; position: Vector3; quaternion: Quaternion; scale: Vector3 } | null = null;
  async function insertTape(tape: Object3D, walkman: Object3D) {
    const bay = walkman.userData.bay as Vector3 | null;
    if (!bay) return;
    tapeHome ??= { parent: tape.parent!, position: tape.position.clone(), quaternion: tape.quaternion.clone(), scale: tape.scale.clone() };
    const to = {
      position: walkman.localToWorld(bay.clone()),
      quaternion: walkman.getWorldQuaternion(new Quaternion()),
      scale: walkman.getWorldScale(new Vector3()),
    };
    await flyTo(tape, to, 700, 0.08);
    walkman.attach(tape);
    sfx("tapeInsert", walkman);
    tapeIn = true;
    playing = true;
    o.music(true);
  }
  async function ejectTape(tape: Object3D) {
    if (!tapeHome) return;
    o.music(false);
    playing = false;
    sfx("lidOpen", tape);
    const home = tapeHome;
    const ghost = new Mesh();
    home.parent.add(ghost);
    ghost.position.copy(home.position);
    ghost.quaternion.copy(home.quaternion);
    ghost.scale.copy(home.scale);
    const to = worldPose(ghost);
    ghost.removeFromParent();
    await flyTo(tape, to, 650, 0.08);
    home.parent.attach(tape);
    tapeIn = false;
  }

  // ── the Rubik's cube: real face turns, and it solves itself when you leave it alone ──
  const turns: { axis: "x" | "y" | "z"; layer: number; dir: number }[] = [];
  let solveTimer = 0;
  async function turn(cubies: Object3D, move: { axis: "x" | "y" | "z"; layer: number; dir: number }, ms: number) {
    const step = cubies.userData.step as number;
    const layer = cubies.children.filter((c) => Math.round(c.position[move.axis] / step) === move.layer);
    const pivot = new Mesh();
    cubies.add(pivot);
    for (const c of layer) pivot.attach(c);
    await o.animate(ms, (t) => (pivot.rotation[move.axis] = (move.dir * Math.PI * ease(t)) / 2));
    for (const c of layer) {
      cubies.attach(c);
      // back onto the grid, square to it
      c.position.set(Math.round(c.position.x / step) * step, Math.round(c.position.y / step) * step, Math.round(c.position.z / step) * step);
      c.updateMatrix();
      const m = new Matrix4().extractRotation(c.matrix);
      m.elements.forEach((v, i) => (m.elements[i] = Math.round(v)));
      c.quaternion.setFromRotationMatrix(m);
    }
    pivot.removeFromParent();
  }
  async function twist(cube: Object3D) {
    const cubies = cube.getObjectByName("cubies");
    if (!cubies) return hop(cube);
    const axes = ["x", "y", "z"] as const;
    const move = { axis: axes[Math.floor(Math.random() * 3)], layer: Math.floor(Math.random() * 3) - 1, dir: Math.random() < 0.5 ? 1 : -1 };
    await turn(cubies, move, 260);
    turns.push(move);
    clearTimeout(solveTimer);
    solveTimer = window.setTimeout(() => {
      void once(cube, async () => {
        while (turns.length) {
          const m = turns.pop()!;
          sfx("click", cube, 0.7);
          await turn(cubies, { ...m, dir: -m.dir }, 170);
        }
      });
    }, 4000);
  }

  // ── clicks ─────────────────────────────────────────────────────────────────────────
  /** What a feature's click handler gets (src/features/types.ts). */
  const ctxFor = (t: Target): ActionCtx => ({
    object: t.object,
    spot: t.spot,
    hit: t.hit,
    scene,
    camera,
    animate: o.animate,
    relight: o.relight,
    sfx: (cue, at, volume) => sfx(cue, at, volume),
    music: o.music,
    sitDownAndRun: o.sitDownAndRun,
    motions: { hop: (x, h, ms) => hop(x, h, ms), bounce, spin, wiggle: (x, a) => wiggle(x, a), swing, flip },
    once,
    lamp: { on: () => lampOn, set: setLamp },
    time: o.time,
    setTime: o.setTime,
    desk: o.desk,
    leave: () => void leave(),
  });

  function click(t: Target) {
    const { object, spot } = t;
    if (busy) return;
    const action = featureActions[spot.kind];
    if (action) {
      void action(ctxFor(t));
      return;
    }
    switch (spot.kind) {
      case "disk":
        void load(object, spot.command ?? "projects");
        return;
      case "phone":
        sfx("phoneUp", object);
        void once(object, async () => {
          leave();
          const handset = object.getObjectByName("handset");
          if (handset) {
            const y = handset.position.y;
            const tilt = handset.rotation.x;
            await o.animate(420, (t) => {
              handset.position.y = y + 0.18 * easeOut(t);
              handset.rotation.x = tilt - 0.35 * easeOut(t);
            });
            // back in the cradle while you're in the screen
            void o.sitDownAndRun("contact").then(() => {
              handset.position.y = y;
              handset.rotation.x = tilt;
              sfx("phoneDown", object);
            });
            return;
          }
          await wiggle(object, 0.06);
          await o.sitDownAndRun("contact");
        });
        return;
      case "time":
        sfx("lidClose", object); // the blinds
        o.setTime(o.time() === "dusk" ? "night" : "dusk");
        return;
      case "mug":
        sfx("slosh", object);
        void once(object, () => nudgeMug(object));
        return;
      case "paper":
        sfx("paper", object);
        void once(object, async () => {
          leave();
          if (object.getWorldPosition(new Vector3()).y > 0.1) {
            const z0 = object.rotation.z;
            await o.animate(260, (t) => (object.rotation.z = z0 + 0.04 * wobble(t, 2, 3.5)));
            object.rotation.z = z0;
          } else {
            await hop(object, 0.012, 260);
          }
          await o.sitDownAndRun(spot.command ?? "projects");
        });
        return;
      case "crt":
        sfx("switch", object);
        void once(object, async () => {
          leave();
          await wiggle(object, 0.03);
          await o.sitDownAndRun(spot.command ?? "neofetch");
        });
        return;
      case "answering":
        sfx("click", object);
        void once(object, async () => {
          leave();
          await hop(object, 0.01, 260);
          await o.sitDownAndRun("email");
        });
        return;
      case "headphones": {
        const now = o.muted();
        if (now === null) return;
        o.setMuted(!now);
        if (now) sfx("tapeButton", object);
        void once(object, () => hop(object, 0.015, 380));
        return;
      }
      case "lamp":
        sfx(lampOn ? "switch" : "lampOn", object);
        setLamp(!lampOn);
        return;
      case "tape": {
        const walkman = findWalkman();
        if (!walkman) return;
        void once(object, () => (tapeIn ? ejectTape(object) : insertTape(object, walkman)));
        return;
      }
      case "walkman":
        if (!tapeIn) {
          sfx("tap", object);
          void once(object, () => hop(object, 0.012, 360));
          return;
        }
        sfx("tapeButton", object);
        playing = !playing;
        o.music(playing);
        return;
      case "flash":
        void once(object, () => camera35(object));
        return;
      case "twist":
        sfx("click", object);
        void once(object, () => twist(object));
        return;
    }
    const motions: Record<string, (x: Object3D) => Promise<unknown>> = { spin, hop: (x) => hop(x), bounce, wiggle: (x) => wiggle(x), swing, flip };
    const motion = motions[spot.kind];
    if (!motion) return;
    sfx(spot.kind === "spin" ? "spin" : spot.kind === "hop" || spot.kind === "bounce" || spot.kind === "flip" ? "tap" : "paper", object);
    void once(object, () => motion(object) as Promise<void>);
  }

  function findWalkman(): Object3D | null {
    let found: Object3D | null = null;
    scene.traverse((x) => {
      if ((x.userData.hotspot as Hotspot | undefined)?.kind === "walkman") found = x;
    });
    return found;
  }

  /** A click on `object` as if the visitor had made it (the terminal driving the desk). */
  function activate(object: Object3D): boolean {
    let p: Object3D | null = object;
    while (p) {
      const spot = spotOf(p);
      if (!spot) {
        p = p.parent;
        continue;
      }
      const target: Object3D = p;
      const point = target.getWorldPosition(new Vector3());
      click({ object: target, spot, hit: { distance: point.distanceTo(camera.position), point, object: target } as Intersection });
      return true;
    }
    return false;
  }

  return { pick, hover, say, leave, click, activate, setTargets, warm: steamMug, get busy() {
    return busy;
  } };
}
