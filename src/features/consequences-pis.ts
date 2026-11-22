// The Pi cluster: click it to run the build. Its activity lights chase up and down the stack in a
// wave while the four nodes work, the switch's Pi port flickers, and after a few seconds the PVM's
// footer says "build passing".
import { Vector3, type Mesh, type Object3D } from "three";
import { ledCluster } from "../lab";
import { footer, labLeds, mains } from "./consequences-lab";
import type { DeskApi, Feature } from "./types";

const RUN_MS = 3600;
let building = false;
let passedAt = 0;
let clearing = 0;
let build = 41;
let cut = false; // the power went while it was building

async function run(desk: DeskApi, pis: Object3D, sfx: (cue: string, at?: Object3D, volume?: number) => void) {
  if (building || mains.busy) return;
  const leds = labLeds(desk).pis[0];
  if (!leds) return;
  building = true;
  clearTimeout(clearing);
  build++;
  cut = false;
  const port = labLeds(desk).switch[0]; // LED 6: the Pis' port activity
  const boards = leds.count / 2;
  footer(desk, "pis", `build #${build} · running`);
  let dots = 0;
  try {
    await desk.animate(RUN_MS, (t) => {
      if (cut) return;
      // a wave up the stack and back, a little faster as it goes
      const phase = t * 5.5 + t * t * 2;
      for (let b = 0; b < boards; b++) {
        const along = b / (boards - 1);
        const k = Math.max(0, Math.cos((phase - along * 0.8) * Math.PI * 2)) ** 3;
        leds.set(b * 2 + 1, 0.08 + 0.92 * k);
      }
      port?.set(6, Math.random() < 0.5 ? 1 : 0.15);
      const d = Math.floor(t * 9) % 4;
      if (d !== dots) {
        dots = d;
        footer(desk, "pis", `build #${build} · running${".".repeat(d)}`);
      }
    });
    if (cut) {
      footer(desk, "pis", `build #${build} · power lost`);
    } else {
      // all four agree: two blinks together, then steady
      sfx("relay", pis, 0.5);
      await desk.animate(600, (t) => {
        const on = Math.floor(t * 4) % 2 === 0;
        for (let b = 0; b < boards; b++) leds.set(b * 2 + 1, on ? 1 : 0.1);
      });
      footer(desk, "pis", `build #${build} · passing`);
      passedAt = performance.now();
    }
  } finally {
    for (let b = 0; b < boards; b++) leds.set(b * 2 + 1, 1);
    port?.set(6, 1);
    desk.request();
    building = false;
    clearTimeout(clearing);
    clearing = window.setTimeout(() => footer(desk, "pis", null), 7000);
  }
}

const pis: Feature = {
  name: "consequences-pis",
  hotspots: { picluster: { kind: "picluster", label: "Pi cluster", hint: "run the build" } },
  actions: {
    picluster({ object, desk, sfx }) {
      const d = desk();
      if (!d) return;
      sfx("click", object);
      void run(d, object, sfx);
    },
  },
  label(object) {
    if (object.name !== "picluster") return null;
    if (building) return ["Pi cluster", "building…"];
    if (passedAt && performance.now() - passedAt < 60000) return ["Pi cluster", "build passing"];
    return null;
  },
  // The Pis' lights face straight up in lab.ts, so from the room they're edge-on. Re-seat them on
  // the boards' front edges, tipped towards you, so the chase reads from the desk.
  props({ props }) {
    const holder = props.get("picluster");
    const stack = holder?.children[0];
    if (!stack) return;
    const old = stack.children.filter((c) => (c as Mesh).isMesh && (c as Mesh).geometry.getAttribute("color"));
    if (!old.length) return;
    const W = 0.085, D = 0.056, T = 0.0016, PITCH = 0.0155;
    const face = new Vector3(0, 0.55, 1);
    const leds: Parameters<typeof ledCluster>[0] = [];
    for (let i = 0; i < 4; i++) {
      const y = 0.004 + i * PITCH + T / 2 + 0.0011;
      leds.push(
        { p: new Vector3(-W / 2 + 0.005, y, D / 2 - 0.0012), hex: "#ff4a3a", size: 0.0034, dir: face },
        { p: new Vector3(-W / 2 + 0.0105, y, D / 2 - 0.0012), hex: "#52d974", act: true, size: 0.0034, dir: face },
      );
    }
    for (const o of old) o.removeFromParent();
    stack.add(ledCluster(leds));
  },
  onDesk() {
    mains.onCut(() => (cut = true));
  },
};
export default pis;
