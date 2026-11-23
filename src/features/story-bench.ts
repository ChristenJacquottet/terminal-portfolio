// The breadboard and the meter are one circuit. Click the breadboard: power on, its red LED lights
// with a faint glow on the board, and the meter clipped to it swings to 3.3 V. Click again: off,
// the needle falls back to zero. Click the meter: it takes a reading (the needle swings and
// settles), and the label says what it reads.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Raycaster,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from "three";
import type { DeskApi, Feature } from "./types";
import { easeOut, refreshChip, wobble } from "./story-kit";

const VOLTS = 3.3;
/** The meter's range: 5 V full scale, read on the dial's 0–50 arc (3.3 V sits between 30 and 40). */
const FULL = 5;
/** The needle's sweep either side of upright, radians. */
const SWEEP = 0.72;

let powered = false;
let desk: DeskApi | null = null;
let led: { m: MeshStandardMaterial; halo: Sprite; pool: Mesh } | null = null;
let needle: { set: (a: number) => void; angle: number } | null = null;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The LED: the red part on the board (the model's own), lit from inside, a halo, a pool of light. */
function rigLed(board: Object3D) {
  let found: Mesh | null = null;
  board.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || found) return;
    if (m.name === "Object_4_1") found = m;
  });
  const bulb = found as Mesh | null;
  if (!bulb) return null;
  const old = bulb.material as MeshStandardMaterial;
  const m = old.clone();
  m.emissive = new Color("#ff1206");
  m.emissiveMap = old.map ?? null;
  m.emissiveIntensity = 0;
  bulb.material = m;
  // A child keeps it out of the desk's static-mesh batching (it moves: it lights up).
  bulb.add(new Group());
  board.updateMatrixWorld(true);
  const geo = bulb.geometry as BufferGeometry;
  geo.computeBoundingBox();
  const box = geo.boundingBox!.clone().applyMatrix4(bulb.matrixWorld);
  const top = new Vector3((box.min.x + box.max.x) / 2, box.max.y - (box.max.y - box.min.y) * 0.22, (box.min.z + box.max.z) / 2);
  const tex = glowTexture();
  const halo = new Sprite(new SpriteMaterial({ map: tex, color: "#ff4a2a", blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  halo.scale.setScalar(0.03);
  halo.position.copy(board.worldToLocal(top.clone()));
  halo.raycast = () => {};
  halo.visible = false;
  // the glow on the board under it
  const pool = new Mesh(
    new PlaneGeometry(0.11, 0.11).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: tex, color: "#ff3a1c", blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }),
  );
  let boardTop = -Infinity;
  board.traverse((o) => {
    const mm = o as Mesh;
    if (!mm.isMesh || mm === bulb) return;
    const b = (mm.geometry as BufferGeometry).boundingBox ?? ((mm.geometry as BufferGeometry).computeBoundingBox(), (mm.geometry as BufferGeometry).boundingBox!);
    const wb = b.clone().applyMatrix4(mm.matrixWorld);
    // the board itself: the widest flat part
    if (wb.max.x - wb.min.x > 0.08 && wb.max.y - wb.min.y < 0.03) boardTop = Math.max(boardTop, wb.max.y);
  });
  const under = new Vector3(top.x, Number.isFinite(boardTop) ? boardTop + 0.0012 : box.min.y, top.z);
  pool.position.copy(board.worldToLocal(under));
  pool.raycast = () => {};
  pool.visible = false;
  pool.renderOrder = 3;
  halo.renderOrder = 3;
  const s = board.getWorldScale(new Vector3()).x || 1;
  halo.scale.divideScalar(s);
  pool.scale.divideScalar(s);
  board.add(halo, pool);
  return { m, halo, pool };
}

/**
 * The needle: the meter's dial is a flat window (its glass, the model's `lP_body002`); a thin
 * dark needle pivots under it from the bottom of the dial.
 */
