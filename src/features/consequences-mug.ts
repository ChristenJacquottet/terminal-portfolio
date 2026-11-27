// The mug, as a cup of coffee you can drink. Each click is a sip: the cup lifts and tips towards
// you, the coffee drops (the surface and crema line go down together and
// the inside of the cup shows), a slurp, and it's set back down with a slosh. Three sips and it's
// empty: no steam, a faint dry ring at the bottom. `coffee` (or `make coffee`) in the terminal
// pours another: you see it fill if you're looking at the desk, or find it full when you step back.
// The PVM's coffee line follows it: ok, low, empty.
import { Quaternion, Vector3, type Camera, type Mesh, type MeshBasicMaterial, type Object3D } from "three";
import { bus } from "../bus";
import type { Liquid } from "../mug";
import { service } from "./consequences-lab";
import type { DeskApi, Feature } from "./types";

const SIPS = 3;
/** How full the cup is with this many sips left: the first sip is from a brim-full cup, so a small one. */
const LEVELS = [0, 0.5, 0.9, 1];
let sips = SIPS; // sips left
let pouring = false;
let deskRef: DeskApi | null = null;
/** The `at` of the last refill already poured (bus.last tells us about the ones we missed). */
let poured: unknown = undefined;

const liquidOf = (x: Object3D): Liquid | null => {
  let found: Liquid | null = null;
  x.traverse((c) => {
    if (!found && c.userData.liquid) found = c.userData.liquid as Liquid;
  });
  return found;
};

/**
 * The contact shadows under the cup (props.ts's blob): they stay on the desk while it lifts. The
 * cup's ceramic is merged into its holder (desk.ts), so the holder is what moves.
 */
const blobsOf = (holder: Object3D): Object3D[] =>
  holder.children.filter((c) => {
    const m = c as Mesh;
    const mat = m.material as MeshBasicMaterial | undefined;
    return Boolean(m.isMesh && mat?.isMeshBasicMaterial && mat.transparent && mat.polygonOffset);
  });

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const phase = (t: number, start: number, end: number) => ease(Math.min(1, Math.max(0, (t - start) / (end - start))));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function report(desk: DeskApi | null) {
  if (!desk) return;
  if (sips >= 2) service(desk, "coffee", "ok", true);
  else if (sips === 1) service(desk, "coffee", "low", false);
  else service(desk, "coffee", "empty", false);
}

// One loop steps the coffee while anything moves (interact.ts may run its own for the steam: the
// liquid ignores a second step in the same frame).
let stepping = false;
let keepStepping = 0; // while > now, keep the loop alive (a sip in progress)
async function stepCoffee(desk: DeskApi, liquid: Liquid) {
  if (stepping) return;
  stepping = true;
  try {
    let last = performance.now();
    let alive = true;
    while (alive || performance.now() < keepStepping) {
      await desk.animate(400, () => {
        const now = performance.now();
        alive = liquid.step(Math.min(0.05, (now - last) / 1000), now, desk.camera as Camera);
        last = now;
      });
    }
  } finally {
    stepping = false;
  }
}

/** Lifts the cup and tips it towards the camera by `tip(t)` radians while `during(t)` runs. */
async function lift(desk: DeskApi, holder: Object3D, liquid: Liquid | null, ms: number, reach: (t: number) => number, tip: (t: number) => number, during?: (t: number) => void) {
  const cup = holder;
  const rest = cup.position.clone();
  const near = desk.camera.localToWorld(new Vector3(0.065, -0.085, -0.34));
  cup.parent?.worldToLocal(near);
  const q0 = cup.quaternion.clone();
  // the horizontal direction to the camera, in the cup's parent's space, and the axis to tip about
  const toCam = desk.camera.getWorldPosition(new Vector3()).sub(cup.getWorldPosition(new Vector3()));
  const parentQ = cup.parent ? cup.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  toCam.applyQuaternion(parentQ.clone().invert()).setY(0).normalize();
  const axis = new Vector3(toCam.z, 0, -toCam.x); // up × toCam: tips the rim towards you
  // the same axis in the coffee's own frame, for keeping its surface level
  let owner: Object3D = cup;
  cup.traverse((c) => {
    if (owner === cup && c.userData.liquid) owner = c;
  });
  const ownerQ = owner.getWorldQuaternion(new Quaternion());
  const local = axis.clone().applyQuaternion(parentQ).applyQuaternion(ownerQ.invert());
  const blobs = blobsOf(cup);
  const scene = desk.scene;
  for (const b of blobs) scene.attach(b);
  const q = new Quaternion();
  keepStepping = performance.now() + ms + 100;
  if (liquid) {
    liquid.hold = { x: 0, z: 0 };
    void stepCoffee(desk, liquid);
  }
  await desk.animate(ms, (t) => {
    const a = tip(t);
    const k = reach(t);
    cup.position.lerpVectors(rest, near, k);
    cup.position.y += Math.sin(k * Math.PI) * 0.055;
    cup.quaternion.copy(q.setFromAxisAngle(axis, a)).multiply(q0);
    if (liquid?.hold) {
      liquid.hold.x = a * local.x;
      liquid.hold.z = a * local.z;
    }
    during?.(t);
  });
  cup.position.copy(rest);
  cup.quaternion.copy(q0);
  cup.updateMatrixWorld(true);
  for (const b of blobs) cup.attach(b);
  if (liquid) liquid.hold = null;
}

