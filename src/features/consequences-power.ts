// The power strip on the floor by the rack: everything is on one switch. Click it and the rocker
// clacks, the lab winds down with a falling whine, the PVM's picture collapses to a line, and the
// room goes dark for a moment. Then the switch goes back on and the lab comes back as a sequence:
// the CRTs thunk as they degauss, the PVM opens from a line, the switch and the Pis light up one by
// one, and the Apple II, which was on the strip too, boots its terminal again behind the glass.
// The bus's `power:cut` (from the terminal) does the same.
import type { Mesh, MeshStandardMaterial, Object3D } from "three";
import { bus } from "../bus";
import { mains, powerOn, pvmTube } from "./consequences-lab";
import type { DeskApi, Feature } from "./types";

let deskRef: DeskApi | null = null;

/** The strip's red rocker (lab.ts powerStrip: the one tomato-red part). */
function rockerOf(strip: Object3D): Mesh | null {
  let found: Mesh | null = null;
  strip.traverse((o) => {
    const m = o as Mesh;
    const mat = m.material as MeshStandardMaterial | undefined;
    if (!found && m.isMesh && mat?.color && mat.color.getHexString() === "b8412c") found = m;
  });
  return found;
}

async function cut(desk: DeskApi, strip: Object3D | undefined, sfx: (cue: string, at?: Object3D) => void) {
  if (mains.busy) return;
  mains.busy = true;
  try {
    const rocker = strip ? rockerOf(strip) : null;
    const rest = rocker?.rotation.z ?? 0;
    sfx("rocker", strip);
    if (rocker) await desk.animate(90, (t) => (rocker.rotation.z = rest + 0.38 * t));
    sfx("powerDown", strip);
    mains.cut();
    // The PVM's picture collapses to a bright line, then a dot, as the lab winds down.
    const tube = pvmTube(desk);
    if (tube) {
      await desk.animate(260, (t) => {
        if (t < 0.55) tube.set(1, 1 - 0.99 * (t / 0.55) ** 0.7, 1 + 1.6 * t);
        else tube.set(1 - 0.99 * ((t - 0.55) / 0.45), 0.01, 2 - (t - 0.55) * 2);
      });
      tube.set(0, 0, 0);
    }
    await desk.blackout(1600);
    // Someone flips it back on: the rocker, then the lab, in order.
    if (rocker) rocker.rotation.z = rest;
    sfx("rocker", strip);
    await powerOn(desk, { reboot: true });
  } finally {
    mains.busy = false;
  }
}

const power: Feature = {
  name: "consequences-power",
  hotspots: { powerstrip: { kind: "powerstrip", label: "power strip", hint: "cut the power" } },
  actions: {
    async powerstrip({ object, desk, sfx, leave }) {
      const d = desk();
      if (!d) return;
      leave();
      await cut(d, object, (cue, at) => sfx(cue, at));
    },
  },
  label(object) {
    if (object.name === "powerstrip" && mains.busy) return ["power strip", "…"];
    return null;
  },
  onDesk(desk) {
    deskRef = desk;
    // The terminal can pull the plug too (`power:cut`): you step back to see it happen.
    bus.on("power:cut", () => {
      const d = deskRef;
      if (!d) return;
      void (async () => {
        if (d.seated()) await d.stepBack();
        const strip = d.props.get("powerstrip");
        await cut(d, strip, (cue) => d.sound?.play(cue));
      })();
    });
  },
};
export default power;
