// The NAS on the rack: click it and a backup runs for about six seconds. Its disks chatter, the
// switch's NAS port flickers, and the PVM's footer counts it up: "backup 12%… 100% · ok". Cut the
// power in the middle and the footer says so.
import { Box3, Vector3, type Mesh, type Object3D } from "three";
import { ledCluster } from "../lab";
import { footer, labLeds, ledsIn, mains } from "./consequences-lab";
import type { DeskApi, Feature } from "./types";

const RUN_MS = 6000;
let progress = -1; // -1 idle, else 0..1
let doneAt = 0;
let clearing = 0;
let aborted = false;

/** A backup isn't linear: quick through small files, a stall on a big one, a dash at the end. */
const curve = (t: number) => Math.min(1, t < 0.35 ? t * 1.3 : t < 0.6 ? 0.455 + (t - 0.35) * 0.35 : 0.5425 + (t - 0.6) * 1.15);

async function backup(desk: DeskApi, nas: Object3D, sfx: (cue: string, at?: Object3D, volume?: number) => void) {
  if (progress >= 0 || mains.busy) return;
  progress = 0;
  aborted = false;
  clearTimeout(clearing);
  const port = labLeds(desk).switch[0]; // LED 4: the NAS port's activity light
  const own = ledsIn(nas)[0]; // its status light (0) and disk light (1)
  let shown = -1;
  let chatter = 0;
  const start = performance.now();
  footer(desk, "nas", "backup 0%");
  await desk.animate(RUN_MS, (t) => {
    if (aborted) return;
    progress = curve(t);
    const pct = Math.floor(progress * 100);
    if (pct !== shown && (pct - shown >= 3 || pct === 100)) {
      shown = pct;
      footer(desk, "nas", `backup ${pct}%${pct < 100 ? "…" : ""}`);
    }
    const ms = performance.now() - start;
    if (ms > chatter) {
      sfx("diskChatter", nas, 0.9);
      chatter = ms + 520 + Math.random() * 380;
    }
    port?.set(4, Math.random() < 0.6 ? 1 : 0.15);
    own?.set(1, Math.random() < 0.55 ? 1 : 0.05);
  });
  port?.set(4, 1);
  own?.set(1, 0.05);
  progress = -1;
  if (aborted) {
    footer(desk, "nas", "backup failed · power");
  } else {
    footer(desk, "nas", "backup 100% · ok");
    const pvm = desk.pvm();
    const meter = pvm?.state.meters.find((m) => m[0] === "nas");
    if (meter && pvm) {
      meter[1] = Math.min(0.97, meter[1] + 0.01); // a little fuller
      pvm.repaint();
    }
  }
  doneAt = performance.now();
  clearTimeout(clearing);
  clearing = window.setTimeout(() => footer(desk, "nas", null), 6000);
}

const nas: Feature = {
  name: "consequences-nas",
  hotspots: { nas: { kind: "nas", label: "the NAS", hint: "run a backup" } },
  actions: {
    nas({ object, desk, sfx, motions, once }) {
      const d = desk();
      if (!d) return;
      sfx("click", object);
      void once(object, () => motions.wiggle(object, 0.02));
      void backup(d, object, sfx);
    },
  },
  label(object) {
    if (object.name !== "nas") return null;
    if (progress >= 0) return ["the NAS", `backing up · ${Math.floor(progress * 100)}%`];
    if (doneAt && performance.now() - doneAt < 60000) return ["the NAS", "backed up just now"];
    return null;
  },
  // The QNAP model has no lights: a status LED and a disk LED on its front, by the top left.
  props({ props }) {
    const holder = props.get("nas");
    if (!holder) return;
    holder.updateMatrixWorld(true);
    const inv = holder.matrixWorld.clone().invert();
    const box = new Box3();
    const v = new Vector3();
    holder.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || !/cube/i.test(m.name)) return;
      const pos = m.geometry.getAttribute("position");
      const to = inv.clone().multiply(m.matrixWorld);
      for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(to));
    });
    if (box.isEmpty()) return;
    const w = box.max.x - box.min.x, h = box.max.y - box.min.y;
    const x = box.min.x + w * 0.09, y = box.max.y - h * 0.1, z = box.max.z + 0.0008;
    const front = new Vector3(0, 0, 1);
    const leds = ledCluster([
      { p: new Vector3(x, y, z), hex: "#5ce87e", size: 0.006, dir: front },
      { p: new Vector3(x, y - 0.012, z), hex: "#ffb845", size: 0.006, dir: front },
    ]);
    holder.add(leds);
    ledsIn(holder)[0]?.set(1, 0.05); // the disks are idle
  },
  onDesk() {
    mains.onCut(() => {
      if (progress >= 0) aborted = true;
    });
  },
};
export default nas;
