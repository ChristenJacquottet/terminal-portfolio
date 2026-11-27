// More of the home lab, made in code in the palette's colours: a Raspberry Pi cluster, a UPS,
// the ethernet runs from the switch's lit ports, a soldering station, a power strip with its
// cords, a parts organiser, a spool of cat6, spare drives, and odds and ends on the pegboard.
// Everything is static geometry except the activity LEDs, which blink on the desk's heartbeat
// (see `pulses` in alive.ts).
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CurvePath,
  CylinderGeometry,
  LineCurve3,
  QuadraticBezierCurve3,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Object3D,
} from "three";
import { mergeGeos, pulses } from "./alive";
import type { Hotspot } from "./interact";

// ── palette (art/palette.json) ───────────────────────────────────────────────────────────────
const nearBlack = new MeshStandardMaterial({ color: "#1f1d1b", roughness: 0.45 });
const warmGrey = new MeshStandardMaterial({ color: "#9d968a", roughness: 0.5 });
const darkMetal = new MeshStandardMaterial({ color: "#4a4743", roughness: 0.38, metalness: 1 });
const brass = new MeshStandardMaterial({ color: "#b58b4c", roughness: 0.35, metalness: 1 });
const cream = new MeshStandardMaterial({ color: "#ece2cc", roughness: 0.6 });
const pcb = new MeshStandardMaterial({ color: "#2f6b3f", roughness: 0.55 });
const teal = new MeshStandardMaterial({ color: "#2f6f6b", roughness: 0.5 });
const mustard = new MeshStandardMaterial({ color: "#d39b32", roughness: 0.5 });
const tomato = new MeshStandardMaterial({ color: "#b8412c", roughness: 0.45 });
const steelBlue = new MeshStandardMaterial({ color: "#3f5f8c", roughness: 0.5 });
const CABLE_COLOURS = ["#3f5f8c", "#d39b32", "#b8412c", "#2f6f6b"];

