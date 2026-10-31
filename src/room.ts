// The room around the computer: an oak desk, a plaster wall with a window onto a 1980s Dallas
// skyline, venetian blinds, a floor. Loaded alongside the computer.
// Room textures: Poly Haven (CC0). The wooden desk and the skyline are built here, in code.
import {
  Cache,
  ImageLoader,
  Box3,
  BoxGeometry,
   type BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  PointLight,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  TextureLoader,
  Vector3,
  type Scene,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type RoomAssets = { floor: Texture | null };

/** What the props need to know about the room. Desk top is y = 0; the wall faces +z. */
export type Room = {
  windowCenter: Vector3;
  wallZ: number;
  floorY: number;
  /** The window opening in the wall, in world x/y. */
  window: { x0: number; x1: number; y0: number; y1: number };
  /** Desk top extents in world space. */
  desk: { minX: number; maxX: number; backZ: number; frontZ: number };
  /** The window and its blinds (a hotspot). */
  windowFrame: Object3D;
  /** Golden hour or the middle of the night: the sky outside and the light it lets in. */
  setTime(time: Time): void;
  /** Paints the 2 AM skyline on idle so clicking the window never stalls. */
  warmNight(): void;
};

export type Time = "dusk" | "night";

const PAINT = "#e8e0cc";
/** Exact extents of the desk footprint (2 m × 0.78744 m × 0.94711 m) every prop was arranged on. */
const DESK_SIZE = { w: 2, h: 0.78744, d: 0.94711 };

export const ROOM_TEXTURES = [
  "/textures/floor_diff.webp",
  "/textures/oak_diff.webp",
  "/textures/oak_nor_gl.webp",
  "/textures/oak_rough.webp",
  "/textures/world-map.webp",
] as const;

export async function loadRoom(): Promise<RoomAssets> {
  const tex = new TextureLoader();
  const get = (url: string) => tex.loadAsync(url).catch(() => null);
  // The oak and the wall map are fetched now too (into three's cache), so they're there on the
  // first frame instead of popping in after.
  Cache.enabled = true;
  const images = new ImageLoader();
  const warm = ROOM_TEXTURES.slice(1).map((url) => images.loadAsync(url).catch(() => null));
  const [floor] = await Promise.all([
    get(ROOM_TEXTURES[0]),
    ...warm,
  ]);
  return { floor: floor as Texture | null };
}

function tile(t: Texture | null, x: number, y: number, srgb = true) {
  if (!t) return null;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(x, y);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

const boxGeo = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y, z);

const box = (w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number) => new Mesh(boxGeo(w, h, d, x, y, z), mat);

function merged(parts: BufferGeometry[], mat: MeshStandardMaterial) {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return new Mesh(geo, mat);
}

/** Oak planks (Poly Haven, CC0), loaded now so the shaders are compiled with their maps. */
function oak(repeatX: number, repeatY: number) {
  const load = (name: string, srgb = false) => {
    const t = new TextureLoader().load(`/textures/oak_${name}.webp`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  return new MeshStandardMaterial({ map: load("diff", true), normalMap: load("nor_gl"), roughnessMap: load("rough"), roughness: 1, color: "#e8d6c0" });
}

/** A wooden desk: an oak top 4 cm thick, a drawer pedestal at each end, a modesty panel. */
function woodDesk(bounds: Box3): Group {
  const g = new Group();
  const w = bounds.max.x - bounds.min.x;
  const d = bounds.max.z - bounds.min.z;
  const h = bounds.max.y - bounds.min.y;
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  const top = box(w + 0.04, 0.04, d + 0.03, oak(1.6, 0.8), cx, -0.02, cz);
  const body = new MeshStandardMaterial({ color: "#5a3a28", roughness: 0.6 });
  const handle = new MeshStandardMaterial({ color: "#b58b4c", roughness: 0.35, metalness: 1 });
  const bodyParts: BufferGeometry[] = [];
  const pullParts: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const px = cx + side * (w / 2 - 0.22);
    bodyParts.push(boxGeo(0.42, h - 0.04, d - 0.06, px, -0.04 - (h - 0.04) / 2, cz - 0.01));
    for (let i = 0; i < 3; i++) {
      const dh = (h - 0.1) / 3;
      const y = -0.07 - dh / 2 - i * dh;
      bodyParts.push(boxGeo(0.39, dh - 0.012, 0.018, px, y, cz + (d - 0.06) / 2));
      pullParts.push(boxGeo(0.1, 0.012, 0.014, px, y + dh * 0.25, cz + (d - 0.06) / 2 + 0.014));
    }
  }
  bodyParts.push(boxGeo(w - 0.9, h * 0.45, 0.02, cx, -0.04 - h * 0.225, bounds.min.z + 0.04));
  g.add(top, merged(bodyParts, body), merged(pullParts, handle));
  return g;
}

export function buildRoom(
  scene: Scene,
  assets: RoomAssets,
  computer: Box3,
  opts?: { skyScale?: number; sunMapSize?: number; initTexture?: (t: Texture) => void },
): Room {
  // ── the desk: 2 m of oak on two drawer pedestals, top at y = 0, the computer towards its left ─
  const deskBox = new Box3(
    new Vector3(0.12 - DESK_SIZE.w / 2, -DESK_SIZE.h, computer.min.z - 0.1),
    new Vector3(0.12 + DESK_SIZE.w / 2, 0, computer.min.z - 0.1 + DESK_SIZE.d),
  );
  scene.add(woodDesk(deskBox));
  const floorY = deskBox.min.y;
  const wallZ = deskBox.min.z - 0.03;

  // ── floor ───────────────────────────────────────────────────────────────────────────────
  const floor = new Mesh(
    new PlaneGeometry(7, 5),
    new MeshStandardMaterial({ map: tile(assets.floor, 3.5, 2.5), color: "#8a7560", roughness: 0.75 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY, wallZ + 2.5);
  scene.add(floor);

  // ── wall with a window hole ─────────────────────────────────────────────────────────────
  const win = { x0: -1.45, x1: -0.6, y0: 0.2, y1: 1.2 }; // on the left, like the room I want
  const wallShape = new Shape().moveTo(-3.5, floorY).lineTo(3.5, floorY).lineTo(3.5, floorY + 2.8).lineTo(-3.5, floorY + 2.8).closePath();
  wallShape.holes.push(new Path().moveTo(win.x0, win.y0).lineTo(win.x0, win.y1).lineTo(win.x1, win.y1).lineTo(win.x1, win.y0).closePath());
  const wall = new Mesh(
    new ShapeGeometry(wallShape),
    new MeshStandardMaterial({ map: tile(wallpaper(), 1 / 0.6, 1 / 0.6), roughness: 0.92 }),
  );
  wall.position.z = wallZ;
  const skirting = box(7, 0.1, 0.015, new MeshStandardMaterial({ color: "#4a3626", roughness: 0.6 }), 0, floorY + 0.05, wallZ + 0.0075);
  scene.add(wall, skirting);

  // ── window: painted casing, deep jambs, a sill, a meeting rail, blinds ─────────────────
  const paint = new MeshStandardMaterial({ color: PAINT, roughness: 0.55 });
  const w = win.x1 - win.x0;
  const h = win.y1 - win.y0;
  const cx = (win.x0 + win.x1) / 2;
  const cy = (win.y0 + win.y1) / 2;
  const depth = 0.16; // wall thickness, seen in the reveal
  const casing = 0.06;
  const frame = new Group();
  frame.add(
    merged(
      [
        // casing on the wall face
        boxGeo(w + casing * 2, casing, 0.02, cx, win.y1 + casing / 2, wallZ + 0.01),
        boxGeo(casing, h, 0.02, win.x0 - casing / 2, cy, wallZ + 0.01),
        boxGeo(casing, h, 0.02, win.x1 + casing / 2, cy, wallZ + 0.01),
        // jambs, so the wall has thickness
        boxGeo(w, 0.01, depth, cx, win.y1 - 0.005, wallZ - depth / 2),
        boxGeo(0.01, h, depth, win.x0 + 0.005, cy, wallZ - depth / 2),
        boxGeo(0.01, h, depth, win.x1 - 0.005, cy, wallZ - depth / 2),
        boxGeo(w, 0.01, depth, cx, win.y0 + 0.005, wallZ - depth / 2),
        // the sash: a meeting rail and a frame at the glass line
        boxGeo(w, 0.035, 0.03, cx, cy, wallZ - depth + 0.03),
        boxGeo(w, 0.03, 0.03, cx, win.y1 - 0.025, wallZ - depth + 0.03),
        boxGeo(w, 0.03, 0.03, cx, win.y0 + 0.025, wallZ - depth + 0.03),
        boxGeo(0.03, h, 0.03, win.x0 + 0.025, cy, wallZ - depth + 0.03),
        boxGeo(0.03, h, 0.03, win.x1 - 0.025, cy, wallZ - depth + 0.03),
        // sill
        boxGeo(w + 0.16, 0.025, 0.07, cx, win.y0 - 0.0125, wallZ + 0.03),
      ],
      paint,
    ),
  );
  scene.add(frame);

  // Venetian blinds, half up with the slats tilted open: sun straight in below, in stripes above.
  const slatMat = new MeshStandardMaterial({ color: "#d9d0bd", roughness: 0.6, metalness: 0 });
  const slatW = w - 0.03;
  const bottom = win.y0 + h * 0.5; // raised halfway: the low sun comes straight in under them
  const pitch = 0.021;
  const count = Math.floor((win.y1 - 0.05 - bottom) / pitch);
  const slats = new InstancedMesh(new BoxGeometry(slatW, 0.0012, 0.024), slatMat, count);
  const dummy = new Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(cx, win.y1 - 0.05 - i * pitch, wallZ - 0.035);
    dummy.rotation.set(0.6, 0, 0);
    dummy.updateMatrix();
    slats.setMatrixAt(i, dummy.matrix);
  }
  frame.add(
    slats,
    merged(
      [
        boxGeo(slatW + 0.01, 0.03, 0.035, cx, win.y1 - 0.02, wallZ - 0.035), // headrail
        boxGeo(slatW, 0.012, 0.03, cx, bottom - pitch, wallZ - 0.035), // bottom rail
      ],
      slatMat,
    ),
  );
  // Clicking the window turns the time (interact.ts): dusk or the middle of the night.
  frame.name = "window";
  frame.userData.hotspot = { kind: "time", label: "the window" };
  const cord = new MeshStandardMaterial({ color: "#d8ceb6", roughness: 0.9 });
  const cords = merged(
    [
      boxGeo(0.002, win.y1 - bottom, 0.002, cx - slatW * 0.3, (win.y1 + bottom) / 2 - 0.02, wallZ - 0.022),
      boxGeo(0.002, win.y1 - bottom, 0.002, cx + slatW * 0.3, (win.y1 + bottom) / 2 - 0.02, wallZ - 0.022),
      boxGeo(0.003, 0.42, 0.003, win.x1 - 0.06, win.y1 - 0.25, wallZ - 0.02), // pull cord
    ],
    cord,
  );
  scene.add(cords);

  // ── outside: Dallas, golden hour by default, 2 AM painted on demand ─────────────────────
  // A high floor, looking out and a little down: the painted horizon (55% down the canvas) sits in
  // the lower half of the window, and the city spreads out below it.
  const skyScale = opts?.skyScale ?? 1;
  const skies: { dusk: CanvasTexture; night: CanvasTexture | null } = { dusk: duskSky(skyScale), night: null };
  const ensureNight = () => {
    if (!skies.night) {
      skies.night = nightSky(skyScale);
      opts?.initTexture?.(skies.night);
    }
    return skies.night;
  };
  const view = new Mesh(new PlaneGeometry(5.5, 4.3), new MeshBasicMaterial({ map: skies.dusk, fog: false, toneMapped: false }));
  view.position.set(cx + 0.2, win.y0 - 0.28 + 4.3 * 0.05, wallZ - 2.2);
  scene.add(view);

  // The light through the window only (setTime picks the sun at dusk or the moon at night). The
  // wall casts a shadow, so it lands as a window-shaped patch on the desk, striped by the blinds.
  // Its shadow map is drawn once (and again when something moves), never per frame; see desk.ts.
  const sun = new DirectionalLight("#6f8fc7", 0.55);
  // Aimed through the middle of the window at the desk, so its light actually gets in.
  const patch = new Vector3(-0.15, 0, computer.max.z - 0.05);
  const through = new Vector3(cx, cy - 0.1, wallZ - depth / 2);
  sun.position.copy(through).addScaledVector(through.clone().sub(patch), 2.5);
  sun.target.position.copy(patch);
  sun.castShadow = true;
  const sunMapSize = opts?.sunMapSize ?? 2048;
  sun.shadow.mapSize.set(sunMapSize, sunMapSize);
  Object.assign(sun.shadow.camera, { left: -1.8, right: 1.8, top: 1.4, bottom: -1.4, near: 0.5, far: 6 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // The city glow on the wall around the window, so the far side of the room falls off into blue
  // shadow instead of black.
  const bounce = new PointLight("#7d8fc4", 0.18, 2.4, 1.6);
  bounce.position.set(cx - 0.2, win.y0 + 0.1, wallZ + 0.45);
  scene.add(bounce);

  // Everything in the room takes shadows; the window and its blinds cast them, and so does the
  // wall (from behind, so both sides). The painted view outside and thin cords stay out of it.
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh === view || (mesh.material as MeshStandardMaterial).transparent) return;
    mesh.castShadow = mesh !== cords;
    mesh.receiveShadow = true;
  });
  (wall.material as MeshStandardMaterial).shadowSide = DoubleSide;

  return {
    windowCenter: new Vector3(cx, cy, wallZ - depth),
    wallZ,
    floorY,
    window: win,
    windowFrame: frame,
    desk: { minX: deskBox.min.x, maxX: deskBox.max.x, backZ: deskBox.min.z, frontZ: deskBox.max.z },
    warmNight() {
      ensureNight();
    },
    setTime(time) {
      // Dusk: the low sun through the blinds, warm. Night: the moon and the city, cool and dim.
      const look = time === "dusk" ? { sun: ["#ffb46e", 3.4], bounce: ["#ffb780", 0.45], tint: "#d8d0c8" } : { sun: ["#6f8fc7", 0.55], bounce: ["#7d8fc4", 0.18], tint: "#ffffff" };
      sun.color.set(look.sun[0] as string);
      sun.intensity = look.sun[1] as number;
      bounce.color.set(look.bounce[0] as string);
      bounce.intensity = look.bounce[1] as number;
      const material = view.material as MeshBasicMaterial;
      const nextMap = time === "night" ? ensureNight() : skies.dusk;
      if (material.map !== nextMap) {
        material.map = nextMap;
        material.needsUpdate = true;
      }
      material.color.set(look.tint);
    },
  };
}

/** Early-80s wallpaper: warm beige with a faint pinstripe and a tiny diamond, 60 cm repeat. */
function wallpaper(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b7a587";
  g.fillRect(0, 0, 512, 512);
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? "255,245,225" : "90,70,50"},0.05)`;
    g.fillRect(rand() * 512, rand() * 512, 2, 2);
  }
  for (let x = 0; x < 512; x += 64) {
    g.fillStyle = "rgba(120,96,70,0.18)";
    g.fillRect(x, 0, 3, 512);
    g.fillStyle = "rgba(255,240,215,0.12)";
    g.fillRect(x + 5, 0, 1, 512);
  }
  g.fillStyle = "rgba(120,92,66,0.22)";
  for (let x = 32; x < 512; x += 64) {
    for (let y = 16; y < 512; y += 64) {
      g.beginPath();
      g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A 1980s Dallas skyline at 2 AM, painted once into a canvas. Seeded so it never changes. */
function nightSky(res = 1): CanvasTexture {
  const W = 2048;
  const H = 1600;
  const c = document.createElement("canvas");
  c.width = Math.round(W * res);
  c.height = Math.round(H * res);
  const g = c.getContext("2d")!;
  if (res !== 1) g.scale(res, res);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const horizon = H * 0.55;

  // Deep blue overhead, warming to the city's sodium glow at the horizon.
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#03050c");
  sky.addColorStop(0.5, "#0b1328");
  sky.addColorStop(0.86, "#1d2342");
  sky.addColorStop(1, "#46354a");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(220,230,255,${0.2 + rand() * 0.6})`;
    const r = rand() < 0.1 ? 2 : 1.2;
    g.fillRect(rand() * W, rand() * horizon * 0.7, r, r);
  }
  // a low moon, top left
  const moon = g.createRadialGradient(W * 0.2, horizon * 0.28, 4, W * 0.2, horizon * 0.28, 160);
  moon.addColorStop(0, "rgba(235,236,225,1)");
  moon.addColorStop(0.17, "rgba(235,236,225,1)");
  moon.addColorStop(0.2, "rgba(160,180,230,0.25)");
  moon.addColorStop(1, "rgba(120,140,200,0)");
  g.fillStyle = moon;
  g.fillRect(0, 0, W, horizon);
  // a few long clouds, lit from below by the city
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `rgba(${70 + rand() * 30},${60 + rand() * 20},${90 + rand() * 30},${0.15 + rand() * 0.15})`;
    g.beginPath();
    g.ellipse(rand() * W, horizon * (0.25 + rand() * 0.45), 160 + rand() * 260, 6 + rand() * 10, 0, 0, Math.PI * 2);
    g.fill();
  }

  const lit = (x: number, y: number, w: number, h: number, density: number) => {
    for (let yy = y + 8; yy < y + h - 4; yy += 9) {
      for (let xx = x + 4; xx < x + w - 4; xx += 7) {
        if (rand() < density) {
          // mostly warm office lights, a few cool fluorescent ones
          g.fillStyle = rand() < 0.8 ? `rgba(255,${190 + rand() * 50},${110 + rand() * 60},${0.6 + rand() * 0.4})` : `rgba(180,210,255,${0.5 + rand() * 0.4})`;
          g.fillRect(xx, yy, 3, 4);
        }
      }
    }
  };

  // The skyline is a few miles off: draw it smaller, standing on the horizon.
  g.save();
  const sx = 0.72;
  const sy = 0.5;
  g.translate(W * 0.55 * (1 - sx), horizon * (1 - sy));
  g.scale(sx, sy);
  // far haze
  for (let x = -W * 0.4; x < W * 1.4; ) {
    const bw = 30 + rand() * 70;
    const bh = 30 + rand() * 110;
    g.fillStyle = "rgba(28,26,44,0.9)";
    g.fillRect(x, horizon - bh, bw, bh + 4);
    x += bw + rand() * 10;
  }

  const ink = "#0b0c16";
  const tower = (x: number, w: number, h: number, top?: (x: number, y: number) => void) => {
    g.fillStyle = ink;
    g.fillRect(x, horizon - h, w, h);
    lit(x, horizon - h, w, h, 0.18);
    top?.(x, horizon - h);
  };
  // fillers
  for (let i = 0; i < 40; i++) tower(-W * 0.2 + rand() * W * 1.4, 40 + rand() * 60, 80 + rand() * 180);
  // Renaissance Tower: the X bracing
  tower(W * 0.47, 88, 430, (x, y) => {
    g.strokeStyle = "rgba(255,235,200,0.7)";
    g.lineWidth = 2;
    for (let yy = y + 20; yy < horizon - 60; yy += 60) {
      g.beginPath();
      g.moveTo(x + 4, yy); g.lineTo(x + 84, yy + 60);
      g.moveTo(x + 84, yy); g.lineTo(x + 4, yy + 60);
      g.stroke();
    }
    g.fillStyle = ink;
    g.fillRect(x + 40, y - 70, 8, 70);
  });
  // Bank of America Plaza, with its green outline
  tower(W * 0.57, 96, 520, (x, y) => {
    g.strokeStyle = "rgba(90,255,140,0.95)";
    g.lineWidth = 3;
    g.shadowColor = "#5aff8c";
    g.shadowBlur = 12 * res;
    g.strokeRect(x + 2, y + 2, 92, 516);
    g.shadowBlur = 0;
  });
  // Fountain Place: a prism
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(W * 0.66, horizon); g.lineTo(W * 0.66, horizon - 380); g.lineTo(W * 0.66 + 50, horizon - 470); g.lineTo(W * 0.66 + 100, horizon - 330); g.lineTo(W * 0.66 + 100, horizon);
  g.fill();
  lit(W * 0.66, horizon - 330, 100, 330, 0.16);
  tower(W * 0.73, 76, 400); // Thanksgiving Tower
  // the Magnolia building and its red Pegasus
  tower(W * 0.4, 62, 270, (x, y) => {
    g.fillStyle = ink;
    g.fillRect(x + 28, y - 40, 6, 40);
    g.fillStyle = "#ff3b30";
    g.shadowColor = "#ff3b30";
    g.shadowBlur = 14 * res;
    g.beginPath();
    g.moveTo(x + 10, y - 44); g.lineTo(x + 40, y - 54); g.lineTo(x + 54, y - 70); g.lineTo(x + 50, y - 50); g.lineTo(x + 30, y - 42);
    g.fill();
    g.shadowBlur = 0;
  });
  // Reunion Tower: a shaft and a lit ball
  const rx = W * 0.3;
  g.fillStyle = ink;
  g.fillRect(rx - 10, horizon - 330, 20, 330);
  g.beginPath();
  g.arc(rx, horizon - 360, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,240,200,1)";
  g.shadowColor = "#ffe9b0";
  g.shadowBlur = 8 * res;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
    for (let r = 12; r < 42; r += 10) g.fillRect(rx + Math.cos(a) * r - 1.5, horizon - 360 + Math.sin(a) * r * 0.9 - 1.5, 3, 3);
  }
  g.shadowBlur = 0;

  g.restore();

  // Below the horizon, the city spreads out towards the window: rows of low buildings getting
  // bigger and darker as they come closer, with lit windows, trees, and streetlights between them.
  const ground = g.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, "#2a2236");
  ground.addColorStop(1, "#07060b");
  g.fillStyle = ground;
  g.fillRect(0, horizon, W, H - horizon);
  for (let row = 0; row < 9; row++) {
    const t = row / 8;
    const y = horizon + 10 + t * t * (H - horizon - 40);
    const scale = 0.4 + t * 2.2;
    const shade = Math.round(34 - t * 22);
    for (let x = -20; x < W; ) {
      const bw = (30 + rand() * 50) * scale;
      const bh = (14 + rand() * 30) * scale;
      g.fillStyle = `rgb(${shade},${shade - 2},${shade + 10})`;
      g.fillRect(x, y - bh, bw, bh + 6 * scale);
      for (let k = 0; k < bw * bh * 0.002; k++) {
        if (rand() < 0.35) {
          g.fillStyle = `rgba(255,${190 + rand() * 50},${110 + rand() * 60},0.85)`;
          g.fillRect(x + rand() * (bw - 3 * scale), y - bh + 3 * scale + rand() * (bh - 6 * scale), 2 * scale, 2.5 * scale);
        }
      }
      if (rand() < 0.35) {
        // a tree: a cluster of dark leaf blobs
        g.fillStyle = `rgb(${Math.max(0, shade - 12)},${Math.max(0, shade - 10)},${Math.max(0, shade - 6)})`;
        const r = (6 + rand() * 6) * scale;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + bw + r * (0.4 + rand()), y - r * (0.6 + rand() * 0.8), r * (0.6 + rand() * 0.4), 0, Math.PI * 2);
          g.fill();
        }
      }
      x += bw + rand() * 14 * scale;
    }
    // a street in front of the row, lined with sodium lamps
    g.fillStyle = "rgba(255,170,80,0.9)";
    for (let x = rand() * 60 * scale; x < W; x += (50 + rand() * 40) * scale) g.fillRect(x, y + 3 * scale, 2.2 * scale, 2.2 * scale);
  }
  // The freeway into downtown: a ribbon of headlights one way and tail lights the other.
  for (const [colour, dy] of [["rgba(255,236,200,0.55)", 0], ["rgba(255,60,40,0.5)", 7]] as const) {
    g.strokeStyle = colour;
    g.lineWidth = 3;
    g.setLineDash([5, 9]);
    g.beginPath();
    g.moveTo(0, horizon + 150 + dy);
    g.quadraticCurveTo(W * 0.5, horizon + 70 + dy, W, horizon + 140 + dy);
    g.stroke();
  }
  g.setLineDash([]);

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A 1980s Dallas skyline at golden hour, painted once into a canvas. Seeded so it never changes. */
function duskSky(res = 1): CanvasTexture {
  const W = 2048;
  const H = 1600;
  const c = document.createElement("canvas");
  c.width = Math.round(W * res);
  c.height = Math.round(H * res);
  const g = c.getContext("2d")!;
  if (res !== 1) g.scale(res, res);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const horizon = H * 0.55;

  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#40507a");
  sky.addColorStop(0.45, "#9a7a8e");
  sky.addColorStop(0.78, "#eaa06a");
  sky.addColorStop(1, "#f8c88a");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(W * 0.74, horizon - 40, 10, W * 0.74, horizon - 40, W * 0.32);
  sun.addColorStop(0, "rgba(255,236,190,0.95)");
  sun.addColorStop(0.12, "rgba(255,214,150,0.55)");
  sun.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  // a few long clouds
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `rgba(255,${180 + rand() * 40},${150 + rand() * 40},${0.12 + rand() * 0.12})`;
    g.beginPath();
    g.ellipse(rand() * W, horizon * (0.25 + rand() * 0.45), 160 + rand() * 260, 6 + rand() * 10, 0, 0, Math.PI * 2);
    g.fill();
  }

  const lit = (x: number, y: number, w: number, h: number, density: number) => {
    for (let yy = y + 8; yy < y + h - 4; yy += 9) {
      for (let xx = x + 4; xx < x + w - 4; xx += 7) {
        if (rand() < density) {
          g.fillStyle = `rgba(255,${200 + rand() * 40},${120 + rand() * 60},${0.55 + rand() * 0.4})`;
          g.fillRect(xx, yy, 3, 4);
        }
      }
    }
  };

  // The skyline is a few miles off: draw it smaller, standing on the horizon.
  g.save();
  const sx = 0.72;
  const sy = 0.5;
  g.translate(W * 0.55 * (1 - sx), horizon * (1 - sy));
  g.scale(sx, sy);
  // far haze
  for (let x = -W * 0.4; x < W * 1.4; ) {
    const bw = 30 + rand() * 70;
    const bh = 30 + rand() * 110;
    g.fillStyle = "rgba(150,110,120,0.55)";
    g.fillRect(x, horizon - bh, bw, bh + 4);
    x += bw + rand() * 10;
  }

  const ink = "#4a3a44";
  const tower = (x: number, w: number, h: number, top?: (x: number, y: number) => void) => {
    g.fillStyle = ink;
    g.fillRect(x, horizon - h, w, h);
    lit(x, horizon - h, w, h, 0.14);
    top?.(x, horizon - h);
  };
  // fillers
  for (let i = 0; i < 40; i++) tower(-W * 0.2 + rand() * W * 1.4, 40 + rand() * 60, 80 + rand() * 180);
  // Renaissance Tower: the X bracing
  tower(W * 0.47, 88, 430, (x, y) => {
    g.strokeStyle = "rgba(255,210,160,0.35)";
    g.lineWidth = 2;
    for (let yy = y + 20; yy < horizon - 60; yy += 60) {
      g.beginPath();
      g.moveTo(x + 4, yy); g.lineTo(x + 84, yy + 60);
      g.moveTo(x + 84, yy); g.lineTo(x + 4, yy + 60);
      g.stroke();
    }
    g.fillStyle = ink;
    g.fillRect(x + 40, y - 70, 8, 70);
  });
  // Bank of America Plaza, with its green outline
  tower(W * 0.57, 96, 520, (x, y) => {
    g.strokeStyle = "rgba(90,255,140,0.75)";
    g.lineWidth = 3;
    g.strokeRect(x + 2, y + 2, 92, 516);
  });
  // Fountain Place: a prism
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(W * 0.66, horizon); g.lineTo(W * 0.66, horizon - 380); g.lineTo(W * 0.66 + 50, horizon - 470); g.lineTo(W * 0.66 + 100, horizon - 330); g.lineTo(W * 0.66 + 100, horizon);
  g.fill();
  lit(W * 0.66, horizon - 330, 100, 330, 0.12);
  tower(W * 0.73, 76, 400); // Thanksgiving Tower
  // the Magnolia building and its red Pegasus
  tower(W * 0.4, 62, 270, (x, y) => {
    g.fillStyle = ink;
    g.fillRect(x + 28, y - 40, 6, 40);
    g.fillStyle = "#ff3b30";
    g.shadowColor = "#ff3b30";
    g.shadowBlur = 14 * res;
    g.beginPath();
    g.moveTo(x + 10, y - 44); g.lineTo(x + 40, y - 54); g.lineTo(x + 54, y - 70); g.lineTo(x + 50, y - 50); g.lineTo(x + 30, y - 42);
    g.fill();
    g.shadowBlur = 0;
  });
  // Reunion Tower: a shaft and a lit ball
  const rx = W * 0.3;
  g.fillStyle = ink;
  g.fillRect(rx - 10, horizon - 330, 20, 330);
  g.beginPath();
  g.arc(rx, horizon - 360, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,236,190,0.9)";
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
    for (let r = 12; r < 42; r += 10) g.fillRect(rx + Math.cos(a) * r - 1.5, horizon - 360 + Math.sin(a) * r * 0.9 - 1.5, 3, 3);
  }

  g.restore();

  // Below the horizon, the city spreads out towards the window: rows of low buildings getting
  // bigger and darker as they come closer, with lit windows, and trees between them.
  const ground = g.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, "#9a7476");
  ground.addColorStop(1, "#3a2c30");
  g.fillStyle = ground;
  g.fillRect(0, horizon, W, H - horizon);
  for (let row = 0; row < 9; row++) {
    const t = row / 8;
    const y = horizon + 10 + t * t * (H - horizon - 40);
    const scale = 0.4 + t * 2.2;
    const shade = Math.round(140 - t * 85);
    for (let x = -20; x < W; ) {
      const bw = (30 + rand() * 50) * scale;
      const bh = (14 + rand() * 30) * scale;
      g.fillStyle = `rgb(${shade + 14},${shade - 6},${shade + 4})`;
      g.fillRect(x, y - bh, bw, bh + 6 * scale);
      g.fillStyle = `rgb(${shade + 30},${shade + 8},${shade + 10})`; // sunlit roof edge
      g.fillRect(x, y - bh, bw, Math.max(1, 1.5 * scale));
      for (let k = 0; k < bw * bh * 0.002; k++) {
        if (rand() < 0.6) {
          g.fillStyle = `rgba(255,${200 + rand() * 40},${120 + rand() * 60},0.8)`;
          g.fillRect(x + rand() * (bw - 3 * scale), y - bh + 3 * scale + rand() * (bh - 6 * scale), 2 * scale, 2.5 * scale);
        }
      }
      if (rand() < 0.35) {
        // a tree: a cluster of dark leaf blobs
        g.fillStyle = `rgb(${shade - 20},${shade - 28},${shade - 26})`;
        const r = (6 + rand() * 6) * scale;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + bw + r * (0.4 + rand()), y - r * (0.6 + rand() * 0.8), r * (0.6 + rand() * 0.4), 0, Math.PI * 2);
          g.fill();
        }
      }
      x += bw + rand() * 14 * scale;
    }
  }
  g.strokeStyle = "rgba(20,14,12,0.7)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, horizon - 220);
  g.quadraticCurveTo(W * 0.5, horizon - 140, W, horizon - 240);
  g.stroke();

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
