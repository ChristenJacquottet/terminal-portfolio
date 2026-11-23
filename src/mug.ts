// The mug, with coffee in it that behaves like coffee: a glossy liquid surface that catches the
// lamp, a crema line at the rim, a slosh that lags the cup when it's knocked and rings that die
// away, and a thread of steam while it's still warm. Everything animates only while interact.ts
// is stepping it (the scene draws on demand), so a mug at rest costs nothing.
import {
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  type Camera,
} from "three";

/** How interact.ts drives the coffee each frame. */
export type Liquid = {
  /** Knock the cup: the liquid gets a kick and rings start from the wall. */
  knock(strength: number): void;
  /** Keep the steam going for `ms` more. */
  steam(ms: number): void;
  /**
   * Advance by `dt` seconds. `tilt` is how far the cup itself is tilted right now (radians about
   * x and z) so the surface can stay level and lag behind. Returns true while anything still moves.
   */
  step(dt: number, now: number, camera: Camera, tilt?: { x: number; z: number }): boolean;
  /** How full the cup is, 0 (empty: no steam, a dry ring) to 1 (full). */
  level(): number;
  /** Moves the surface, the crema line and the column under it to `k` of full (0..1). */
  setLevel(k: number): void;
  /** When set, the cup's tilt for `step`, whoever is stepping (a sip holds it while it lifts the cup). */
  hold: { x: number; z: number } | null;
};

const RINGS = 14;
const SEGS = 40;
const RADIUS = 0.0346;
const LEVEL = 0.079;
/** The inside floor of the cup. */
const FLOOR = 0.008;

/** A disc with vertices on concentric rings, so waves can be drawn across it. */
function discGeometry(radius: number): { geo: BufferGeometry; r: Float32Array } {
  const positions: number[] = [0, 0, 0];
  const radii: number[] = [0];
  for (let i = 1; i <= RINGS; i++) {
    const r = (i / RINGS) * radius;
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      radii.push(r / radius);
    }
  }
  const index: number[] = [];
  const at = (ring: number, seg: number) => (ring === 0 ? 0 : 1 + (ring - 1) * SEGS + (seg % SEGS));
  for (let j = 0; j < SEGS; j++) index.push(0, at(1, j + 1), at(1, j));
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1);
      index.push(a, d, c, a, b, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return { geo, r: new Float32Array(radii) };
}

