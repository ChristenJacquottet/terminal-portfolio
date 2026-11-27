// The strip is a latching rocker. Only the locator by its switch has independent power.
import type { Object3D } from "three";
import { bus } from "../bus";
import { mains, powerOn, pvmTube } from "./consequences-lab";
import type { DeskApi, Feature } from "./types";

async function switchPower(desk: DeskApi, strip: Object3D, sfx: (cue: string, at: Object3D) => void) {
  if (mains.busy) return;
  mains.busy = true;
  try {
    const on = desk.stripOff();
    const rocker = strip.getObjectByName("strip-rocker");
    const from = rocker?.rotation.z ?? 0;
    const to = on ? 0 : 0.38;
    sfx("rocker", strip);
    if (rocker) await desk.animate(90, (t) => { rocker.rotation.z = from + (to - from) * t; });
    if (on) {
      desk.setStripPower(true);
      await powerOn(desk, { reboot: true });
    } else {
      mains.cut();
      sfx("powerDown", strip);
      const tube = pvmTube(desk);
      if (tube) {
        await desk.animate(260, (t) => {
          if (t < 0.55) tube.set(1, 1 - 0.99 * (t / 0.55) ** 0.7, 1 + 1.6 * t);
          else tube.set(1 - (t - 0.55) / 0.45, 0.01, 2 - (t - 0.55) * 2);
        });
        tube.set(0, 0, 0);
      }
      desk.setStripPower(false);
    }
  } finally {
    mains.busy = false;
  }
}

let stripOff = () => false;

const power: Feature = {
  name: "consequences-power",
  hotspots: { powerstrip: { kind: "powerstrip", label: "power strip", hint: "switch power off" } },
  actions: {
    async powerstrip({ object, desk, sfx, leave }) {
      const d = desk();
      if (!d) return;
      leave();
      await switchPower(d, object, sfx);
    },
  },
  label(object) {
    if (object.name !== "powerstrip") return null;
    return ["power strip", mains.busy ? "switching…" : stripOff() ? "switch power on" : "switch power off"];
  },
  onDesk(desk) {
    stripOff = desk.stripOff;
    bus.on("power:cut", async () => {
      const strip = desk.props.get("powerstrip");
      if (!strip || desk.stripOff()) return;
      if (desk.seated()) await desk.stepBack();
      if (!desk.stripOff()) await switchPower(desk, strip, (cue) => desk.sound?.play(cue));
    });
  },
};

export default power;