const box = (w: number, h: number, d: number, mat: MeshStandardMaterial, x = 0, y = 0, z = 0) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The soft diode sprite shared by every LED here. */
let ledSprite: CanvasTexture | null = null;
function ledMap() {
  ledSprite ??= canvas(32, 32, (g) => {
    const halo = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    halo.addColorStop(0, "rgba(255,255,255,1)");
    halo.addColorStop(0.35, "rgba(255,255,255,0.85)");
    halo.addColorStop(0.7, "rgba(255,255,255,0.18)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, 32, 32);
  });
  return ledSprite;
}

/**
 * A merged mesh of LED quads (one draw). Each LED is a position, a colour and whether it is an
 * activity light; `tick` re-rolls the activity lights' brightness on the heartbeat.
 */
export function ledCluster(leds: { p: Vector3; hex: string; act?: boolean; size?: number; dir?: Vector3 }[]): Mesh {
  const quads: BufferGeometry[] = leds.map((led) => {
    const s = led.size ?? 0.0022;
    const q = new PlaneGeometry(s, s);
    if (led.dir) q.lookAt(led.dir);
    q.translate(led.p.x, led.p.y, led.p.z);
    const c = new Color(led.hex);
    const cols = new Float32Array(q.getAttribute("position").count * 3);
    for (let i = 0; i < cols.length; i += 3) cols.set([c.r, c.g, c.b], i);
    q.setAttribute("color", new Float32BufferAttribute(cols, 3));
    return q;
  });
  const geo = mergeGeos(quads);
  const mesh = new Mesh(geo, new MeshBasicMaterial({ map: ledMap(), vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.raycast = () => {};
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const colour = geo.getAttribute("color") as Float32BufferAttribute;
  const base = (colour.array as Float32Array).slice();
  const perLed = colour.count / leds.length;
  const acts = leds.map((l, i) => (l.act ? i : -1)).filter((i) => i >= 0);
  if (acts.length) {
    pulses.add(() => {
      for (const i of acts) {
        const k = Math.random() < 0.5 ? 1 : 0.12 + Math.random() * 0.3;
        for (let v = 0; v < perLed; v++) {
          const o = (i * perLed + v) * 3;
          colour.setXYZ(i * perLed + v, base[o] * k, base[o + 1] * k, base[o + 2] * k);
        }
      }
      colour.needsUpdate = true;
    });
  }
  return mesh;
}

// ── the things ────────────────────────────────────────────────────────────────────────────────

/** Four Raspberry Pis on brass standoffs, ethernet jacks out, each with its power and activity lights. */
export function piCluster(): Group {
  const g = new Group();
  const W = 0.085, D = 0.056, T = 0.0016, PITCH = 0.0155;
  const leds: Parameters<typeof ledCluster>[0] = [];
  const heatsink = new MeshStandardMaterial({ color: "#2b2b2e", roughness: 0.4, metalness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const y = 0.004 + i * PITCH;
    g.add(box(W, T, D, pcb, 0, y, 0));
    // jacks and the USB stack along the short edge, the SoC's heatsink mid-board, a header strip
    g.add(box(0.016, 0.0135, 0.0215, nearBlack, W / 2 - 0.008, y + T / 2 + 0.00675, -D / 2 + 0.014));
    g.add(box(0.0135, 0.0155, 0.017, warmGrey, W / 2 - 0.007, y + T / 2 + 0.00775, D / 2 - 0.012));
    g.add(box(0.015, 0.009, 0.015, heatsink, -0.004, y + T / 2 + 0.0045, 0.004));
    g.add(box(0.05, 0.004, 0.005, nearBlack, -0.01, y + T / 2 + 0.002, D / 2 - 0.004));
    leds.push(
      { p: new Vector3(-W / 2 + 0.006, y + T / 2 + 0.0012, D / 2 - 0.004), hex: "#ff4a3a", dir: new Vector3(0, 1, 0) },
      { p: new Vector3(-W / 2 + 0.006, y + T / 2 + 0.0012, D / 2 - 0.009), hex: "#52d974", act: true, dir: new Vector3(0, 1, 0) },
    );
  }
  for (const [x, z] of [[-W / 2 + 0.0035, -D / 2 + 0.0035], [W / 2 - 0.0035, -D / 2 + 0.0035], [-W / 2 + 0.0035, D / 2 - 0.0035], [W / 2 - 0.0035, D / 2 - 0.0035]]) {
    const post = new Mesh(new CylinderGeometry(0.0022, 0.0022, 0.004 + 3 * PITCH, 8), brass);
    post.position.set(x, (0.004 + 3 * PITCH) / 2, z);
    g.add(post);
  }
  g.add(ledCluster(leds));
  return g;
}

/** A repurposed short-depth server, with two rubber-lined laptop slots bolted to its lid. */
export function labServer(): Group {
  const g = new Group();
  g.add(box(0.255, 0.062, 0.208, darkMetal, 0, 0.036, 0));
  for (const x of [-0.112, 0.112]) {
    for (const z of [-0.088, 0.088]) g.add(box(0.018, 0.005, 0.014, nearBlack, x, 0.0025, z));
  }
  // One baked perforated grille; the bays, pull handles and ears stand proud of it.
  const panel = canvas(512, 120, (c) => {
    c.fillStyle = "#565957"; c.fillRect(0, 0, 512, 120);
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 18; col++) {
        c.fillStyle = "#1a1c1b"; c.beginPath();
        c.arc(17 + col * 9 + row % 2 * 4, 18 + row * 10, 3, 0, Math.PI * 2); c.fill();
      }
    }
    c.save(); c.translate(357, 54); c.rotate(-0.042);
    c.fillStyle = "#dbcfab"; c.fillRect(0, -13, 137, 30);
    c.fillStyle = "#292522"; c.font = "bold 19px monospace"; c.fillText("BUILD / 01", 7, 9); c.restore();
  });
  const face = new Mesh(new PlaneGeometry(0.255, 0.062), new MeshStandardMaterial({ map: panel, roughness: 0.61 }));
  face.position.set(0, 0.037, 0.105); g.add(face);
  for (const y of [0.022, 0.048]) {
    g.add(box(0.079, 0.019, 0.011, nearBlack, 0.003, y, 0.105));
    g.add(box(0.043, 0.004, 0.005, warmGrey, 0.002, y, 0.112));
  }
  g.add(ledCluster([{ p: new Vector3(0.117, 0.014, 0.106), hex: "#7ada9b", size: 0.005 }]));
  for (const centre of [-0.052, 0.048]) {
    for (const x of [centre - 0.019, centre + 0.019]) {
      g.add(box(0.011, 0.035, 0.145, nearBlack, x, 0.0845, -0.006));
    }
  }
  return g;
}

/** Two spare patch leads on a steel hook, with loose ends hanging below the coil. */
export function patchHook(): Group {
  const g = new Group();
  g.add(box(0.016, 0.033, 0.008, darkMetal, 0, 0, 0));
  g.add(box(0.009, 0.008, 0.035, steelBlue, 0, -0.005, 0.018));
  g.add(box(0.009, 0.018, 0.007, steelBlue, 0, 0, 0.033));
  const plug = new MeshStandardMaterial({ color: "#b5b1a3", roughness: 0.45 });
  for (const [j, jacket] of [teal, steelBlue].entries()) {
    const z = 0.015 + 0.01 * j;
    const points = [new Vector3(-0.021 + j * 0.005, -0.15 - j * 0.026, z)];
    for (let i = 0; i <= 32; i++) {
      const angle = i * Math.PI / 8 - Math.PI * 0.65;
      points.push(new Vector3(0.024 * Math.sin(angle) + j * 0.003,
        -0.055 + (0.056 + j * 0.001) * Math.cos(angle), z + i * 0.00018));
    }
    points.push(new Vector3(0.016 + j * 0.006, -0.112 - j * 0.021, z + 0.006));
    const wire = new CatmullRomCurve3(points);
    g.add(new Mesh(new TubeGeometry(wire, 96, 0.0019, 6), jacket));
    for (const end of [points[0], points[points.length - 1]]) {
      g.add(box(0.008, 0.012, 0.007, jacket, end.x, end.y - 0.004, end.z));
      g.add(box(0.0105, 0.013, 0.0075, plug, end.x, end.y - 0.014, end.z));
    }
  }
  return g;
}

/** A small line-interactive UPS: a black tower with a cyan LCD and a load bar. */
export function ups(): Group {
  const g = new Group();
  const W = 0.1, H = 0.165, D = 0.3;
  const body = new MeshStandardMaterial({ color: "#23211f", roughness: 0.55 });
  g.add(box(W, H, D, body, 0, H / 2, 0));
  g.add(box(W - 0.012, 0.03, 0.004, warmGrey, 0, H - 0.04, D / 2 + 0.001)); // the control bezel
  const lcd = canvas(192, 64, (c) => {
    c.fillStyle = "#0b2a30";
    c.fillRect(0, 0, 192, 64);
    c.fillStyle = "#5fe0ff";
    c.font = "bold 26px 'IBM Plex Mono', monospace";
    c.fillText("100%", 10, 30);
    c.font = "13px 'IBM Plex Mono', monospace";
    c.fillText("120V  0.4A", 10, 54);
    for (let i = 0; i < 6; i++) c.fillRect(120 + i * 11, 44 - i * 4, 8, 12 + i * 4);
  });
  const screen = new Mesh(new PlaneGeometry(0.044, 0.015), new MeshStandardMaterial({ map: lcd, emissive: "#ffffff", emissiveMap: lcd, emissiveIntensity: 0.9, roughness: 0.3 }));
  screen.position.set(-0.012, H - 0.04, D / 2 + 0.0035);
  g.add(screen);
  g.add(box(0.012, 0.008, 0.003, tomato, 0.028, H - 0.04, D / 2 + 0.0035)); // the power button
  g.add(ledCluster([{ p: new Vector3(0.028, H - 0.032, D / 2 + 0.0045), hex: "#5ce87e", size: 0.0018 }]));
  // vents down the side
  for (let i = 0; i < 9; i++) g.add(box(0.0015, 0.05, 0.004, nearBlack, W / 2 + 0.0005, H * 0.45, -D * 0.3 + i * 0.012));
  return g;
}

/** A soldering station: the base with its dial, the iron resting in its coil, a damp sponge. */
export function solderingStation(): Group {
  const g = new Group();
  g.add(box(0.1, 0.034, 0.075, new MeshStandardMaterial({ color: "#3a3a3c", roughness: 0.5 }), 0, 0.017, 0));
  const dial = new Mesh(new CylinderGeometry(0.011, 0.011, 0.006, 20), nearBlack);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(-0.03, 0.02, 0.0375);
  const marks = new Mesh(new PlaneGeometry(0.03, 0.03), new MeshStandardMaterial({ map: canvas(64, 64, (c) => {
    c.fillStyle = "#3a3a3c"; c.fillRect(0, 0, 64, 64);
    c.strokeStyle = "#ece2cc"; c.lineWidth = 2;
    for (let a = -2.4; a <= 2.4; a += 0.4) { c.beginPath(); c.moveTo(32 + Math.sin(a) * 24, 32 - Math.cos(a) * 24); c.lineTo(32 + Math.sin(a) * 29, 32 - Math.cos(a) * 29); c.stroke(); }
    c.fillStyle = "#b8412c"; c.beginPath(); c.arc(32 + Math.sin(1.2) * 27, 32 - Math.cos(1.2) * 27, 2.5, 0, Math.PI * 2); c.fill();
  }), roughness: 0.6 }));
  marks.position.set(-0.03, 0.02, 0.0378);
  g.add(dial, marks);
  g.add(box(0.012, 0.006, 0.004, tomato, 0.0, 0.02, 0.0375)); // the switch
  g.add(ledCluster([{ p: new Vector3(0.012, 0.02, 0.0385), hex: "#ff4a3a", size: 0.0016 }]));
  // The holder: a spring coil on a stalk, with the iron in it.
  const turns = 14;
  const pts = Array.from({ length: turns * 10 + 1 }, (_, i) => {
    const t = i / (turns * 10);
    const a = t * turns * Math.PI * 2;
    return new Vector3(0.028 + t * 0.07, 0.062 + Math.sin(a) * 0.011, Math.cos(a) * 0.011);
  });
  const coil = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), turns * 12, 0.0011, 6), darkMetal);
  const stalk = new Mesh(new CylinderGeometry(0.0025, 0.0025, 0.03, 8), darkMetal);
  stalk.position.set(0.035, 0.047, 0);
  const handle = new Mesh(new CylinderGeometry(0.0065, 0.0075, 0.1, 12), new MeshStandardMaterial({ color: "#1f1d1b", roughness: 0.6 }));
  handle.rotation.z = -Math.PI / 2 + 0.06;
  handle.position.set(0.08, 0.064, 0);
  const barrel = new Mesh(new CylinderGeometry(0.0028, 0.0028, 0.055, 8), darkMetal);
  barrel.rotation.z = -Math.PI / 2 + 0.06;
  barrel.position.set(0.005, 0.0595, 0);
  const tip = new Mesh(new CylinderGeometry(0.0005, 0.0022, 0.014, 6), new MeshStandardMaterial({ color: "#c9c2b6", roughness: 0.25, metalness: 1 }));
  tip.rotation.z = -Math.PI / 2 + 0.06;
  tip.position.set(-0.028, 0.0575, 0);
  const cord = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(0.13, 0.067, 0), new Vector3(0.15, 0.05, 0.02), new Vector3(0.13, 0.01, 0.05), new Vector3(0.05, 0.004, 0.06)]), 16, 0.0016, 6), nearBlack);
  g.add(coil, stalk, handle, barrel, tip, cord);
  g.add(box(0.04, 0.009, 0.03, mustard, -0.03, 0.0385, -0.016)); // the sponge, on its tray
  g.add(box(0.046, 0.004, 0.036, warmGrey, -0.03, 0.036, -0.016));
  return g;
}