/** A soft, bent wisp of steam or smoke, white, for billboards (the soldering iron's smoke uses it too). */
export function wispTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  // a soft, slightly bent column: brighter in the middle, feathered everywhere
  for (let y = 0; y < 128; y++) {
    const k = y / 128;
    const x0 = 32 + Math.sin(k * 5.2) * 7 * (1 - k);
    const w = 7 + k * 15;
    const grad = g.createLinearGradient(x0 - w, y, x0 + w, y);
    const a = Math.sin(k * Math.PI) ** 1.4 * 0.95;
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, y, 64, 1);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The red mug with coffee in it. `group.userData.liquid` drives the coffee (see Liquid). */
export function mug(): Group {
  const g = new Group();
  const ceramic = new MeshStandardMaterial({ color: "#b8342b", roughness: 0.32, envMapIntensity: 1.4 });
  const profile = [
    [0, 0], [0.036, 0], [0.04, 0.004], [0.04, 0.095], [0.036, 0.095], [0.035, 0.008], [0, 0.008],
  ].map(([x, y]) => new Vector2(x, y));
  const body = new Mesh(new LatheGeometry(profile, 48), ceramic);
  const handle = new Mesh(new TorusGeometry(0.025, 0.0055, 12, 28, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.04, 0.05, 0);
  g.add(body, handle);

  // ── the coffee ────────────────────────────────────────────────────────────────────────────
  // Dark, nearly opaque, with a wet clearcoat: the lamp lands on it as one sharp highlight.
  const { geo, r } = discGeometry(RADIUS);
  const rest = (geo.getAttribute("position").array as Float32Array).slice();
  const liquidMat = new MeshPhysicalMaterial({
    color: "#1a0b04",
    roughness: 0.07,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    ior: 1.34,
    envMapIntensity: 6,
    transparent: true, // the surface never casts a shadow (put() skips transparent materials)
    opacity: 1,
  });
  const surface = new Mesh(geo, liquidMat);
  surface.name = "coffee";
  surface.position.y = LEVEL;
  // Under the surface, a dark column so the inside of the cup never shows through a wave trough.
  const depth = new Mesh(new CylinderGeometry(0.0349, 0.0349, 0.004, 40), new MeshStandardMaterial({ color: "#1a0b04", roughness: 0.9 }));
  depth.position.y = LEVEL - 0.0021;
  // The crema ring where the coffee climbs the wall.
  const meniscus = new Mesh(new TorusGeometry(RADIUS - 0.0006, 0.0008, 6, 48), new MeshStandardMaterial({ color: "#6a3b1c", roughness: 0.45, transparent: true }));
  meniscus.rotation.x = Math.PI / 2;
  meniscus.position.y = LEVEL + 0.0004;
  const coffee = new Group();
  coffee.add(surface, meniscus);
  g.add(depth, coffee);
  // What an empty cup keeps: a faint dried ring on the floor where the last of it sat.
  const ringCanvas = document.createElement("canvas");
  ringCanvas.width = ringCanvas.height = 128;
  const rg = ringCanvas.getContext("2d")!;
  const stain = rg.createRadialGradient(64, 64, 0, 64, 64, 64);
  stain.addColorStop(0, "rgba(60,30,10,0.3)");
  stain.addColorStop(0.7, "rgba(60,30,10,0.38)");
  stain.addColorStop(0.84, "rgba(40,18,6,0.95)");
  stain.addColorStop(0.92, "rgba(52,25,8,0.5)");
  stain.addColorStop(1, "rgba(60,30,10,0.12)");
  rg.fillStyle = stain;
  rg.fillRect(0, 0, 128, 128);
  const ringMap = new CanvasTexture(ringCanvas);
  ringMap.colorSpace = SRGBColorSpace;
  const dry = new Mesh(new PlaneGeometry(0.069, 0.069), new MeshStandardMaterial({ map: ringMap, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }));
  dry.rotation.x = -Math.PI / 2;
  dry.position.y = FLOOR + 0.0004;
  dry.visible = false;
  dry.raycast = () => {};
  g.add(dry);
  let full = 1;

  // ── steam ─────────────────────────────────────────────────────────────────────────────────
  const wispMap = wispTexture();
  const wisps = Array.from({ length: 3 }, (_, i) => {
    const m = new Mesh(new PlaneGeometry(0.04, 0.08), new MeshBasicMaterial({ map: wispMap, transparent: true, opacity: 0, depthWrite: false, color: "#fff4ea" }));
    m.raycast = () => {};
    m.userData.phase = i / 3;
    m.visible = false;
    g.add(m);
    return m;
  });
  const STEAM_LIFE = 2.4;

  // ── the simulation ────────────────────────────────────────────────────────────────────────
  const slosh = { x: 0, z: 0, vx: 0, vz: 0 }; // the surface's tilt (radians) and its speed
  let ring = 0; // ring amplitude (metres)
  let phase = 0; // ring phase
  let steamUntil = 0;
  let steamClock = 0;
  const pos = geo.getAttribute("position");
  let lastNow = -1;
  let lastMoving = false;

  const liquid: Liquid = {
    hold: null,
    level: () => full,
    setLevel(k) {
      full = Math.max(0, Math.min(1, k));
      const y = FLOOR + (LEVEL - FLOOR) * full;
      surface.position.y = y;
      meniscus.position.y = y + 0.0004;
      depth.position.y = Math.max(FLOOR + 0.0021, y - 0.0021);
      const wet = full > 0.004;
      surface.visible = meniscus.visible = depth.visible = wet;
      dry.visible = !wet;
      if (!wet) steamUntil = 0;
    },
    knock(strength) {
      // a kick to the surface's velocity (more about z, the way the handle side is pushed) and
      // fresh rings from the wall
      slosh.vz += 1.9 * strength;
      slosh.vx += 1.1 * strength * (Math.random() < 0.5 ? -1 : 1);
      ring = Math.min(0.0011, ring + 0.0009 * strength);
      phase = 0;
      this.steam(3200);
    },
    steam(ms) {
      if (full <= 0.004) return; // an empty cup doesn't steam
      steamUntil = Math.max(steamUntil, performance.now() + ms);
    },
    step(dt, now, camera, tilt) {
      // Two loops may step the coffee in one frame (a sip, and the steam from stepping back): once is enough.
      if (Math.abs(now - lastNow) < 4) return lastMoving;
      lastNow = now;
      tilt = this.hold ?? tilt;
      let moving = false;
      // The surface wants to be level in the world: in the cup's frame that is minus the cup's tilt.
      const tx = -(tilt?.x ?? 0);
      const tz = -(tilt?.z ?? 0);
      const k = 230; // stiffness: a cup of coffee rocks about 2.5 times a second
      const c = 5.5; // damping: three or four visible swings
      slosh.vx += (-k * (slosh.x - tx) - c * slosh.vx) * dt;
      slosh.vz += (-k * (slosh.z - tz) - c * slosh.vz) * dt;
      slosh.x += slosh.vx * dt;
      slosh.z += slosh.vz * dt;
      coffee.rotation.x = slosh.x;
      coffee.rotation.z = slosh.z;
      if (Math.abs(slosh.vx) + Math.abs(slosh.vz) + Math.abs(slosh.x - tx) + Math.abs(slosh.z - tz) > 2e-3) moving = true;

      // Rings: a standing wave from the wall that fades over a second or so.
      if (ring > 1e-5) {
        phase += dt * 21;
        ring *= Math.exp(-2.6 * dt);
        for (let i = 0; i < pos.count; i++) {
          const rr = r[i];
          const wave = Math.cos(rr * 15.5 - phase) * Math.sin(Math.min(1, rr * 1.4 + 0.2) * Math.PI * 0.5);
          pos.setY(i, rest[i * 3 + 1] + ring * wave);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        moving = true;
        if (ring <= 1e-5) {
          for (let i = 0; i < pos.count; i++) pos.setY(i, rest[i * 3 + 1]);
          pos.needsUpdate = true;
          geo.computeVertexNormals();
        }
      }

      // Steam: three wisps on staggered loops, billboarded, rising, spreading and thinning.
      const steaming = now < steamUntil;
      if (steaming || steamClock > 0) {
        steamClock = steaming ? steamClock + dt : 0;
        for (const w of wisps) {
          const t = ((steamClock / STEAM_LIFE + (w.userData.phase as number)) % 1 + 1) % 1;
          const fade = Math.sin(t * Math.PI) ** 1.3;
          const h = 0.1 + t * 0.085;
          w.position.set(Math.sin(t * 7 + (w.userData.phase as number) * 9) * 0.006, h, Math.cos(t * 5) * 0.004);
          w.scale.setScalar(0.65 + t * 0.9);
          w.quaternion.copy(camera.quaternion);
          (w.material as MeshBasicMaterial).opacity = steaming ? 0.34 * fade : 0;
          w.visible = steaming;
        }
        moving = moving || steaming;
      }
      lastMoving = moving;
      return moving;
    },
  };
  g.userData.liquid = liquid;
  return g;
}
