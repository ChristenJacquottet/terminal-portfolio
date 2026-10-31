// Living details on the desk and in the lab corner: the PVM's green-phosphor status tube,
// place postcards pinned around the world map, period paper artifacts from published case
// studies, and small status LEDs on the rack switch.
import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Group,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Object3D,
} from "three";
import { HOST } from "./content";
import { PLACES } from "./interact";

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { ctx, texture };
}

const two = (n: number) => String(n).padStart(2, "0");

function formatClock(now: Date) {
  return `${two(now.getHours())}:${two(now.getMinutes())}`;
}

function formatUptime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${two(m)}m` : `${m}m`;
}

function drawPvmStatus(g: CanvasRenderingContext2D, now: Date, upMins: number) {
  const W = g.canvas.width;
  const H = g.canvas.height;

  // Deep P1 phosphor glass base with a soft centre bloom.
  g.fillStyle = "#040b06";
  g.fillRect(0, 0, W, H);
  const bloom = g.createRadialGradient(W * 0.5, H * 0.48, 24, W * 0.5, H * 0.5, W * 0.62);
  bloom.addColorStop(0, "#0c2413");
  bloom.addColorStop(0.7, "#06140a");
  bloom.addColorStop(1, "#020703");
  g.fillStyle = bloom;
  g.fillRect(0, 0, W, H);

  const bright = "#72f592";
  const mid = "#46b965";
  const dim = "#236236";
  const mono = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

  g.save();
  g.textBaseline = "alphabetic";

  // Top bar: hostname + wall-clock time.
  g.shadowColor = "rgba(100, 245, 140, 0.45)";
  g.shadowBlur = 7;
  g.fillStyle = bright;
  g.font = `bold 27px ${mono}`;
  g.textAlign = "left";
  g.fillText(HOST, 36, 52);

  g.textAlign = "right";
  g.font = `bold 26px ${mono}`;
  g.fillText(formatClock(now), W - 36, 52);

  // Uptime line + phosphor rule.
  g.shadowBlur = 0;
  g.textAlign = "left";
  g.fillStyle = mid;
  g.font = `20px ${mono}`;
  g.fillText(`up ${formatUptime(upMins)}`, 36, 82);

  g.fillStyle = dim;
  g.fillRect(36, 98, W - 72, 2);

  // Service lines.
  const services: [string, string, boolean][] = [
    ["terminal", "up", true],
    ["desk", "up", true],
    ["coffee", "low", false],
  ];
  services.forEach(([name, state, ok], i) => {
    const y = 138 + i * 38;
    g.shadowBlur = ok ? 5 : 0;
    g.fillStyle = ok ? bright : mid;
    g.beginPath();
    g.arc(46, y - 7, 4.5, 0, Math.PI * 2);
    g.fill();

    g.shadowBlur = 4;
    g.fillStyle = bright;
    g.font = `23px ${mono}`;
    const prefix = name.padEnd(10, " ");
    g.fillText(prefix + state, 66, y);

    if (!ok) {
      // Subtle monochrome phosphor bracket box around "low".
      const sx = 66 + g.measureText(prefix).width;
      const sw = g.measureText(state).width;
      g.shadowBlur = 0;
      g.strokeStyle = mid;
      g.lineWidth = 1.5;
      g.strokeRect(Math.round(sx - 7), y - 21, Math.round(sw + 14), 27);
    }
  });

  g.shadowBlur = 0;
  g.fillStyle = dim;
  g.fillRect(36, 236, W - 72, 2);

  // Small bar meters across the bottom of the status page.
  const meters: [string, number][] = [
    ["cpu", 0.34],
    ["mem", 0.58],
    ["nas", 0.72],
  ];
  const barX = 112;
  const barW = 278;
  const cells = 16;
  const step = barW / cells;
  meters.forEach(([label, fill], i) => {
    const y = 274 + i * 34;
    g.fillStyle = mid;
    g.font = `20px ${mono}`;
    g.textAlign = "left";
    g.fillText(label, 36, y);

    const lit = Math.round(fill * cells);
    for (let c = 0; c < cells; c++) {
      g.fillStyle = c < lit ? bright : "#13361e";
      g.fillRect(barX + c * step, y - 15, step - 3, 16);
    }

    g.fillStyle = mid;
    g.textAlign = "right";
    g.fillText(`${Math.round(fill * 100)}%`, W - 36, y);
  });
  g.restore();

  // Horizontal Trinitron aperture-grille scanlines.
  g.fillStyle = "rgba(0, 0, 0, 0.24)";
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

  // Curved-glass corner vignette + soft upper-left reflection arc.
  const edge = g.createRadialGradient(W * 0.5, H * 0.5, W * 0.34, W * 0.5, H * 0.5, W * 0.68);
  edge.addColorStop(0, "rgba(0, 0, 0, 0)");
  edge.addColorStop(0.78, "rgba(0, 0, 0, 0.16)");
  edge.addColorStop(1, "rgba(0, 0, 0, 0.72)");
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);

  g.strokeStyle = "rgba(180, 255, 205, 0.06)";
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(28, 86);
  g.quadraticCurveTo(34, 28, 128, 24);
  g.stroke();
}

/**
 * Measures the recessed Trinitron glass on the Sony PVM (`crt`), fits a gently bulged phosphor
 * plane to the tube, and redraws its status page at most once a minute while the desk is visible.
 */
export function fitCrtScreen(crt: Object3D, onChange: () => void) {
  crt.updateMatrixWorld(true);
  let front: Mesh | undefined;
  crt.traverse((o) => {
    const m = o as Mesh;
    const tag = `${m.name} ${(m.material as MeshStandardMaterial | undefined)?.name ?? ""}`;
    if (!front && m.isMesh && /crt_front/i.test(tag)) front = m;
  });
  if (!front) return;

  const pos = front.geometry.getAttribute("position");
  const nrm = front.geometry.getAttribute("normal");
  if (!pos || !nrm) return;

  const toLocal = crt.matrixWorld.clone().invert().multiply(front.matrixWorld);
  const normalMat = new Matrix3().getNormalMatrix(toLocal);

  let fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity, fMaxY = -Infinity, fMaxZ = -Infinity;
  const all: { p: Vector3; nz: number }[] = [];
  for (let i = 0; i < pos.count; i++) {
    const p = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(toLocal);
    const n = new Vector3().fromBufferAttribute(nrm, i).applyMatrix3(normalMat).normalize();
    fMinX = Math.min(fMinX, p.x); fMaxX = Math.max(fMaxX, p.x);
    fMinY = Math.min(fMinY, p.y); fMaxY = Math.max(fMaxY, p.y);
    fMaxZ = Math.max(fMaxZ, p.z);
    all.push({ p, nz: n.z });
  }

  const fw = fMaxX - fMinX;
  const fh = fMaxY - fMinY;
  const fcx = (fMinX + fMaxX) / 2;

  // Forward-facing vertices recessed inside the upper bezel window are the CRT tube glass.
  const glass = all
    .filter(({ p, nz }) =>
      nz > 0.85 &&
      p.y > fMinY + fh * 0.24 &&
      p.y < fMinY + fh * 0.9 &&
      Math.abs(p.x - fcx) < fw * 0.41 &&
      p.z < fMaxZ - 0.004 &&
      p.z > fMaxZ - 0.025,
    )
    .map(({ p }) => p);
  if (glass.length < 8) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of glass) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfW = (maxX - minX) / 2;
  const halfH = (maxY - minY) / 2;
  if (halfW <= 0 || halfH <= 0) return;

  // Fit cylindrical/biquadratic tube bulge from the measured crown and edge vertices.
  const xEdges = glass.filter((p) => Math.abs(p.x - cx) > halfW * 0.72 && Math.abs(p.y - cy) < halfH * 0.55);
  const yEdges = glass.filter((p) => Math.abs(p.y - cy) > halfH * 0.72 && Math.abs(p.x - cx) < halfW * 0.35);
  const fitDrop = (pts: Vector3[], axis: "x" | "y") => {
    if (!pts.length) return axis === "x" ? 0.011 : 0.001;
    let sum = 0;
    for (const p of pts) {
      const u = axis === "x" ? (p.x - cx) / halfW : (p.y - cy) / halfH;
      sum += (maxZ - p.z) / Math.max(0.25, u * u);
    }
    return Math.max(0, sum / pts.length);
  };
  const bulgeX = fitDrop(xEdges, "x");
  const bulgeY = fitDrop(yEdges, "y");
  const zCurve = (u: number, v: number) => maxZ - bulgeX * u * u - bulgeY * v * v;

  let residual = 0;
  for (const p of glass) {
    residual = Math.max(residual, p.z - zCurve((p.x - cx) / halfW, (p.y - cy) / halfH));
  }
  const clearance = residual + 0.0011;

  const w = halfW * 2 * 0.99;
  const h = halfH * 2 * 0.99;
  const geo = new PlaneGeometry(w, h, 16, 12);
  const gPos = geo.getAttribute("position");
  for (let i = 0; i < gPos.count; i++) {
    const lx = gPos.getX(i);
    const ly = gPos.getY(i);
    const u = lx / halfW;
    const v = ly / halfH;
    gPos.setXYZ(i, cx + lx, cy + ly, zCurve(u, v) + clearance);
  }
  geo.computeVertexNormals();

  const { ctx, texture } = makeCanvas(512, 384);
  const started = performance.now();
  const stateNow = () => {
    const now = new Date();
    const upMins = Math.floor((performance.now() - started) / 60_000);
    return { now, upMins, key: `${formatClock(now)}|${upMins}` };
  };

  let lastDraw = performance.now();
  let lastKey = "";
  const paint = () => {
    const { now, upMins, key } = stateNow();
    drawPvmStatus(ctx, now, upMins);
    texture.needsUpdate = true;
    lastDraw = performance.now();
    lastKey = key;
  };
  paint();

  const material = new MeshStandardMaterial({
    name: "pvm_light",
    color: "#061108",
    map: texture,
    emissive: "#ffffff",
    emissiveMap: texture,
    emissiveIntensity: 0.92,
    roughness: 0.24,
    metalness: 0.04,
  });
  const screen = new Mesh(geo, material);
  screen.name = "crt-screen";
  screen.castShadow = false;
  screen.receiveShadow = false;
  crt.add(screen);

  const deskEl = document.getElementById("desk");
  const deskShowing = () => !document.hidden && Boolean(deskEl && !deskEl.hidden);
  const maybeUpdate = () => {
    if (!deskShowing()) return;
    if (performance.now() - lastDraw < 60_000) return;
    if (stateNow().key === lastKey) return;
    paint();
    onChange();
  };

  window.setInterval(maybeUpdate, 60_000);
  document.addEventListener("visibilitychange", maybeUpdate);
  if (deskEl) new MutationObserver(maybeUpdate).observe(deskEl, { attributes: true, attributeFilter: ["hidden"] });
}

// ── geometry merge helper (keeps strings, pins and LED quads in single draw calls) ─────────

export function mergeGeos(geos: BufferGeometry[]): BufferGeometry {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new BufferGeometry();
  for (const attr of ["position", "normal", "uv", "color"] as const) {
    if (!flat.every((g) => Boolean(g.getAttribute(attr)))) continue;
    const itemSize = flat[0].getAttribute(attr).itemSize;
    const total = flat.reduce((n, g) => n + g.getAttribute(attr).count * itemSize, 0);
    const data = new Float32Array(total);
    let offset = 0;
    for (const g of flat) {
      const a = g.getAttribute(attr);
      for (let i = 0; i < a.count; i++) {
        for (let k = 0; k < itemSize; k++) data[offset++] = a.array[i * itemSize + k];
      }
    }
    out.setAttribute(attr, new Float32BufferAttribute(data, itemSize));
  }
  return out;
}

// ── postcards around the world map (Miller projection from scripts/world-map.mjs) ──────────

const MAP_W_PX = 4096;
const MAP_H_PX = 2048;
const MAP_TITLE_H = 114;
const MAP_BODY_H = MAP_H_PX - MAP_TITLE_H;
const LAT_NORTH = 84;
const LAT_SOUTH = -80;
const WALL_MAP_W = 1.12;
const WALL_MAP_H = 0.56;

const millerY = (phi: number) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi));
const MILLER_NORTH = millerY((LAT_NORTH * Math.PI) / 180);
const MILLER_SOUTH = millerY((LAT_SOUTH * Math.PI) / 180);

/** Projects `(lon, lat)` in degrees onto the `1.12 × 0.56 m` wall map's local `(x, y)`. */
export function projectMillerMap(lon: number, lat: number): [number, number] {
  const px = ((lon + 180) / 360) * MAP_W_PX;
  const clamped = Math.max(-89.9, Math.min(89.9, lat));
  const py = MAP_TITLE_H + ((MILLER_NORTH - millerY((clamped * Math.PI) / 180)) / (MILLER_NORTH - MILLER_SOUTH)) * MAP_BODY_H;
  const x = (px / MAP_W_PX - 0.5) * WALL_MAP_W;
  const y = (0.5 - py / MAP_H_PX) * WALL_MAP_H;
  return [x, y];
}

type PlaceCard = {
  place: string;
  lon: number;
  lat: number;
  cx: number;
  cy: number;
  rot: number;
  paint: (c: CanvasRenderingContext2D) => void;
};

const PLACE_CARDS: PlaceCard[] = [
  {
    place: "LA RÉUNION",
    lon: 55.53,
    lat: -21.11,
    cx: 0.395,
    cy: -0.246,
    rot: -0.05,
    paint: (c) => {
      c.fillStyle = "#8ccbe0"; c.fillRect(0, 0, 220, 100);
      c.fillStyle = "#4c6b43"; c.beginPath(); c.moveTo(0, 100); c.lineTo(70, 30); c.lineTo(110, 55); c.lineTo(150, 20); c.lineTo(220, 100); c.fill();
      c.fillStyle = "#2b6f95"; c.fillRect(0, 100, 220, 40);
    },
  },
  {
    place: "GUYANE",
    lon: -53.2,
    lat: 3.95,
    cx: -0.373,
    cy: -0.246,
    rot: 0.05,
    paint: (c) => {
      c.fillStyle = "#cfe8d0"; c.fillRect(0, 0, 220, 140);
      c.fillStyle = "#2f6b3a"; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(10 + i * 16, 110 - (i % 3) * 8, 22, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = "#f2f2f2"; c.fillRect(150, 20, 12, 70); c.beginPath(); c.moveTo(150, 20); c.lineTo(156, 4); c.lineTo(162, 20); c.fill();
    },
  },
  {
    place: "NORMANDIE",
    lon: -0.85,
    lat: 49.15,
    cx: 0.195,
    cy: 0.262,
    rot: -0.04,
    paint: (c) => {
      c.fillStyle = "#c7d6e2"; c.fillRect(0, 0, 220, 140);
      c.fillStyle = "#e8e4d6"; c.beginPath(); c.moveTo(0, 30); c.lineTo(120, 40); c.lineTo(140, 100); c.lineTo(110, 100); c.lineTo(100, 70); c.lineTo(80, 140); c.lineTo(0, 140); c.fill();
      c.fillStyle = "#5f8aa3"; c.fillRect(0, 115, 220, 25);
    },
  },
  {
    place: "INDIANA",
    lon: -85.5,
    lat: 40.48,
    cx: -0.335,
    cy: 0.258,
    rot: -0.04,
    paint: (c) => {
      c.fillStyle = "#bcdcf0"; c.fillRect(0, 0, 220, 140);
      c.fillStyle = "#d8b24a"; c.fillRect(0, 80, 220, 60);
      c.fillStyle = "#a83a2c"; c.fillRect(120, 45, 60, 45); c.beginPath(); c.moveTo(115, 45); c.lineTo(150, 20); c.lineTo(185, 45); c.fill();
    },
  },
  {
    place: "LONDON",
    lon: -0.13,
    lat: 51.51,
    cx: -0.16,
    cy: 0.262,
    rot: 0.04,
    paint: (c) => {
      c.fillStyle = "#cfd4d8"; c.fillRect(0, 0, 220, 140);
      c.fillStyle = "#7a6a52"; c.fillRect(95, 20, 30, 120); c.beginPath(); c.moveTo(95, 20); c.lineTo(110, 0); c.lineTo(125, 20); c.fill();
      c.fillStyle = "#f2efe4"; c.beginPath(); c.arc(110, 45, 10, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#c8312a"; c.fillRect(20, 105, 60, 30);
    },
  },
  {
    place: "DALLAS",
    lon: -96.8,
    lat: 32.78,
    cx: -0.45,
    cy: 0.035,
    rot: -0.05,
    paint: (c) => {
      const sky = c.createLinearGradient(0, 0, 0, 140); sky.addColorStop(0, "#f3a65f"); sky.addColorStop(1, "#f7dca0");
      c.fillStyle = sky; c.fillRect(0, 0, 220, 140);
      c.fillStyle = "#2d2a35"; [[20, 60], [50, 40], [80, 75], [130, 50], [165, 30], [195, 65]].forEach(([x, top]) => c.fillRect(x, top, 24, 140 - top));
      c.fillRect(108, 30, 5, 110); c.beginPath(); c.arc(110, 28, 12, 0, Math.PI * 2); c.fill();
    },
  },
];

function postcardTexture(card: PlaceCard): CanvasTexture {
  const { ctx: g, texture } = makeCanvas(256, 192);
  g.save();
  g.scale(256 / 240, 192 / 180);
  g.fillStyle = "#f4ede0";
  g.fillRect(0, 0, 240, 180);
  g.strokeStyle = "rgba(74, 54, 38, 0.25)";
  g.lineWidth = 2;
  g.strokeRect(1, 1, 238, 178);

  g.save();
  g.translate(10, 10);
  g.beginPath();
  g.rect(0, 0, 220, 140);
  g.clip();
  card.paint(g);
  g.restore();

  g.strokeStyle = "rgba(54, 46, 39, 0.18)";
  g.lineWidth = 1;
  g.strokeRect(10, 10, 220, 140);

  g.fillStyle = "#2c2a30";
  g.font = "bold 19px Georgia, 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText(card.place, 120, 170);
  g.restore();
  return texture;
}

/**
 * Pins the six place postcards around the world map's edges (attached after `hang()` so the
 * `1.12 × 0.56 m` map keeps its exact scale), connecting each postcard pin to its place on the map.
 */
export function addMapPostcards(mapHolder: Object3D) {
  const cardW = 0.116;
  const cardH = 0.087;
  const pinOffsetY = 0.035;
  const cardGeo = new PlaneGeometry(cardW, cardH);
  const cardPinGeo = new SphereGeometry(0.0038, 10, 8);
  const pinMat = new MeshStandardMaterial({ color: "#b8412c", roughness: 0.42 });
  const stringMat = new MeshStandardMaterial({ color: "#b8412c", roughness: 0.85 });

  const mapPins: BufferGeometry[] = [];
  const strings: BufferGeometry[] = [];

  for (const card of PLACE_CARDS) {
    const pinX = card.cx;
    const pinY = card.cy + pinOffsetY;
    const [mapX, mapY] = projectMillerMap(card.lon, card.lat);

    // Pivot at the push-pin so clicking a postcard swings it gently on its pin.
    const group = new Group();
    group.name = `postcard:${card.place.toLowerCase()}`;
    group.position.set(pinX, pinY, 0.0048);
    group.rotation.z = card.rot;
    group.userData.hotspot = {
      kind: "swing",
      label: card.place,
      hint: PLACES[card.place] ?? "home, once",
    };

    const sheet = new Mesh(cardGeo, new MeshStandardMaterial({ map: postcardTexture(card), roughness: 0.9 }));
    sheet.position.set(0, -pinOffsetY, 0);
    const cardPin = new Mesh(cardPinGeo, pinMat);
    cardPin.position.set(0, 0, 0.0028);
    group.add(sheet, cardPin);
    mapHolder.add(group);

    // Pin on the map at the Miller-projected coordinates.
    const placePin = new SphereGeometry(0.0033, 10, 8);
    placePin.translate(mapX, mapY, 0.0038);
    mapPins.push(placePin);

    // Red twine with a gentle gravity sag between the two pins.
    const dist = Math.hypot(mapX - pinX, mapY - pinY);
    const sag = Math.min(0.016, dist * 0.06);
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const k = 4 * t * (1 - t);
      return new Vector3(
        pinX + (mapX - pinX) * t,
        pinY + (mapY - pinY) * t - sag * k,
        0.0056 + (0.0038 - 0.0056) * t + 0.001 * k,
      );
    });
    strings.push(new TubeGeometry(new CatmullRomCurve3(pts), 14, 0.00095, 5, false));
  }

  const pinsMesh = new Mesh(mergeGeos(mapPins), pinMat);
  pinsMesh.raycast = () => {};
  const stringsMesh = new Mesh(mergeGeos(strings), stringMat);
  stringsMesh.raycast = () => {};
  mapHolder.add(pinsMesh, stringsMesh);
}