/** A six-way power strip: the body, its lit switch and the sockets. Cords come from `powerCords`. */
export function powerStrip(): Group {
  const g = new Group();
  const W = 0.3, H = 0.036, D = 0.062;
  g.add(box(W, H, D, cream, 0, H / 2, 0));
  g.add(box(0.03, 0.012, 0.016, tomato, -W / 2 + 0.03, H + 0.0055, 0)); // the lit switch
  g.add(ledCluster([{ p: new Vector3(-W / 2 + 0.03, H + 0.0125, 0), hex: "#ff6a3d", size: 0.004, dir: new Vector3(0, 1, 0) }]));
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + 0.07 + i * 0.038;
    g.add(box(0.030, 0.002, 0.034, warmGrey, x, H, 0));
    for (const side of [-1, 1]) g.add(box(0.0023, 0.001, 0.009, nearBlack, x + side * 0.007, H + 0.0015, -0.003));
    g.add(box(0.0045, 0.001, 0.0045, nearBlack, x, H + 0.0015, 0.009));
  }
  return g;
}

/** Short service loops drop from the front-mounted strip, then follow the right upright to the equipment. */
export function powerCords(strip: Object3D, feeds: Vector3[]) {
  strip.updateWorldMatrix(true, false);
  const cords: BufferGeometry[] = [];
  feeds.forEach((feed, i) => {
    const x = -0.08 + i * 0.076;
    const plug = new Mesh(new CylinderGeometry(0.012, 0.012, 0.018, 12), nearBlack);
    plug.position.set(x, 0.045, 0);
    const end = strip.worldToLocal(feed.clone());
    // In strip space +y is out from the sockets and +z is down the face of the rack.
    const side = 0.175 + 0.008 * i;
    const path = new CatmullRomCurve3([
      new Vector3(x, 0.053, 0), new Vector3(x, 0.063, 0.019),
      new Vector3(x + 0.025, 0.04, 0.062 + 0.012 * i),
      new Vector3(side - 0.04, 0.01, 0.056 + 0.007 * i),
      new Vector3(side, -0.02, 0.044), new Vector3(side, -0.155, 0.05),
      new Vector3(side, -0.19, end.z), end,
    ]);
    strip.add(plug);
    cords.push(new TubeGeometry(path, 52, 0.0024, 6));
  });
  if (cords.length) {
    const loom = new Mesh(mergeGeos(cords), nearBlack);
    loom.userData.pickBlocker = true; // touching a supply lead does not flip the rocker
    strip.add(loom);
  }
}

