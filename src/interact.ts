// Everything on the desk you can touch. Hovering shows a label and a soft rim of light; clicking
// does what the thing would do: the lamp switches, the globe spins, the camera flashes, a floppy
// goes into the Disk II and opens its project, the phone gets you in touch, the tape plays.
// Props carry their hotspot in userData.hotspot (props.ts) or get one here by name. Everything you
// can do here can also be done from the terminal; the desk is a shortcut, never the only door.
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Mesh,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Intersection,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  type PointLight,
  type Scene,
  type SpotLight,
} from "three";

type Area = { x: number; y: number; w: number; h: number; place: string };
export type Hotspot = {
  kind: string;
  label: string;
  hint?: string;
  /** Leads somewhere (a project, contact): a stronger cue than the toys. */
  nav?: boolean;
  command?: string;
  areas?: Area[];
  size?: [number, number];
};

/** The props that don't bring their own hotspot. Labels in my words; the hint says what a click does. */
const BY_NAME: Record<string, Hotspot> = {
  lamp: { kind: "lamp", label: "desk lamp" },
  phone: { kind: "phone", label: "the phone", hint: "get in touch", nav: true },
  globe: { kind: "spin", label: "the globe", hint: "give it a spin" },
  super8: { kind: "wiggle", label: "Super 8", hint: "filmmaking" },
  camera: { kind: "flash", label: "35mm camera", hint: "photography" },
  clapper: { kind: "hop", label: "the slate", hint: "directing" },
  studiolight: { kind: "wiggle", label: "studio light", hint: "shooting" },
  notebook: { kind: "wiggle", label: "graph-paper notebook", hint: "computer science" },
  card: { kind: "hop", label: "CAN YOU HEAR ME?", hint: "the call where the mic died" },
  racquet: { kind: "wiggle", label: "my wooden racquet", hint: "college tennis" },
  ball: { kind: "bounce", label: "tennis ball" },
  pennant: { kind: "swing", label: "Taylor tennis" },
  frame: { kind: "swing", label: "Réunion's peaks", hint: "where I was born" },
  diploma: { kind: "swing", label: "the baccalauréat" },
  mortarboard: { kind: "hop", label: "grad cap", hint: "Taylor University" },
  longhorn: { kind: "wiggle", label: "longhorn skull", hint: "DFW" },
  rugby: { kind: "bounce", label: "rugby ball" },
  skateboard: { kind: "wiggle", label: "a skateboard I built", hint: "I built them for friends" },
  bitcoin: { kind: "flip", label: "my first bitcoin", hint: "flip it" },
  biplane: { kind: "wiggle", label: "toy plane" },
  suitcase: { kind: "hop", label: "the suitcase", hint: "always moving" },
  pixelart: { kind: "swing", label: "pixel portrait", hint: "collecting digital art" },
  mug: { kind: "wiggle", label: "the mug", hint: "still warm" },
  cube: { kind: "hop", label: "Rubik's cube" },
  duck: { kind: "hop", label: "rubber duck", hint: "for debugging" },
  spectacles: { kind: "wiggle", label: "my glasses" },
  pens: { kind: "wiggle", label: "pen cup" },
  clock: { kind: "swing", label: "the clock", hint: "it's late" },
  plant: { kind: "wiggle", label: "the plant" },
  chair: { kind: "wiggle", label: "my chair" },
};

/** Where each postcard's place sits in my story; the rest just say "home, once". */
const PLACES: Record<string, string> = { "LA RÉUNION": "where I was born", INDIANA: "college", DALLAS: "home now" };

/** The Disk II: the middle of its slot, the way out of it, a disk's pose inside it, and its IN USE light. */
export type Drive = { slot: Vector3; out: Vector3; quaternion: Quaternion; led: Mesh };

