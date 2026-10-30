// The room around the computer: a steel desk, a plaster wall with a window onto a 1980s Dallas
// skyline at night, venetian blinds, a floor. Loaded alongside the computer.
// Desk model and textures: Poly Haven (CC0). The skyline is drawn here, in code.
import {
  Box3,
  BoxGeometry,
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
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type RoomAssets = { desk: Group | null; floor: Texture | null };

/** What the props need to know about the room. Desk top is y = 0; the wall faces +z. */
export type Room = {
  windowCenter: Vector3;
  wallZ: number;
  floorY: number;
  /** The window opening in the wall, in world x/y. */
  window: { x0: number; x1: number; y0: number; y1: number };
  /** Desk top extents in world space. */
  desk: { minX: number; maxX: number; backZ: number; frontZ: number };
};

const PAINT = "#e8e0cc";

export async function loadRoom(loader: GLTFLoader): Promise<RoomAssets> {
  const tex = new TextureLoader();
  const get = (url: string) => tex.loadAsync(url).catch(() => null);
  const [desk, floor] = await Promise.all([
    loader.loadAsync("/models/desk.glb").then((g) => g.scene, () => null),
    get("/textures/floor_diff.webp"),
  ]);
  return { desk, floor };
}

function tile(t: Texture | null, x: number, y: number, srgb = true) {
  if (!t) return null;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(x, y);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

const box = (w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

export function buildRoom(scene: Scene, assets: RoomAssets, computer: Box3): Room {
  // ── the desk: a 2 m steel tanker desk, top at y = 0, the computer towards its left ─────────
  let deskBox: Box3;
  if (assets.desk) {
    const desk = assets.desk;
    desk.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) (mesh.material as MeshStandardMaterial).color.set("#d9ccb0"); // putty-coloured steel
    });
    const b = new Box3().setFromObject(desk);
    desk.position.set(0.12 - (b.min.x + b.max.x) / 2, -b.max.y, computer.min.z - 0.1 - b.min.z);
    scene.add(desk);
    deskBox = new Box3().setFromObject(desk);
  } else {
    const top = box(2, 0.04, 0.95, new MeshStandardMaterial({ color: "#7a6a55", roughness: 0.6 }), 0.12, -0.02, computer.min.z - 0.1 + 0.475);
    scene.add(top);
    deskBox = new Box3().setFromObject(top);
    deskBox.min.y = -0.79;
  }
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
  const win = { x0: 0.5, x1: 1.4, y0: 0.2, y1: 1.2 };
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
    // casing on the wall face
    box(w + casing * 2, casing, 0.02, paint, cx, win.y1 + casing / 2, wallZ + 0.01),
    box(casing, h, 0.02, paint, win.x0 - casing / 2, cy, wallZ + 0.01),
    box(casing, h, 0.02, paint, win.x1 + casing / 2, cy, wallZ + 0.01),
    // jambs, so the wall has thickness
    box(w, 0.01, depth, paint, cx, win.y1 - 0.005, wallZ - depth / 2),
    box(0.01, h, depth, paint, win.x0 + 0.005, cy, wallZ - depth / 2),
    box(0.01, h, depth, paint, win.x1 - 0.005, cy, wallZ - depth / 2),
    box(w, 0.01, depth, paint, cx, win.y0 + 0.005, wallZ - depth / 2),
    // the sash: a meeting rail and a frame at the glass line
    box(w, 0.035, 0.03, paint, cx, cy, wallZ - depth + 0.03),
    box(w, 0.03, 0.03, paint, cx, win.y1 - 0.025, wallZ - depth + 0.03),
    box(w, 0.03, 0.03, paint, cx, win.y0 + 0.025, wallZ - depth + 0.03),
    box(0.03, h, 0.03, paint, win.x0 + 0.025, cy, wallZ - depth + 0.03),
    box(0.03, h, 0.03, paint, win.x1 - 0.025, cy, wallZ - depth + 0.03),
    // sill
    box(w + 0.16, 0.025, 0.07, paint, cx, win.y0 - 0.0125, wallZ + 0.03),
  );
  scene.add(frame);

  // Venetian blinds, mostly down with the slats tilted open: the city's light comes through in stripes.
  const slatMat = new MeshStandardMaterial({ color: "#d9d0bd", roughness: 0.6, metalness: 0 });
  const slatW = w - 0.03;
  const bottom = win.y0 + h * 0.2;
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
  scene.add(
    slats,
    box(slatW + 0.01, 0.03, 0.035, slatMat, cx, win.y1 - 0.02, wallZ - 0.035), // headrail
    box(slatW, 0.012, 0.03, slatMat, cx, bottom - pitch, wallZ - 0.035), // bottom rail
  );
  const cord = new MeshStandardMaterial({ color: "#d8ceb6", roughness: 0.9 });
  for (const x of [cx - slatW * 0.3, cx + slatW * 0.3]) scene.add(box(0.002, win.y1 - bottom, 0.002, cord, x, (win.y1 + bottom) / 2 - 0.02, wallZ - 0.022));
  scene.add(box(0.003, 0.42, 0.003, cord, win.x1 - 0.06, win.y1 - 0.25, wallZ - 0.02)); // pull cord

  // ── outside: Dallas, 2 AM ───────────────────────────────────────────────────────────────
  // A high floor, looking out and a little down: the painted horizon (55% down the canvas) sits in
  // the lower half of the window, and the city spreads out below it.
  const view = new Mesh(new PlaneGeometry(5.5, 4.3), new MeshBasicMaterial({ map: skyline(), fog: false, toneMapped: false }));
  view.position.set(cx + 0.2, win.y0 - 0.28 + 4.3 * 0.05, wallZ - 2.2);
  scene.add(view);

  // The night outside: a cool, dim wash from the moon and the city, through the window only. The
  // wall casts a shadow, so it lands as a window-shaped patch on the desk, striped by the blinds.
  // Its shadow map is drawn once (and again when something moves), never per frame; see desk.ts.
  const sun = new DirectionalLight("#6f8fc7", 0.55);
  sun.position.set(cx + 1.5, cy + 0.75, wallZ - 2.2);
  sun.target.position.set(-0.2, 0, computer.max.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
  // wall (from behind, so both sides). The painted view outside stays out of it.
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh === view || (mesh.material as MeshStandardMaterial).transparent) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  (wall.material as MeshStandardMaterial).shadowSide = DoubleSide;

  return {
    windowCenter: new Vector3(cx, cy, wallZ - depth),
    wallZ,
    floorY,
    window: win,
    desk: { minX: deskBox.min.x, maxX: deskBox.max.x, backZ: deskBox.min.z, frontZ: deskBox.max.z },
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
function skyline(): CanvasTexture {
  const W = 2048;
  const H = 1600;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
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
    g.shadowBlur = 12;
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
    g.shadowBlur = 14;
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
  g.shadowBlur = 8;
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
