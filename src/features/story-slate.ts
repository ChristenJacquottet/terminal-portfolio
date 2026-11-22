// Directing: click the slate and its clapstick snaps shut, then the studio light on its stand by
// the window comes on, a warm key across the desk while the desk lamp dims: action. Click it
// again to cut: the clap, the key light dies away and the lamp comes back up.
import { Color, MeshStandardMaterial, SpotLight, Vector3, type Mesh, type Object3D } from "three";
import type { DeskApi, Feature } from "./types";
import { easeOut, refreshChip, settle } from "./story-kit";

/** The clapstick's hinge angle (about its x) shut, and how far it lifts before it snaps (checked by eye). */
const SHUT = 0;
const LIFT = 0.62;
const KEY_ON = 30; // the key at full: a 650 W fresnel two metres away
const LAMP_DIM = 0.3;

let key: SpotLight | null = null;
let rolling = false;
let take = 0;
let desk: DeskApi | null = null;
/** The studio light's lens, and its glow at rest. */
let lens: { m: MeshStandardMaterial; was: number; colour: Color } | null = null;

/** The clapstick's hinge (built with keepHierarchy: the arm is under an empty named Empty.001_4). */
function armOf(slate: Object3D): Object3D | null {
  let arm: Object3D | null = null;
  slate.traverse((o) => {
    if (!arm && /^Empty\.?001_4$/.test(o.name)) arm = o;
  });
  return arm;
}

/** The desk lamp at `k` of full, the way interact.ts dims it: cone, spill and bulb together. */
function lampAt(lamp: SpotLight, k: number) {
  lamp.intensity = ((lamp.userData.on as number | undefined) ?? 2.6) * k;
  const spill = lamp.userData.spill as { intensity: number } | undefined;
  if (spill) spill.intensity = 0.35 * k;
  const bulb = lamp.userData.bulb as MeshStandardMaterial | undefined;
  if (bulb) bulb.emissiveIntensity = 2.5 * k;
}

const slate: Feature = {
  name: "story-slate",
  hotspots: {
    clapper: { kind: "slate", label: "the slate", hint: "directing · roll it" },
    studiolight: { kind: "keylight", label: "studio light", hint: "shooting · the slate starts it" },
  },
  label(_object, spot) {
    if (spot.kind === "slate") return ["the slate", rolling ? `take ${take} · rolling · cut` : "directing · action"];
    if (spot.kind === "keylight") return ["studio light", rolling ? `take ${take} · rolling · cut` : "shooting · the slate starts it"];
    return null;
  },
  props({ scene, props }) {
    // Made now, at 0, so the number of lights never changes: aimed from the stand's head at the desk.
    key = new SpotLight("#ffcf9a", 0, 0, 0.42, 0.75, 2);
    key.castShadow = false;
    key.name = "story:key";
    const stand = props.get("studiolight");
    if (stand) {
      stand.updateMatrixWorld(true);
      // the head: the top of the stand
      let top: Vector3 | null = null;
      stand.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || !m.geometry) return;
        const mat = m.material as MeshStandardMaterial;
        if (mat?.emissiveMap || (mat?.emissive && mat.emissive.getHex() !== 0)) lens ??= { m: mat, was: mat.emissiveIntensity, colour: mat.emissive.clone() };
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
        const c = b.getCenter(new Vector3());
        c.y = b.max.y - (b.max.y - b.min.y) * 0.12;
        if (!top || c.y > top.y) top = c;
      });
      key.position.copy(top ?? new Vector3(-2, 0.8, 0));
    } else {
      key.position.set(-1.9, 0.9, -0.2);
    }
    key.target.position.set(0.05, 0, 0.1);
    scene.add(key, key.target);
  },
  onDesk(d) {
    desk = d;
  },
  actions: {
    async slate({ object, sfx, once, animate, lamp, relight, leave }) {
      await once(object, async () => {
        leave();
        const arm = armOf(object);
        if (arm) {
          const shut = SHUT;
          const open = SHUT + LIFT;
          const from = arm.rotation.x;
          // up, a beat, and down hard
          await animate(260, (t) => (arm.rotation.x = from + (open - from) * easeOut(t)));
          await animate(90, () => {});
          await animate(70, (t) => (arm.rotation.x = open + (shut - open) * t * t));
          sfx("clapper", object);
          await animate(160, (t) => (arm.rotation.x = shut + 0.035 * Math.sin(t * Math.PI) * (1 - t)));
          arm.rotation.x = shut;
        } else {
          sfx("clapper", object);
          await animate(200, () => {});
        }
        rolling = !rolling;
        if (rolling) take++;
        await (rolling ? action(animate, lamp.on, relight) : cut(animate, lamp.on, relight));
      });
      refreshChip();
    },
    async keylight({ object, sfx, motions, once }) {
      // the stand on its own: a nudge, and the slate is what rolls
      sfx("tap", object, 0.6);
      await once(object, () => motions.wiggle(object, 0.03));
    },
  },
};

async function action(animate: DeskApi["animate"], lampOn: () => boolean, relight: () => void) {
  const d = desk;
  if (!key || !d) return;
  d.sound?.play("keyLightOn", { pan: -0.7 });
  d.caption(`take ${take} · action`);
  const lamp = d.lights.lamp;
  const was = lampOn() ? 1 : 0;
  // the ballast strikes: a flicker, then it swells to full as the lamp drops
  await animate(900, (t) => {
    const strike = t < 0.18 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 70)) : 1;
    key!.intensity = KEY_ON * Math.min(1.04, settle(t) * 1.04) * strike;
    if (lens) {
      lens.m.emissive.copy(lens.colour).lerp(new Color("#ffd9a6"), easeOut(t));
      lens.m.emissiveIntensity = lens.was * (1 + 3.5 * easeOut(t));
    }
    if (was) lampAt(lamp, 1 - (1 - LAMP_DIM) * easeOut(t));
  });
  key.intensity = KEY_ON;
  relight();
}

async function cut(animate: DeskApi["animate"], lampOn: () => boolean, relight: () => void) {
  const d = desk;
  if (!key || !d) return;
  d.sound?.play("keyLightOff", { pan: -0.7 });
  d.caption("cut");
  const lamp = d.lights.lamp;
  const on = lampOn();
  const from = key.intensity;
  const lampFrom = lamp.intensity / ((lamp.userData.on as number | undefined) ?? 2.6);
  await animate(700, (t) => {
    key!.intensity = from * (1 - t) ** 2;
    if (lens) {
      lens.m.emissive.copy(lens.colour);
      lens.m.emissiveIntensity = lens.was * (1 + 3.5 * (1 - t) ** 2);
    }
    if (on) lampAt(lamp, lampFrom + (1 - lampFrom) * easeOut(t));
  });
  key.intensity = 0;
  if (lens) lens.m.emissiveIntensity = lens.was;
  if (on) lampAt(lamp, 1);
  relight();
  window.setTimeout(() => {
    if (!rolling) d.caption(null);
  }, 1400);
}

export default slate;
