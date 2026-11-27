// The UPS beside the network switch: click it for a simulated outage (a Dallas storm). The room
// goes dark except the UPS and the Apple II's screen, which it feeds: its relay clicks over, the LCD
// says ON BATTERY and counts, it beeps once a second; then the mains come back, the relay clicks
// again, and the lab (which wasn't on the UPS) comes back up in order. The terminal never blinks.
import type { CanvasTexture, Mesh, MeshStandardMaterial, Object3D } from "three";
import { mains, powerOn } from "./consequences-lab";
import type { DeskApi, Feature } from "./types";

const OUTAGE_MS = 5200;

type Lcd = { mesh: Mesh; mat: MeshStandardMaterial; tex: CanvasTexture; g: CanvasRenderingContext2D };

function lcdOf(ups: Object3D): Lcd | null {
  let found: Lcd | null = null;
  ups.traverse((o) => {
    const mesh = o as Mesh;
    const mat = mesh.material as MeshStandardMaterial | undefined;
    const tex = mat?.emissiveMap as CanvasTexture | null | undefined;
    const img = tex?.image as HTMLCanvasElement | undefined;
    if (!found && mesh.isMesh && img && img.width === 192 && img.height === 64 && img.getContext) {
      found = { mesh, mat: mat!, tex: tex!, g: img.getContext("2d")! };
    }
  });
  return found;
}

/** The LCD as lab.ts drew it: on mains, 100%. */
function drawLine(l: Lcd, text = "120V  0.4A") {
  const c = l.g;
  c.fillStyle = "#0b2a30";
  c.fillRect(0, 0, 192, 64);
  c.fillStyle = "#5fe0ff";
  c.font = "bold 26px 'IBM Plex Mono', monospace";
  c.fillText("100%", 10, 30);
  c.font = "13px 'IBM Plex Mono', monospace";
  c.fillText(text, 10, 54);
  for (let i = 0; i < 6; i++) c.fillRect(120 + i * 11, 44 - i * 4, 8, 12 + i * 4);
  l.tex.needsUpdate = true;
}

/** On battery: the words, the seconds counting, the charge going down a bar at a time. */
function drawBattery(l: Lcd, seconds: number, charge: number, blink: boolean) {
  const c = l.g;
  c.fillStyle = "#0b2a30";
  c.fillRect(0, 0, 192, 64);
  c.fillStyle = "#5fe0ff";
  c.font = "bold 21px 'IBM Plex Mono', monospace";
  if (blink) c.fillText("ON BATTERY", 8, 27);
  c.font = "13px 'IBM Plex Mono', monospace";
  c.fillText(`0:${String(seconds).padStart(2, "0")}  ${Math.round(charge)}%`, 10, 54);
  const bars = Math.max(1, Math.round((charge / 100) * 6));
  for (let i = 0; i < 6; i++) {
    c.globalAlpha = i < bars ? 1 : 0.18;
    c.fillRect(120 + i * 11, 44 - i * 4, 8, 12 + i * 4);
  }
  c.globalAlpha = 1;
  l.tex.needsUpdate = true;
}

let onBattery = false;

async function outage(desk: DeskApi, ups: Object3D, sfx: (cue: string, at?: Object3D) => void) {
  if (mains.busy) return;
  const lcd = lcdOf(ups);
  mains.busy = true;
  onBattery = true;
  try {
    sfx("relay", ups);
    mains.cut();
    const glow = lcd?.mat.emissiveIntensity ?? 0.9;
    if (lcd) {
      lcd.mat.emissiveIntensity = 2.4; // reads in the dark (the exposure drops)
      drawBattery(lcd, 0, 100, true);
    }
    const start = performance.now();
    let beeped = -1;
    let shown = true;
    const dark = desk.blackout(OUTAGE_MS, [ups, desk.lights.glow], { terminal: true });
    // The count and the beep, once a second, on the frames the blackout is drawing anyway; the
    // words blink off for a moment between beeps.
    await desk.animate(OUTAGE_MS - 80, () => {
      const ms = performance.now() - start;
      const sec = Math.floor(ms / 1000);
      const on = ms % 1000 < 640;
      if (sec !== beeped) {
        beeped = sec;
        sfx("upsBeep", ups);
      } else if (on === shown) return;
      shown = on;
      if (lcd) drawBattery(lcd, sec, 100 - sec * 1.6, on);
    });
    await dark;
    sfx("relay", ups);
    if (lcd) {
      lcd.mat.emissiveIntensity = glow;
      drawLine(lcd, "LINE  120V");
    }
    onBattery = false;
    await powerOn(desk, { reboot: false, skipUps: true });
    if (lcd) drawLine(lcd);
    desk.request();
  } finally {
    onBattery = false;
    mains.busy = false;
  }
}

const ups: Feature = {
  name: "consequences-ups",
  hotspots: { ups: { kind: "ups", label: "the UPS", hint: "for the Dallas storms · pull the plug" } },
  actions: {
    async ups({ object, desk, sfx, leave }) {
      const d = desk();
      if (!d) return;
      leave();
      await outage(d, object, (cue, at) => sfx(cue, at));
    },
  },
  label(object) {
    if (object.name === "ups" && onBattery) return ["the UPS", "on battery"];
    return null;
  },
};
export default ups;