/** A parts organiser: a cabinet of little clear drawers, some of them with something in. */
export function partsDrawers(): Group {
  const g = new Group();
  const cols = 3, rows = 3;
  const dw = 0.04, dh = 0.034, dd = 0.1;
  const W = cols * dw + 0.008, H = rows * dh + 0.008;
  const shell = new MeshStandardMaterial({ color: "#8d867a", roughness: 0.55 });
  g.add(box(W, 0.004, dd, shell, 0, H - 0.002, 0));
  g.add(box(W, 0.004, dd, shell, 0, 0.002, 0));
  g.add(box(0.004, H, dd, shell, -W / 2 + 0.002, H / 2, 0));
  g.add(box(0.004, H, dd, shell, W / 2 - 0.002, H / 2, 0));
  g.add(box(W, H, 0.003, shell, 0, H / 2, -dd / 2 + 0.0015));
  const clear = new MeshStandardMaterial({ color: "#dfe6ea", roughness: 0.25, transparent: true, opacity: 0.42 });
  const fills = [teal, tomato, mustard, steelBlue, brass, nearBlack];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -W / 2 + 0.004 + dw * (c + 0.5);
      const y = 0.004 + dh * (r + 0.5);
      const out = (n * 7) % 5 === 0 ? 0.012 : 0; // a couple left pulled out
      g.add(box(dw - 0.003, dh - 0.003, dd - 0.006, clear, x, y, out));
      g.add(box(0.014, 0.005, 0.003, warmGrey, x, y + dh * 0.3, dd / 2 - 0.0015 + out));
      if (n % 3 !== 1) g.add(box(dw - 0.012, dh * 0.4, dd * 0.6, fills[n % fills.length], x, y - dh * 0.2, out - 0.01));
      n++;
    }
  }
  return g;
}