async function sip(desk: DeskApi, cup: Object3D, sfx: (cue: string, at?: Object3D, volume?: number) => void) {
  const liquid = liquidOf(cup);
  const from = liquid?.level() ?? LEVELS[sips];
  sips = Math.max(0, sips - 1);
  const to = LEVELS[sips];
  let slurped = false;
  await lift(
    desk,
    cup,
    liquid,
    1350,
    // Pick up upright, tip once at the lips, then straighten before setting it down.
    (t) => phase(t, 0, 0.38) - phase(t, 0.66, 1),
    (t) => 0.43 * (phase(t, 0.26, 0.48) - phase(t, 0.6, 0.78)),
    (t) => {
      if (!slurped && t >= 0.48) {
        slurped = true;
        sfx("sip", cup);
      }
      if (liquid && t >= 0.48) liquid.setLevel(from + (to - from) * phase(t, 0.48, 0.66));
    },
  );
  liquid?.setLevel(to);
  // set down: the coffee that's left sloshes
  if (liquid && to > 0) {
    sfx("slosh", cup, 0.6);
    liquid.knock(0.45);
    void stepCoffee(desk, liquid);
  } else sfx("tap", cup, 0.7);
  report(desk);
}

/** An empty cup: you lift it, look in, and go make another. */
async function peek(desk: DeskApi, cup: Object3D, sfx: (cue: string, at?: Object3D, volume?: number) => void) {
  await lift(desk, cup, null, 800, (t) => 0.35 * Math.sin(t * Math.PI), (t) => 0.5 * Math.sin(t * Math.PI));
  sfx("tap", cup, 0.7);
}

async function refill(desk: DeskApi) {
  const cup = desk.props.get("mug");
  if (!cup || pouring) return;
  const liquid = liquidOf(cup);
  sips = SIPS;
  report(desk);
  if (!liquid) return;
  const from = liquid.level();
  if (from >= 0.999) return;
  pouring = true;
  try {
    desk.sound?.play("pour", { volume: 1 });
    keepStepping = performance.now() + 2000;
    void stepCoffee(desk, liquid);
    let kick = -1;
    await desk.animate(1800, (t) => {
      liquid.setLevel(from + (1 - from) * easeOut(t));
      // the stream keeps the surface moving
      if (Math.floor(t * 5) !== kick) {
        kick = Math.floor(t * 5);
        liquid.knock(0.12);
      }
    });
    liquid.setLevel(1);
    liquid.steam(9000);
    void stepCoffee(desk, liquid);
  } finally {
    pouring = false;
  }
}

/** The refill the terminal asked for while you were in the screen (or before the desk existed). */
function owed(): boolean {
  const at = bus.last("coffee:refill")?.at;
  return at !== undefined && at !== poured;
}

const HINTS = ["empty: make some more", "the last of it", "half", "still warm"];

const mug: Feature = {
  name: "consequences-mug",
  hotspots: { mug: { kind: "mug", label: "the mug", hint: "still warm" } },
  actions: {
    async mug({ object, desk, sfx, once, sitDownAndRun, leave }) {
      const d = desk();
      if (!d || pouring) return;
      leave();
      await once(object, async () => {
        if (sips > 0) {
          await sip(d, object, sfx);
        } else {
          await peek(d, object, sfx);
          await sitDownAndRun("make coffee");
        }
      });
    },
  },
  label(object) {
    if (object.name !== "mug") return null;
    return ["the mug", pouring ? "pouring…" : HINTS[sips]];
  },
  onDesk(desk) {
    deskRef = desk;
    // The mug starts full: anything poured before the desk existed is already in it.
    poured = bus.last("coffee:refill")?.at;
    report(desk);
    bus.on("coffee:refill", (p) => {
      if (!deskRef || deskRef.seated()) return; // poured when you step back (below)
      poured = p.at;
      void refill(deskRef);
    });
    // Stepping back: if the terminal made coffee meanwhile, pour it once the camera has settled.
    const host = document.getElementById("desk");
    if (host) {
      let timer = 0;
      new MutationObserver(() => {
        if (host.hidden || !owed()) return;
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (!deskRef || deskRef.seated() || !owed()) return;
          poured = bus.last("coffee:refill")?.at;
          void refill(deskRef);
        }, 2300);
      }).observe(host, { attributes: true, attributeFilter: ["hidden"] });
    }
  },
};
export default mug;