function rigNeedle(meter: Object3D) {
  let glass: Mesh | null = null;
  meter.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && /glass/i.test((m.material as MeshStandardMaterial).name ?? "")) glass = m;
  });
  const g = glass as Mesh | null;
  if (!g) return null;
  meter.updateMatrixWorld(true);
  const pos = (g.geometry as BufferGeometry).getAttribute("position");
  const pts: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) pts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(g.matrixWorld));
  const centre = pts.reduce((a, p) => a.add(p), new Vector3()).divideScalar(pts.length);
  // the window's plane, facing out of the meter: the glass's own normal (it's drawn from the front)
  const a = pts[1].clone().sub(pts[0]);
  const b = pts[2].clone().sub(pts[0]);
  const normal = new Vector3().crossVectors(a, b).normalize();
  const nAttr = (g.geometry as BufferGeometry).getAttribute("normal");
  if (nAttr) {
    const given = new Vector3().fromBufferAttribute(nAttr, 0).transformDirection(g.matrixWorld);
    if (normal.dot(given) < 0) normal.negate();
  }
  // "up" on the dial: the world's up, laid into the window's plane
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal).normalize();
  let h = 0;
  let w = 0;
  for (const p of pts) {
    h = Math.max(h, Math.abs(p.clone().sub(centre).dot(up)));
    w = Math.max(w, Math.abs(p.clone().sub(centre).dot(right)));
  }
  // The pivot sits below the window's bottom edge (hidden by the case), the needle reaches up to the scale.
  eraseNeedle(meter, g, centre, up, normal, h);
  const pivotAt = centre.clone().addScaledVector(up, -h * 1.55).addScaledVector(normal, -0.0012);
  const len = h * 2.35;
  const pivot = new Group();
  pivot.position.copy(pivotAt);
  // the pivot's frame: y along the dial's up, z out of the dial
  pivot.up.copy(up);
  pivot.lookAt(pivotAt.clone().add(normal));
  const mat = new MeshStandardMaterial({ color: "#151311", roughness: 0.5 });
  const shaft = new Mesh(new BoxGeometry(Math.max(0.0004, w * 0.018), len, 0.0002), mat);
  shaft.position.y = len / 2;
  const tip = new Mesh(new BoxGeometry(Math.max(0.0005, w * 0.012), len * 0.3, 0.00022), new MeshStandardMaterial({ color: "#a3241a", roughness: 0.5 }));
  tip.position.y = len * 0.85;
  pivot.add(shaft, tip);
  for (const m of [shaft, tip]) {
    m.raycast = () => {};
    m.castShadow = false;
  }
  meter.attach(pivot);
  // angle 0 is upright; positive swings right, as you face the dial
  const q0 = pivot.quaternion.clone();
  const set = (a: number) => {
    pivot.quaternion.copy(q0);
    pivot.rotateZ(-a);
  };
  set(-SWEEP);
  return { set, angle: -SWEEP };
}

/**
 * The dial's texture has a needle painted on it, straight up the middle. Find that line on the
 * texture (rays through the glass onto the body, read their UVs) and paint it out by copying the
 * dial beside it over it, so the moving needle is the only one.
 */
function eraseNeedle(meter: Object3D, glass: Mesh, centre: Vector3, up: Vector3, normal: Vector3, h: number) {
  let body: Mesh | null = null;
  meter.traverse((o) => {
    const m = o as Mesh;
    if (!body && m.isMesh && m !== glass && (m.material as MeshStandardMaterial).map) body = m;
  });
  const b = body as Mesh | null;
  const mat = b?.material as MeshStandardMaterial | undefined;
  const image = mat?.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!b || !mat?.map || !image?.width) return;
  const ray = new Raycaster();
  // The dial face is the body's surface just behind the glass; rays that miss it (the window's
  // frame, near the top) find something farther away, so keep only hits at the face's depth.
  const across = new Vector3().crossVectors(up, normal).normalize();
  const depth = (() => {
    ray.set(centre.clone().addScaledVector(normal, 0.02), normal.clone().negate());
    return ray.intersectObject(b, false)[0]?.distance ?? null;
  })();
  if (depth === null) return;
  const uvAt = (k: number, sideways = 0) => {
    const from = centre.clone().addScaledVector(up, k * h).addScaledVector(across, sideways * h).addScaledVector(normal, 0.02);
    ray.set(from, normal.clone().negate());
    const hit = ray.intersectObject(b, false)[0];
    return hit && Math.abs(hit.distance - depth) < 0.0006 ? hit.uv ?? null : null;
  };
  // the painted needle runs up the middle, from the bottom of the window to about two-thirds up:
  // sample it where the face is sure to be hit, and extend the line in texture space
  const p0 = uvAt(-0.8);
  const p1 = uvAt(0.4);
  const sideUv = uvAt(-0.8, 0.05);
  if (!p0 || !p1 || !sideUv) return;
  const along = (k: number) => p0.clone().add(p1.clone().sub(p0).multiplyScalar((k + 0.8) / 1.2));
  const a = along(-1.05);
  const z = along(0.7);
  const side = sideUv;
  if (!a || !z || !side) return;
  const W = image.width;
  const H = image.height;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return;
  g.drawImage(image, 0, 0);
  const flip = mat.map.flipY;
  const px = (u: { x: number; y: number }) => [u.x * W, (flip ? 1 - u.y : u.y) * H] as const;
  const [x0, y0] = px(a);
  const [x1, y1] = px(z);
  const [sx, sy] = px(side);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 4) return;
  // across the line, in texels: a strip this wide is replaced by the strip beside it
  const [bx, by] = px(p0);
  let ax = sx - bx;
  let ay = sy - by;
  const al = Math.hypot(ax, ay) || 1;
  ax /= al;
  ay /= al;
  const half = Math.max(2, len * 0.012);
  const shift = half * 2.6;
  const src = g.getImageData(0, 0, W, H);
  const out = g.getImageData(0, 0, W, H);
  for (let t = 0; t <= len; t += 0.5) {
    const lx = x0 + ((x1 - x0) * t) / len;
    const ly = y0 + ((y1 - y0) * t) / len;
    for (let d = -half; d <= half; d += 0.5) {
      const tx = Math.round(lx + ax * d);
      const ty = Math.round(ly + ay * d);
      const fx = Math.round(lx + ax * (d + shift));
      const fy = Math.round(ly + ay * (d + shift));
      if (tx < 0 || ty < 0 || fx < 0 || fy < 0 || tx >= W || fx >= W || ty >= H || fy >= H) continue;
      const i = (ty * W + tx) * 4;
      const j = (fy * W + fx) * 4;
      for (let k = 0; k < 4; k++) out.data[i + k] = src.data[j + k];
    }
  }
  g.putImageData(out, 0, 0);
  const tex = new CanvasTexture(c);
  tex.colorSpace = mat.map.colorSpace;
  tex.flipY = mat.map.flipY;
  tex.wrapS = mat.map.wrapS;
  tex.wrapT = mat.map.wrapT;
  tex.anisotropy = mat.map.anisotropy;
  tex.channel = mat.map.channel;
  mat.map = tex;
  mat.needsUpdate = true;
}

