// The soldering station on the rack: click it to switch it on. Its LED lights, the tip heats to an
// orange glow over a second, it sizzles once, and a thin wisp of flux smoke rises off it (now and
// then, while it's hot: the scene only draws while the smoke moves). Click again, or cut the power,
// and it cools. It sleeps by itself after two minutes, the way real stations do.
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type CylinderGeometry,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import { wispTexture } from "../mug";
import { labLeds, mains } from "./consequences-lab";
import type { DeskApi, Feature } from "./types";

type Iron = {
  tip: Mesh;
  mat: MeshStandardMaterial;
  glow: Mesh;
  wisps: Mesh[];
  led: (on: boolean) => void;
};

let iron: Iron | null = null;
let heat = 0; // 0 cold .. 1 at temperature
let on = false;
let sleepTimer = 0;
let puffTimer = 0;
let smokeUntil = 0;
let smoking = false;

function glowMap() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function build(desk: DeskApi): Iron | null {
  const station = desk.props.get("soldering");
  if (!station) return null;
  let tip: Mesh | null = null;
  station.traverse((o) => {
    const m = o as Mesh;
    if (!tip && m.isMesh && (m.geometry as CylinderGeometry).parameters?.radiusTop === 0.0005) tip = m;
  });
  if (!tip) return null;
  const t = tip as Mesh;
  const mat = t.material as MeshStandardMaterial;
  mat.emissive = new Color("#ff5a14");
  mat.emissiveIntensity = 0;
  const parent = t.parent!;
  // the business end of the tip, in the station's space
  const end = t.position.clone().add(new Vector3(-0.005, -0.0002, 0));
  const glow = new Mesh(new PlaneGeometry(0.016, 0.016), new MeshBasicMaterial({ map: glowMap(), color: "#ff7a2a", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.copy(end);
  glow.visible = false;
  glow.raycast = () => {};
  glow.renderOrder = 3;
  const map = wispTexture();
  const wisps = Array.from({ length: 2 }, (_, i) => {
    const w = new Mesh(new PlaneGeometry(0.018, 0.06), new MeshBasicMaterial({ map, color: "#d8d2c8", transparent: true, opacity: 0, depthWrite: false }));
    w.userData.phase = i / 2;
    w.visible = false;
    w.raycast = () => {};
    return w;
  });
  parent.add(glow, ...wisps);
  const leds = labLeds(desk).iron;
  const led = (lit: boolean) => leds.forEach((l) => l.all(lit ? 1 : 0));
  led(false); // it's off: the tip's cold
  return { tip: t, mat, glow, wisps, led };
}

function setHeat(i: Iron, h: number) {
  heat = h;
  i.mat.emissiveIntensity = 2.4 * h ** 1.4;
  i.glow.visible = h > 0.02;
  (i.glow.material as MeshBasicMaterial).opacity = 0.75 * h ** 1.6;
  i.glow.scale.setScalar(0.7 + 0.5 * h);
}

/** The wisp: two billboards rising, drifting and thinning, for as long as `smokeUntil` says. */
async function smoke(desk: DeskApi, i: Iron, ms: number) {
  smokeUntil = Math.max(smokeUntil, performance.now() + ms);
  if (smoking) return;
  smoking = true;
  const q = new Quaternion();
  const LIFE = 2.6;
  let clock = 0;
  let last = performance.now();
  try {
    while (performance.now() < smokeUntil + LIFE * 1000 * 0.5) {
      await desk.animate(400, () => {
        const now = performance.now();
        clock += Math.min(0.05, (now - last) / 1000);
        last = now;
        const fading = Math.max(0, Math.min(1, (smokeUntil - now) / 600 + 1)); // eases out at the end
        i.tip.parent!.getWorldQuaternion(q).invert().multiply(desk.camera.quaternion);
        for (const w of i.wisps) {
          const t = ((clock / LIFE + (w.userData.phase as number)) % 1 + 1) % 1;
          const a = Math.sin(t * Math.PI) ** 1.5;
          w.position.copy(i.glow.position);
          w.position.x += Math.sin(t * 6 + (w.userData.phase as number) * 7) * 0.003;
          w.position.y += 0.012 + t * 0.06;
          w.position.z += Math.cos(t * 4) * 0.002;
          w.scale.set(0.5 + t * 0.9, 0.6 + t * 0.7, 1);
          w.quaternion.copy(q);
          (w.material as MeshBasicMaterial).opacity = 0.26 * a * heat * fading;
          w.visible = heat > 0.05 && fading > 0;
        }
      });
    }
  } finally {
    for (const w of i.wisps) w.visible = false;
    smoking = false;
    desk.request();
  }
}

async function switchOn(desk: DeskApi, sfx: (cue: string, at?: Object3D, volume?: number) => void, at: Object3D) {
  const i = iron;
  if (!i || on) return;
  on = true;
  i.led(true);
  const from = heat;
  let sizzled = false;
  await desk.animate(1000 * (1 - from) + 1, (t) => {
    if (!on) return;
    setHeat(i, from + (1 - from) * (1 - (1 - t) ** 2));
    if (!sizzled && t > 0.75) {
      sizzled = true;
      sfx("sizzle", at, 0.8);
      void smoke(desk, i, 7000);
    }
  });
  if (!on) return;
  setHeat(i, 1);
  // a wisp now and then while it's hot, and it sleeps after two minutes
  clearInterval(puffTimer);
  puffTimer = window.setInterval(() => {
    if (on && !desk.seated()) void smoke(desk, i, 2500);
  }, 12000);
  clearTimeout(sleepTimer);
  sleepTimer = window.setTimeout(() => void switchOff(desk), 120000);
}

async function switchOff(desk: DeskApi) {
  const i = iron;
  if (!i || !on) return;
  on = false;
  clearInterval(puffTimer);
  clearTimeout(sleepTimer);
  i.led(false);
  smokeUntil = Math.min(smokeUntil, performance.now() + 900);
  const from = heat;
  await desk.animate(2600 * from + 1, (t) => {
    if (on) return;
    setHeat(i, from * (1 - t) ** 1.6);
  });
  if (!on) setHeat(i, 0);
  desk.request();
}

const soldering: Feature = {
  name: "consequences-soldering",
  hotspots: { soldering: { kind: "soldering", label: "soldering station", hint: "the tip's cold" } },
  actions: {
    soldering({ object, desk, sfx }) {
      const d = desk();
      if (!d || !iron) return;
      sfx("switch", object);
      if (on) void switchOff(d);
      else void switchOn(d, sfx, object);
    },
  },
  label(object) {
    if (object.name !== "soldering") return null;
    if (on) return ["soldering station", heat < 0.95 ? "heating up…" : "hot · careful"];
    return ["soldering station", heat > 0.1 ? "cooling down" : "the tip's cold"];
  },
  onDesk(desk) {
    iron = build(desk);
    mains.onCut(() => void switchOff(desk));
  },
};
export default soldering;