/** A spool of blue cat6, standing on its edge, with the loose end trailing. */
export function cableSpool(): Group {
  const g = new Group();
  const R = 0.05;
  const flange = new MeshStandardMaterial({ color: "#ece2cc", roughness: 0.6 });
  const spool = new Group();
  spool.add(new Mesh(new TorusGeometry(R * 0.62, R * 0.36, 12, 40), steelBlue));
  for (const z of [-0.026, 0.026]) {
    const f = new Mesh(new CylinderGeometry(R, R, 0.004, 40), flange);
    f.rotation.x = Math.PI / 2;
    f.position.z = z;
    spool.add(f);
  }
  const core = new Mesh(new CylinderGeometry(R * 0.28, R * 0.28, 0.056, 20), flange);
  core.rotation.x = Math.PI / 2;
  spool.add(core);
  spool.position.y = R;
  g.add(spool);
  g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(R * 0.95, R * 1.1, 0.02), new Vector3(R * 1.4, R * 0.5, 0.05), new Vector3(R * 1.2, 0.003, 0.11), new Vector3(R * 0.3, 0.003, 0.16)]), 24, 0.0022, 6), steelBlue));
  return g;
}

/** Two 3.5" drives, one on the other, labels out. */
export function spareDrives(): Group {
  const g = new Group();
  const W = 0.102, H = 0.026, D = 0.147;
  const label = canvas(256, 96, (c) => {
    c.fillStyle = "#ece2cc"; c.fillRect(0, 0, 256, 96);
    c.fillStyle = "#1f1d1b"; c.font = "bold 22px Helvetica, Arial, sans-serif"; c.fillText("4 TB", 14, 36);
    c.font = "12px 'IBM Plex Mono', monospace"; c.fillText("SATA 6Gb/s  7200", 14, 62);
    c.fillStyle = "#b8412c"; c.fillRect(190, 14, 52, 52);
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? "#1f1d1b" : "#ece2cc"; c.fillRect(14 + i * 6, 76, 4, 12); }
  });
  const stickers = new MeshStandardMaterial({ map: label, roughness: 0.7 });
  for (let i = 0; i < 2; i++) {
    const y = H * (i + 0.5) + i * 0.002;
    g.add(box(W, H, D, darkMetal, 0, y, i * 0.006));
    const top = new Mesh(new PlaneGeometry(W * 0.8, D * 0.5), stickers);
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, y + H / 2 + 0.0004, i * 0.006 + 0.01);
    g.add(top);
    g.add(box(W * 0.92, 0.004, 0.008, pcb, 0, y - H / 2 + 0.003, D / 2 - 0.004 + i * 0.006));
  }
  return g;
}