const reading = () => (powered ? VOLTS : 0);
const angleFor = (v: number) => -SWEEP + 2 * SWEEP * Math.min(1, v / FULL);

/** The needle swings to `v`: a meter movement, damped, overshoots and settles. */
async function swingTo(v: number, animate: DeskApi["animate"], kick = 0, ms = 1100) {
  if (!needle) return;
  const n = needle;
  const from = n.angle;
  const to = angleFor(v);
  await animate(ms, (t) => {
    const k = 1 - Math.exp(-7 * t) * Math.cos(t * Math.PI * 2.2);
    n.set(from + (to - from) * k + kick * wobble(t, 2.4, 5));
  });
  n.set(to);
  n.angle = to;
}

const bench: Feature = {
  name: "story-bench",
  hotspots: {
    breadboard: { kind: "breadboard", label: "breadboard", hint: "something half wired · power it" },
    multimeter: { kind: "multimeter", label: "multimeter", hint: "take a reading" },
  },
  label(_object, spot) {
    if (spot.kind === "breadboard") return ["breadboard", powered ? "LED on · 3.3 V · switch it off" : "something half wired · power it"];
    if (spot.kind === "multimeter") return [`multimeter · ${reading().toFixed(2)} V`, powered ? "across the LED's supply · read it again" : "nothing powered · take a reading"];
    return null;
  },
  onDesk(d) {
    desk = d;
    const board = d.props.get("breadboard");
    const meter = d.props.get("multimeter");
    if (board) led = rigLed(board);
    if (meter) needle = rigNeedle(meter);
    d.request();
  },
  actions: {
    async breadboard({ object, sfx, once, animate }) {
      await once(object, async () => {
        powered = !powered;
        sfx("switch", object, 0.7);
        const l = led;
        if (l) {
          l.halo.visible = l.pool.visible = true;
          const from = l.m.emissiveIntensity;
          const to = powered ? 1.7 : 0;
          const swing = swingTo(reading(), animate);
          await animate(powered ? 260 : 180, (t) => {
            const k = powered ? easeOut(t) * (t < 0.3 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 60)) : 1) : 1 - t;
            const v = powered ? from + (to - from) * k : from * k;
            l.m.emissiveIntensity = v;
            (l.halo.material as SpriteMaterial).opacity = (v / 1.7) * 0.8;
            (l.pool.material as MeshBasicMaterial).opacity = (v / 1.7) * 0.5;
          });
          if (!powered) l.halo.visible = l.pool.visible = false;
          await swing;
        } else {
          await swingTo(reading(), animate);
        }
        desk?.request();
      });
      refreshChip();
    },
    async multimeter({ object, sfx, once, animate }) {
      await once(object, async () => {
        sfx("needle", object);
        // the probes come off and touch again: it dips, then swings back to what it reads
        if (powered) await swingTo(reading() * 0.12, animate, 0, 380);
        await swingTo(reading(), animate, powered ? 0.04 : 0.05);
      });
      refreshChip();
    },
  },
};

export default bench;