export type Target = { object: Object3D; spot: Hotspot; hit: Intersection };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** A damped wobble: starts at 0, rings `freq` times a second-ish, dies away. */
const wobble = (t: number, freq: number, decay: number) => Math.sin(t * Math.PI * 2 * freq) * Math.exp(-decay * t);

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
  sfx: (cue: string) => void;
  music: (on: boolean) => void;
}) {
  const { scene, camera } = o;
  const targets: Object3D[] = [];
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
  const highlight = (object: Object3D | null, strength: number) => {
    if (object !== lit) {
      for (const s of shells.splice(0)) s.removeFromParent();
      lit = object;
      object?.traverseVisible((m) => {
        const mesh = m as Mesh;
        if (!mesh.isMesh || mesh.material === rim || !(mesh.geometry as BufferGeometry).getAttribute("normal")) return;
        const shell = new Mesh(mesh.geometry, rim);
        shell.raycast = () => {};
        shell.renderOrder = 2;
        mesh.add(shell);
        shells.push(shell);
      });
    }
    rim.uniforms.uStrength.value = object ? strength : 0;
  };

  // ── finding what's under the pointer ──────────────────────────────────────────────
  const spotOf = (object: Object3D): Hotspot | undefined => (object.userData.hotspot as Hotspot | undefined) ?? (object.name ? BY_NAME[object.name] : undefined);
  const shown = (object: Object3D) => {
    for (let p: Object3D | null = object; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  /** The props (and anything that might stand in front of them, like the computer). */
  const occluders: Object3D[] = [];
  function setTargets(props: Iterable<Object3D>, blockers: Object3D[]) {
    targets.length = 0;
    targets.push(...props);
    occluders.length = 0;
    occluders.push(...blockers);
  }

  function pick(e: PointerEvent, width: number, height: number): Target | null {
    pointer.set((e.clientX / width) * 2 - 1, -(e.clientY / height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...targets, ...occluders], true).find((h) => shown(h.object) && (h.object as Mesh).material !== rim);
    if (!hit) return null;
    for (let p: Object3D | null = hit.object; p; p = p.parent) {
      const spot = spotOf(p);
      if (spot) return { object: p, spot, hit };
      if (occluders.includes(p)) return null;
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
    if (spot.kind === "lamp") return [spot.label, lampOn ? "switch it off" : "switch it on"];
    if (spot.kind === "walkman") return [spot.label, tapeIn ? (playing ? "pause" : "play") : "no tape in it"];
    if (spot.kind === "tape") return [spot.label, tapeIn ? "take it out" : spot.hint];
    if (spot.kind === "disk" && t.object === inDrive) return [spot.label, "it's in the drive: open it"];
    if (spot.kind === "places" && spot.areas && spot.size && t.hit.uv) {
      const [w, h] = spot.size;
      const x = t.hit.uv.x * w;
      const y = (1 - t.hit.uv.y) * h;
      const card = spot.areas.find((a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h);
      if (card) return [card.place, PLACES[card.place] ?? "home, once"];
    }
    return [spot.label, spot.hint];
  };

  function hover(t: Target | null, e: PointerEvent) {
    if (!t || busy) {
      chip.hidden = true;
      highlight(null, 0);
      return;
    }
    const [label, hint] = labelFor(t);
    showChip(t.spot, label, hint, e);
    highlight(t.object, t.spot.nav ? 1 : 0.65);
  }

  function leave() {
    chip.hidden = true;
    highlight(null, 0);
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
  const hop = (x: Object3D, height = 0.03, ms = 520) => {
    const y = x.position.y;
    const turn = x.rotation.y;
    return o.animate(ms, (t) => {
      x.position.y = y + height * 4 * t * (1 - t);
      x.rotation.y = turn + 0.25 * wobble(t, 1.2, 3);
    }).then(() => {
      x.position.y = y;
      x.rotation.y = turn;
    });
  };
  const bounce = (x: Object3D) => {
    const y = x.position.y;
    return o.animate(1100, (t) => {
      // three bounces, each lower
      const k = t < 0.45 ? t / 0.45 : t < 0.78 ? (t - 0.45) / 0.33 : (t - 0.78) / 0.22;
      const h = t < 0.45 ? 0.06 : t < 0.78 ? 0.025 : 0.008;
      x.position.y = y + h * 4 * k * (1 - k);
    }).then(() => (x.position.y = y));
  };
  const spin = (x: Object3D) => {
    const turn = x.rotation.y;
    return o.animate(1600, (t) => (x.rotation.y = turn + easeOut(t) * Math.PI * 2)).then(() => (x.rotation.y = turn));
  };
  const wiggle = (x: Object3D, amount = 0.08) => {
    const turn = x.rotation.y;
    return o.animate(700, (t) => (x.rotation.y = turn + amount * wobble(t, 2.5, 4))).then(() => (x.rotation.y = turn));
  };
  const swing = (x: Object3D) => {
    const tilt = x.rotation.z;
    return o.animate(1400, (t) => (x.rotation.z = tilt + 0.05 * wobble(t, 1.6, 3.2))).then(() => (x.rotation.z = tilt));
  };
  const flip = (x: Object3D) => {
    const y = x.position.y;
    const roll = x.rotation.x;
    return o.animate(800, (t) => {
      x.position.y = y + 0.09 * 4 * t * (1 - t);
      x.rotation.x = roll + t * Math.PI * 4;
    }).then(() => {
      x.position.y = y;
      x.rotation.x = roll;
    });
  };

  function setLamp(on: boolean) {
    lampOn = on;
    const { lamp } = o;
    lamp.intensity = on ? ((lamp.userData.on as number | undefined) ?? 2.6) : 0;
    const spill = lamp.userData.spill as PointLight | undefined;
    if (spill) spill.intensity = on ? 0.35 : 0;
    const bulb = lamp.userData.bulb as MeshStandardMaterial | undefined;
    if (bulb) bulb.emissiveIntensity = on ? 2.5 : 0;
    o.relight();
  }

  async function camera35(x: Object3D) {
    o.sfx("shutter");
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
    o.sfx("diskEject");
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
        o.sfx("click");
        const lifted = worldPose(disk);
        lifted.position.y += 0.1;
        await flyTo(disk, lifted, 260, 0);
        const outside = drive.slot.clone().addScaledVector(drive.out, 0.15);
        await flyTo(disk, { position: outside, quaternion: drive.quaternion, scale: lifted.scale }, 750, 0.06);
        o.sfx("diskInsert");
        await slide(disk, drive, 1, 0);
        inDrive = disk;
        drive.led.visible = true;
        o.sfx("diskRead");
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
    o.sfx("tapeInsert");
    tapeIn = true;
    playing = true;
    o.music(true);
  }
  async function ejectTape(tape: Object3D) {
    if (!tapeHome) return;
    o.music(false);
    playing = false;
    o.sfx("lidOpen");
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

  // ── clicks ─────────────────────────────────────────────────────────────────────────
  function click(t: Target) {
    const { object, spot } = t;
    if (busy) return;
    switch (spot.kind) {
      case "disk":
        void load(object, spot.command ?? "projects");
        return;
      case "phone":
        o.sfx("phoneUp");
        void once(object, async () => {
          leave();
          await wiggle(object, 0.06);
          await o.sitDownAndRun("contact");
        });
        return;
      case "lamp":
        o.sfx("switch");
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
          o.sfx("tap");
          void once(object, () => hop(object, 0.012, 360));
          return;
        }
        o.sfx("tapeButton");
        playing = !playing;
        o.music(playing);
        return;
      case "places":
        o.sfx("paper");
        return;
      case "flash":
        void once(object, () => camera35(object));
        return;
    }
    const motions: Record<string, (x: Object3D) => Promise<unknown>> = { spin, hop: (x) => hop(x), bounce, wiggle: (x) => wiggle(x), swing, flip };
    const motion = motions[spot.kind];
    if (!motion) return;
    o.sfx(spot.kind === "spin" ? "spin" : spot.kind === "hop" || spot.kind === "bounce" || spot.kind === "flip" ? "tap" : "paper");
    void once(object, () => motion(object) as Promise<void>);
  }

  function findWalkman(): Object3D | null {
    let found: Object3D | null = null;
    scene.traverse((x) => {
      if ((x.userData.hotspot as Hotspot | undefined)?.kind === "walkman") found = x;
    });
    return found;
  }

  return { pick, hover, leave, click, setTargets, get busy() {
    return busy;
  } };
}