/** A roll of black electrical tape, hung on a peg. */
export function tapeRoll(): Group {
  const g = new Group();
  const roll = new Mesh(new TorusGeometry(0.02, 0.009, 10, 32), new MeshStandardMaterial({ color: "#1a1816", roughness: 0.35 }));
  const core = new Mesh(new CylinderGeometry(0.012, 0.012, 0.018, 20, 1, true), warmGrey);
  core.rotation.x = Math.PI / 2;
  g.add(roll, core);
  return g;
}

/** A hank of cable, coiled and hung on a peg. */
export function cableLoop(colour = "#1f1d1b"): Group {
  const g = new Group();
  const mat = new MeshStandardMaterial({ color: colour, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const loop = new Mesh(new TorusGeometry(0.036 + (i % 2) * 0.003, 0.0022, 6, 36), mat);
    loop.position.set(0, -0.036, 0.004 + i * 0.0045);
    loop.rotation.z = (i - 2) * 0.06;
    g.add(loop);
  }
  g.add(box(0.012, 0.008, 0.026, mustard, 0, -0.06, 0.014)); // the velcro strap
  return g;
}

/** A steel rule. */
export function steelRule(): Group {
  const g = new Group();
  const face = canvas(512, 48, (c) => {
    c.fillStyle = "#c9c2b6"; c.fillRect(0, 0, 512, 48);
    c.fillStyle = "#1f1d1b";
    for (let i = 0; i <= 120; i++) c.fillRect(8 + i * 4.1, 0, 1, i % 10 === 0 ? 20 : i % 5 === 0 ? 14 : 8);
    c.font = "bold 11px Helvetica, Arial, sans-serif";
    for (let i = 1; i <= 12; i++) c.fillText(String(i), 4 + i * 41, 34);
    c.beginPath(); c.arc(496, 24, 6, 0, Math.PI * 2); c.fillStyle = "#4a4743"; c.fill();
  });
  const rule = new Mesh(new BoxGeometry(0.3, 0.028, 0.0012), [darkMetal, darkMetal, darkMetal, darkMetal, new MeshStandardMaterial({ map: face, roughness: 0.3, metalness: 0.8 }), darkMetal]);
  g.add(rule);
  return g;
}

/** An RJ45 plug and a cable from `from` (a port's world position) along `via` points. */
export function ethernetRun(from: Vector3, out: Vector3, via: Vector3[], hex: string): Group {
  const g = new Group();
  const mat = new MeshStandardMaterial({ color: hex, roughness: 0.55 });
  const plug = new Mesh(new BoxGeometry(0.0115, 0.008, 0.02), new MeshStandardMaterial({ color: "#dfe6ea", roughness: 0.3, transparent: true, opacity: 0.8 }));
  plug.position.copy(from).addScaledVector(out, 0.008);
  plug.lookAt(plug.position.clone().add(out));
  const boot = new Mesh(new CylinderGeometry(0.0032, 0.0045, 0.012, 10), mat);
  boot.position.copy(from).addScaledVector(out, 0.023);
  boot.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), out);
  // Round each corner locally so long vertical drops cannot pull a curve through the shelf.
  const points = [from.clone().addScaledVector(out, 0.025), from.clone().addScaledVector(out, 0.045), ...via];
  const knots = points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 1e-10);
  const path = new CurvePath<Vector3>();
  let start = knots[0];
  for (let i = 1; i < knots.length - 1; i++) {
    const corner = knots[i];
    const radius = Math.min(0.022, corner.distanceTo(knots[i - 1]) / 2, corner.distanceTo(knots[i + 1]) / 2);
    if (radius < 1e-5) continue;
    const before = corner.clone().add(knots[i - 1].clone().sub(corner).setLength(radius));
    const after = corner.clone().add(knots[i + 1].clone().sub(corner).setLength(radius));
    path.add(new LineCurve3(start, before));
    path.add(new QuadraticBezierCurve3(before, corner, after));
    start = after;
  }
  path.add(new LineCurve3(start, knots[knots.length - 1]));
  g.add(plug, boot, new Mesh(new TubeGeometry(path, Math.min(112, Math.ceil(path.getLength() / 0.006)), 0.0022, 6), mat));
  return g;
}

export const cableColour = (i: number) => CABLE_COLOURS[i % CABLE_COLOURS.length];

/** A label chip for a lab prop. */
export const spot = (label: string, hint?: string): Hotspot => ({ kind: "wiggle", label, hint });

/** Width of a placed prop along its own x, for fitting things beside it. */
export function widthOf(o: Object3D): number {
  const size = new Box3().setFromObject(o).getSize(new Vector3());
  return size.x;
}
