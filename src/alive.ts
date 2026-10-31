// Living details on the desk and in the lab corner: the PVM's green-phosphor status tube,
// place postcards pinned around the world map, period paper artifacts from published case
// studies, and small status LEDs on the rack switch.
import {
  AdditiveBlending,
  Box3,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Object3D,
} from "three";
import { HOST, fileName, projects } from "./content";
import { display, findFile } from "./fs";
import { PLACES, type Hotspot } from "./interact";

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

// ── published portfolio story papers (one opaque material per paper prop) ──────────────────

const PAPER_DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

function storySpot(slug: string, label: string, shortHint: string): Hotspot {
  const project = projects.find((p) => p.slug === slug);
  const found = findFile(project ? fileName(project) : slug);
  return {
    kind: "paper",
    label,
    hint: `${shortHint} · read it`,
    nav: true,
    command: found ? `cat ${display(found.path)}` : "projects",
  };
}

/** Gently bowed desk sheet (horizontal in X/Z, resting at y = 0 with subtle curl/crease). */
function deskSheetGeo(w: number, d: number, segX: number, segZ: number, heightAt: (u: number, v: number) => number) {
  const geo = new PlaneGeometry(w, d, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (w / 2); // -1..1
    const v = pos.getZ(i) / (d / 2); // -1..1
    pos.setY(i, Math.max(0, heightAt(u, v)));
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * 1. Fanfold green-bar tractor printout of the RAG Crawler workflow:
 *    `pages → clean text → chunks` (`rag-crawler`, public portfolio).
 */
export function crawlerPrintout(): Mesh {
  const W = 512;
  const H = 640;
  const { ctx: g, texture } = makeCanvas(W, H);

  g.fillStyle = "#efe7d3";
  g.fillRect(0, 0, W, H);

  // Classic 1/2" green-bar fanfold bands between the sprocket margins.
  for (let y = 22; y < H - 16; y += 36) {
    g.fillStyle = "rgba(108, 158, 122, 0.22)";
    g.fillRect(42, y, W - 84, 18);
  }

  // Tractor-feed perforated margins + pinholes on left and right.
  g.strokeStyle = "rgba(90, 74, 56, 0.35)";
  g.lineWidth = 1.5;
  g.setLineDash([6, 5]);
  for (const mx of [40, W - 40]) {
    g.beginPath();
    g.moveTo(mx, 0);
    g.lineTo(mx, H);
    g.stroke();
  }
  // Middle fanfold perforation crease.
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  g.stroke();
  g.setLineDash([]);

  for (let y = 20; y < H; y += 32) {
    for (const hx of [20, W - 20]) {
      g.fillStyle = "#3a281b";
      g.beginPath();
      g.arc(hx, y, 5.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(70, 56, 42, 0.35)";
      g.lineWidth = 1;
      g.stroke();
    }
  }

  const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
  g.fillStyle = "#2b2520";
  g.font = `bold 20px ${mono}`;
  g.fillText("RAG-CRAWLER // CLI PIPELINE", 58, 54);
  g.font = `14px ${mono}`;
  g.fillStyle = "rgba(43, 37, 32, 0.72)";
  g.fillText("JOB 01  CRAWL -> CONVERT -> CHUNK", 58, 78);

  // Three-step dot-matrix workflow boxes across the top fanfold leaf.
  const stages: [string, string, string][] = [
    ["1. PAGES", "crawl urls", "<html>..."],
    ["2. CLEAN TEXT", "strip chrome", "# markdown"],
    ["3. CHUNKS", "measure & cut", "512..1024t"],
  ];
  stages.forEach(([title, sub1, sub2], i) => {
    const bx = 56;
    const by = 104 + i * 158;
    const bw = W - 112;
    const bh = 112;

    g.fillStyle = "rgba(239, 231, 211, 0.9)";
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = "#2f2924";
    g.lineWidth = 2.5;
    g.strokeRect(bx, by, bw, bh);

    // Accent step tag
    g.fillStyle = i === 0 ? "#3f5f8c" : i === 1 ? "#2f6f6b" : "#b8412c";
    g.fillRect(bx, by, 10, bh);

    g.fillStyle = "#241f1b";
    g.font = `bold 24px ${mono}`;
    g.fillText(title, bx + 24, by + 38);
    g.font = `17px ${mono}`;
    g.fillStyle = "rgba(36, 31, 27, 0.82)";
    g.fillText(sub1, bx + 24, by + 68);
    g.fillStyle = "rgba(36, 31, 27, 0.65)";
    g.fillText(sub2, bx + 24, by + 94);

    // Visual token/text mini-bars on the right of each box
    const rx = bx + bw - 142;
    if (i === 0) {
      g.strokeStyle = "rgba(47, 41, 36, 0.6)";
      g.lineWidth = 2;
      for (let r = 0; r < 3; r++) g.strokeRect(rx + r * 10, by + 22 + r * 8, 96, 56);
    } else if (i === 1) {
      g.fillStyle = "rgba(47, 111, 107, 0.75)";
      for (let r = 0; r < 5; r++) g.fillRect(rx, by + 24 + r * 14, r === 4 ? 72 : 116, 6);
    } else {
      g.fillStyle = "rgba(184, 65, 44, 0.8)";
      for (let r = 0; r < 3; r++) {
        g.strokeStyle = "#2f2924";
        g.lineWidth = 1.8;
        g.strokeRect(rx, by + 20 + r * 26, 116, 19);
        g.fillRect(rx + 3, by + 23 + r * 26, 84 - r * 14, 13);
      }
    }

    // Downward arrow between stages ("pages → clean text → chunks")
    if (i < 2) {
      const ax = W / 2;
      const ay0 = by + bh + 6;
      const ay1 = ay0 + 34;
      g.strokeStyle = "#241f1b";
      g.fillStyle = "#241f1b";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ax, ay0);
      g.lineTo(ax, ay1 - 7);
      g.stroke();
      g.beginPath();
      g.moveTo(ax - 9, ay1 - 10);
      g.lineTo(ax + 9, ay1 - 10);
      g.lineTo(ax, ay1 + 2);
      g.closePath();
      g.fill();
    }
  });

  g.fillStyle = "#241f1b";
  g.font = `bold 16px ${mono}`;
  g.fillText("pages -> clean text -> chunks", 58, H - 30);

  // Accordion fanfold ridge across the middle perforation so light catches the fold.
  const geo = deskSheetGeo(0.156, 0.195, 4, 12, (_u, v) => {
    const ridge = Math.max(0, 1 - Math.abs(v) * 1.45) * 0.0038;
    const lip = Math.max(0, Math.abs(v) - 0.85) * 0.004;
    return ridge + lip;
  });
  const mesh = new Mesh(geo, new MeshStandardMaterial({ map: texture, roughness: 0.9, ...PAPER_DECAL }));
  mesh.userData.hotspot = storySpot("rag-crawler", "I built a crawler to get my own experiments unstuck", "RAG Crawler");
  return mesh;
}

/**
 * 2. Technical room-block diagram pinned over a dot-matrix coordinate printout
 *    (`lerma-hq`, public portfolio). Built as two overlapping 3D sheets + pin in one mesh & one material.
 */
export function converterPinout(): Mesh {
  const { ctx: g, texture } = makeCanvas(512, 512);
  const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

  // Clear background; left half [0..264] = dot-matrix coordinate printout, right half [268..512] = block plan + red pin swatch.
  g.fillStyle = "#efe6d0";
  g.fillRect(0, 0, 264, 512);
  for (let y = 24; y < 500; y += 32) {
    g.fillStyle = "rgba(108, 158, 122, 0.22)";
    g.fillRect(22, y, 220, 16);
  }
  for (let y = 18; y < 504; y += 28) {
    for (const hx of [10, 254]) {
      g.fillStyle = "#5a3a28";
      g.beginPath();
      g.arc(hx, y, 3.8, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = "#27221d";
  g.font = `bold 15px ${mono}`;
  g.fillText("SPLIT_EXPORT.LST", 28, 42);
  g.font = `12px ${mono}`;
  g.fillStyle = "#b8412c";
  g.fillText("PARTS: 10,248  POS: OK", 28, 62);
  g.fillStyle = "#27221d";
  g.fillText("ID     X      Y      Z", 28, 88);
  g.fillRect(28, 94, 206, 1.5);
  const coords = [
    "0001  -14.2   0.0   08.4",
    "0002  -12.0   0.0   08.4",
    "0003  -09.5   3.2   08.4",
    "0004  -06.0   3.2   04.1",
    "0005  -02.4   0.0   04.1",
    "0006  +01.8   1.6   00.0",
    "0007  +04.5   1.6  -03.2",
    "0008  +08.0   0.0  -03.2",
    "0009  +11.2   4.0  -06.5",
    "0010  +14.8   4.0  -09.0",
    "....  .....   ...   ....",
    "9998  +22.4   6.5  -18.2",
    "10248 +24.0   6.5  -19.5",
  ];
  g.font = `12.5px ${mono}`;
  coords.forEach((row, i) => {
    g.fillStyle = i >= 11 ? "#241f1b" : "rgba(39, 34, 29, 0.82)";
    g.fillText(row, 28, 118 + i * 28);
  });

  // Top-right swatch [272..328, 4..60]: tomato-red push-pin colour so the merged pin shares this one material.
  g.fillStyle = "#b8412c";
  g.fillRect(272, 4, 56, 56);

  // Lower-right [272..508, 72..508]: vellum architectural drawing of a room split into numbered blocks.
  const bx = 272;
  const by = 72;
  const bw = 236;
  const bh = 436;
  g.fillStyle = "#e5ebf0";
  g.fillRect(bx, by, bw, bh);
  g.strokeStyle = "rgba(63, 95, 140, 0.22)";
  g.lineWidth = 1;
  for (let x = bx + 16; x < bx + bw; x += 20) {
    g.beginPath(); g.moveTo(x, by); g.lineTo(x, by + bh); g.stroke();
  }
  for (let y = by + 16; y < by + bh; y += 20) {
    g.beginPath(); g.moveTo(bx, y); g.lineTo(bx + bw, y); g.stroke();
  }
  g.strokeStyle = "#2b4263";
  g.lineWidth = 2.5;
  g.strokeRect(bx + 10, by + 10, bw - 20, bh - 20);

  g.fillStyle = "#1f324d";
  g.font = `bold 14px ${mono}`;
  g.fillText("HQ ROOM // BLOCK SPLIT", bx + 20, by + 34);

  // Numbered architectural room blocks (01..12) with dashed cut lines
  const cols = [0, 68, 132, 196];
  const rows = [0, 74, 152, 232, 306];
  let blockNum = 1;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const rx = bx + 20 + cols[c];
      const ry = by + 56 + rows[r];
      const rw = cols[c + 1] - cols[c] - 6;
      const rh = rows[r + 1] - rows[r] - 6;
      if (r === 1 && c === 1) {
        // Central atrium void with cross-hatch
        g.strokeStyle = "rgba(184, 65, 44, 0.7)";
        g.setLineDash([4, 3]);
        g.strokeRect(rx, ry, rw, rh);
        g.setLineDash([]);
      } else {
        g.fillStyle = "rgba(63, 95, 140, 0.12)";
        g.fillRect(rx, ry, rw, rh);
        g.strokeStyle = "#2b4263";
        g.lineWidth = 2;
        g.strokeRect(rx, ry, rw, rh);
      }
      g.fillStyle = "#1f324d";
      g.font = `bold 13px ${mono}`;
      g.fillText(String(blockNum++).padStart(2, "0"), rx + 8, ry + 22);
    }
  }
  g.fillStyle = "#b8412c";
  g.font = `bold 12.5px ${mono}`;
  g.fillText("KEEP ORIGIN (X,Y,Z)", bx + 20, by + bh - 24);

  // Helper to remap a geometry's UVs into a sub-rectangle of our single 512×512 atlas.
  const remapUV = (geo: BufferGeometry, u0: number, u1: number, v0: number, v1: number) => {
    const uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    return geo;
  };

  // Back sheet: dot-matrix coordinate listing.
  const listing = remapUV(new PlaneGeometry(0.115, 0.195), 0.004, 0.512, 0.005, 0.995);
  listing.rotateZ(0.035);
  listing.translate(-0.036, 0.004, 0.0005);

  // Front overlapping sheet: numbered room-block technical drawing.
  const blueprint = remapUV(new PlaneGeometry(0.108, 0.178), 0.5315, 0.992, 0.008, 0.859);
  blueprint.rotateZ(-0.065);
  blueprint.translate(0.036, -0.01, 0.0022);

  // Push-pin at the top overlap holding both sheets to the cork board.
  const pin = remapUV(new SphereGeometry(0.0048, 10, 8), 0.55, 0.62, 0.9, 0.98);
  pin.translate(0.004, 0.074, 0.005);

  const merged = mergeGeos([listing, blueprint, pin]);
  const mesh = new Mesh(merged, new MeshStandardMaterial({ map: texture, roughness: 0.9 }));
  mesh.userData.hotspot = storySpot("lerma-hq", "I wrote the converter when the model wouldn't fit", "LERMA/HQ");
  return mesh;
}

/**
 * 3. Darkroom contact sheet of anonymous green avocado shapes with two pencil notes:
 *    `"color?"` and `"model?"` (`avocado-ripeness-detector`, public portfolio).
 */
export function avocadoSheet(): Mesh {
  const W = 512;
  const H = 640;
  const { ctx: g, texture } = makeCanvas(W, H);

  // Warm photographic contact-print paper
  g.fillStyle = "#ece2cc";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(60, 48, 36, 0.22)";
  g.lineWidth = 2;
  g.strokeRect(4, 4, W - 8, H - 8);

  const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
  const hand = "'Bradley Hand', 'Marker Felt', 'Segoe Print', cursive";

  g.fillStyle = "#2b2622";
  g.font = `bold 16px ${mono}`;
  g.fillText("HUE / RIPENESS CONTACT TEST", 30, 38);

  // Two film strips: top row = RGB/HSV pixel sampling ("color?"), bottom row = 2-class classifier ("model?").
  const hues = [
    ["#8cb446", "#6f9838", "#577d31"],
    ["#42612b", "#314623", "#25321d"],
  ];

  for (let row = 0; row < 2; row++) {
    const sy = 64 + row * 268;
    // Black 35mm contact film strip backing
    g.fillStyle = "#1c1a18";
    g.fillRect(26, sy, W - 52, 188);

    // Film sprocket holes top & bottom
    g.fillStyle = "#ece2cc";
    for (let sx = 38; sx < W - 38; sx += 22) {
      g.fillRect(sx, sy + 7, 10, 7);
      g.fillRect(sx, sy + 174, 10, 7);
    }

    for (let col = 0; col < 3; col++) {
      const fx = 42 + col * 146;
      const fy = sy + 22;
      const fw = 132;
      const fh = 142;

      // Neutral studio frame backdrop
      g.fillStyle = "#d9d1bf";
      g.fillRect(fx, fy, fw, fh);

      // Anonymous pear-like green avocado silhouette (no brand or photo claim)
      const cx = fx + fw / 2;
      const cy = fy + fh / 2 + 8;
      g.fillStyle = hues[row][col];
      g.beginPath();
      g.ellipse(cx, cy + 12, 34, 38, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(cx, cy - 18, 23, 28, 0, 0, Math.PI * 2);
      g.fill();

      // Subtle specular highlight dot for form
      g.fillStyle = "rgba(245, 248, 225, 0.22)";
      g.beginPath();
      g.ellipse(cx - 10, cy - 16, 7, 14, -0.25, 0, Math.PI * 2);
      g.fill();

      // Frame number on film rebate
      g.fillStyle = "#d39b32";
      g.font = `11px ${mono}`;
      g.fillText(`0${row * 3 + col + 1}A`, fx + 4, sy + 18);
    }

    // Grease-pencil / graphite annotations below each strip: "color?" and "model?"
    if (row === 0) {
      // Red/orange grease-pencil circle around frame 02A + "color?"
      g.strokeStyle = "#b8412c";
      g.lineWidth = 3.5;
      g.beginPath();
      g.ellipse(42 + 146 + 66, sy + 94, 58, 62, -0.08, 0, Math.PI * 2);
      g.stroke();

      g.fillStyle = "#2c2825";
      g.font = `bold 34px ${hand}`;
      g.fillText("color?", 38, sy + 234);
      g.font = `15px ${mono}`;
      g.fillStyle = "rgba(44, 40, 37, 0.72)";
      g.fillText("pixel hue avg -> close?", 188, sy + 232);
    } else {
      // Pencil bracket + "model?"
      g.strokeStyle = "#2f6f6b";
      g.lineWidth = 3.5;
      g.strokeRect(38, sy + 18, W - 76, 150);

      g.fillStyle = "#2c2825";
      g.font = `bold 34px ${hand}`;
      g.fillText("model?", 38, sy + 236);
      g.font = `15px ${mono}`;
      g.fillStyle = "rgba(44, 40, 37, 0.72)";
      g.fillText("2-class cnn · browser cam", 192, sy + 234);
    }
  }

  const geo = deskSheetGeo(0.122, 0.152, 6, 8, (u, v) => (u * u * 0.6 + v * v * 0.4) * 0.0018);
  const mesh = new Mesh(geo, new MeshStandardMaterial({ map: texture, roughness: 0.88, ...PAPER_DECAL }));
  mesh.userData.hotspot = storySpot(
    "avocado-ripeness-detector",
    "I tried simple pixel math before I trained a model",
    "Avocado Ripeness Detector",
  );
  return mesh;
}

/**
 * 4. Three-step ruled index strip beside the rotary phone:
 *    `"listen → think → speak"` (`william-booth-ai`, public portfolio).
 */
export function voiceStrip(): Mesh {
  const W = 512;
  const H = 192;
  const { ctx: g, texture } = makeCanvas(W, H);

  g.fillStyle = "#f2e8d2";
  g.fillRect(0, 0, W, H);

  // Classic ruled index card top red rule + blue lines
  g.strokeStyle = "rgba(184, 65, 44, 0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 34);
  g.lineTo(W, 34);
  g.stroke();

  g.strokeStyle = "rgba(63, 95, 140, 0.22)";
  g.lineWidth = 1.2;
  for (let y = 66; y < H; y += 30) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  g.strokeStyle = "rgba(60, 48, 36, 0.25)";
  g.lineWidth = 2;
  g.strokeRect(2, 2, W - 4, H - 4);

  const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
  g.fillStyle = "rgba(45, 38, 32, 0.68)";
  g.font = `13px ${mono}`;
  g.fillText("VOICE LOOP // ASK & HEAR", 22, 24);

  // Three schematic boxes: listen -> think -> speak
  const steps = ["listen", "think", "speak"] as const;
  const xs = [22, 188, 354];
  const bw = 136;
  const by = 54;
  const bh = 96;

  steps.forEach((word, i) => {
    const x = xs[i];
    g.fillStyle = "rgba(247, 241, 226, 0.92)";
    g.fillRect(x, by, bw, bh);
    g.strokeStyle = "#29231e";
    g.lineWidth = 2.5;
    g.strokeRect(x, by, bw, bh);

    // Small period glyph at top of each box (waveform, archive lines, speaker waves)
    const cx = x + bw / 2;
    g.strokeStyle = i === 0 ? "#2f6f6b" : i === 1 ? "#3f5f8c" : "#b8412c";
    g.lineWidth = 2.2;
    if (i === 0) {
      g.beginPath();
      for (let k = -24; k <= 24; k += 6) {
        const amp = (1 - Math.abs(k) / 30) * 11 * (k % 12 === 0 ? 1 : -0.7);
        if (k === -24) g.moveTo(cx + k, by + 28 + amp);
        else g.lineTo(cx + k, by + 28 + amp);
      }
      g.stroke();
    } else if (i === 1) {
      for (let r = 0; r < 3; r++) {
        g.beginPath();
        g.moveTo(cx - 22, by + 19 + r * 8);
        g.lineTo(cx + (r === 2 ? 10 : 22), by + 19 + r * 8);
        g.stroke();
      }
    } else {
      g.beginPath();
      g.moveTo(cx - 14, by + 24);
      g.lineTo(cx - 6, by + 24);
      g.lineTo(cx + 2, by + 16);
      g.lineTo(cx + 2, by + 38);
      g.lineTo(cx - 6, by + 30);
      g.lineTo(cx - 14, by + 30);
      g.closePath();
      g.stroke();
      for (const r of [9, 16]) {
        g.beginPath();
        g.arc(cx + 3, by + 27, r, -0.65, 0.65);
        g.stroke();
      }
    }

    g.fillStyle = "#241e1a";
    g.font = `bold 24px ${mono}`;
    g.textAlign = "center";
    g.fillText(word, cx, by + 76);

    if (i < 2) {
      const ax0 = x + bw + 4;
      const ax1 = xs[i + 1] - 4;
      const ay = by + bh / 2;
      g.strokeStyle = "#241e1a";
      g.fillStyle = "#241e1a";
      g.lineWidth = 2.8;
      g.beginPath();
      g.moveTo(ax0, ay);
      g.lineTo(ax1 - 5, ay);
      g.stroke();
      g.beginPath();
      g.moveTo(ax1 - 8, ay - 6);
      g.lineTo(ax1, ay);
      g.lineTo(ax1 - 8, ay + 6);
      g.closePath();
      g.fill();
    }
  });

  const geo = deskSheetGeo(0.164, 0.062, 8, 4, (u) => (1 - u * u) * 0.0014);
  const mesh = new Mesh(geo, new MeshStandardMaterial({ map: texture, roughness: 0.9, ...PAPER_DECAL }));
  mesh.userData.hotspot = storySpot("william-booth-ai", "I built a voice you could ask a question", "William Booth AI");
  return mesh;
}

/**
 * 5. Hand-drawn graph-paper grid map of a tiny blocky food-pantry market with a pencil path
 *    between stalls (`minecraft-bingo-mayhem`, public portfolio; no copied game art or faces).
 */
export function pantryMap(): Mesh {
  const W = 640;
  const H = 480;
  const { ctx: g, texture } = makeCanvas(W, H);

  // Quad-ruled graph paper matching the notebook's paper stock
  g.fillStyle = "#f3eee0";
  g.fillRect(0, 0, W, H);

  const cell = 20;
  for (let x = 0; x <= W; x += cell) {
    g.strokeStyle = x % (cell * 4) === 0 ? "rgba(72, 132, 160, 0.42)" : "rgba(72, 132, 160, 0.22)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (let y = 0; y <= H; y += cell) {
    g.strokeStyle = y % (cell * 4) === 0 ? "rgba(72, 132, 160, 0.42)" : "rgba(72, 132, 160, 0.22)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  const hand = "'Bradley Hand', 'Segoe Print', 'Marker Felt', cursive";
  const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

  g.fillStyle = "rgba(38, 36, 42, 0.88)";
  g.font = `bold 24px ${hand}`;
  g.fillText("food pantry — market grid", 36, 42);

  // Outer blocky courtyard boundary aligned to grid squares
  g.strokeStyle = "rgba(48, 42, 36, 0.78)";
  g.lineWidth = 3;
  g.strokeRect(40, 60, 560, 380);
  // Entry opening at bottom-left
  g.fillStyle = "#f3eee0";
  g.fillRect(96, 434, 68, 12);

  // Blocky market stalls drawn with palette awnings (no game textures, no faces)
  const stalls: { x: number; y: number; w: number; h: number; name: string; tint: string }[] = [
    { x: 60, y: 260, w: 140, h: 80, name: "REQUESTS", tint: "#d39b32" },
    { x: 60, y: 100, w: 160, h: 100, name: "PRODUCE", tint: "#2f6f6b" },
    { x: 280, y: 100, w: 140, h: 100, name: "BREAD", tint: "#b8412c" },
    { x: 460, y: 120, w: 120, h: 120, name: "PANTRY", tint: "#5a3a28" },
    { x: 320, y: 300, w: 160, h: 100, name: "GIVE / INFO", tint: "#3f5f8c" },
  ];

  for (const s of stalls) {
    g.fillStyle = "rgba(90, 58, 40, 0.12)";
    g.fillRect(s.x + 4, s.y + 4, s.w, s.h);
    g.fillStyle = "#efe7d2";
    g.fillRect(s.x, s.y, s.w, s.h);

    // Blocky striped market awning along top 20px cell row of each stall
    for (let ax = s.x; ax < s.x + s.w; ax += cell) {
      g.fillStyle = ((ax - s.x) / cell) % 2 === 0 ? s.tint : "#f3eee0";
      g.globalAlpha = 0.72;
      g.fillRect(ax, s.y, cell, cell);
    }
    g.globalAlpha = 1;

    g.strokeStyle = "rgba(44, 38, 34, 0.85)";
    g.lineWidth = 2.4;
    g.strokeRect(s.x, s.y, s.w, s.h);

    g.fillStyle = "rgba(38, 34, 30, 0.88)";
    g.font = `bold 15px ${mono}`;
    g.textAlign = "center";
    g.fillText(s.name, s.x + s.w / 2, s.y + s.h / 2 + 12);
  }
  g.textAlign = "left";

  // Pencil path winding from ENTRY between the blocky stalls
  g.strokeStyle = "rgba(55, 52, 58, 0.82)";
  g.lineWidth = 3;
  g.setLineDash([8, 7]);
  g.beginPath();
  g.moveTo(130, 444);
  g.lineTo(130, 360);
  g.lineTo(240, 360);
  g.lineTo(240, 230);
  g.lineTo(140, 230);
  g.lineTo(140, 212);
  g.moveTo(240, 230);
  g.lineTo(350, 230);
  g.lineTo(440, 230);
  g.lineTo(440, 180);
  g.moveTo(350, 230);
  g.lineTo(350, 290);
  g.stroke();
  g.setLineDash([]);

  // Small pencil X / arrow markers at stops
  g.fillStyle = "#b8412c";
  for (const [px, py] of [[130, 350], [140, 210], [350, 210], [452, 180], [350, 292]]) {
    g.beginPath();
    g.arc(px, py, 4.5, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = "rgba(38, 36, 42, 0.85)";
  g.font = `bold 17px ${hand}`;
  g.fillText("entry ^", 104, 466);

  const geo = deskSheetGeo(0.182, 0.136, 10, 8, (u, v) => {
    const fold = Math.max(0, 1 - Math.abs(u) * 3.2) * 0.0022;
    const corner = Math.max(0, (u + 1) * 0.5 * (v + 1) * 0.5 - 0.55) * 0.004;
    return fold + corner;
  });
  const mesh = new Mesh(geo, new MeshStandardMaterial({ map: texture, roughness: 0.92, ...PAPER_DECAL }));
  mesh.userData.hotspot = storySpot(
    "minecraft-bingo-mayhem",
    "I built a little world to let people try the idea",
    "Minecraft Food Pantry",
  );
  return mesh;
}

// ── small life: tiny link/power LEDs on the home-lab rack switch ───────────────────────────

/**
 * Fits a single merged vertex-coloured LED mesh onto the front panel of the 8-port rack switch:
 * power on the left bezel plus a handful of active RJ45 link/activity tabs (static, zero idle draws).
 */
export function addSwitchLeds(sw: Object3D): void {
  sw.updateMatrixWorld(true);
  const invSw = sw.matrixWorld.clone().invert();
  const localBox = new Box3();
  const v = new Vector3();

  sw.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MeshStandardMaterial;
    if (mat?.transparent) return;
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    const toSw = invSw.clone().multiply(m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      localBox.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(toSw));
    }
  });
  if (localBox.isEmpty()) return;

  const w = localBox.max.x - localBox.min.x; // 0.24 m across the 8-port bezel
  const h = localBox.max.y - localBox.min.y; // 0.0373 m tall
  const frontZ = localBox.max.z;

  // Soft 64×64 diode glow sprite: crisp pill core with a subtle optical halo on the dark bezel.
  const { ctx: g, texture } = makeCanvas(64, 64);
  g.fillStyle = "#000000";
  g.fillRect(0, 0, 64, 64);
  const halo = g.createRadialGradient(32, 32, 3, 32, 32, 30);
  halo.addColorStop(0, "rgba(255, 255, 255, 1)");
  halo.addColorStop(0.32, "rgba(255, 255, 255, 0.88)");
  halo.addColorStop(0.62, "rgba(255, 255, 255, 0.22)");
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.roundRect(21, 23, 22, 18, 5);
  g.fill();

  // Port pitch and RJ45 shield LED lenses on the TP-Link TL-SG108E front bezel.
  const port8Center = localBox.min.x + w * 0.8495;
  const portPitch = w * 0.10225;
  const portCenter = (port1To8: number) => port8Center - (8 - port1To8) * portPitch;
  const leftTab = -w * 0.029;
  const rightTab = w * 0.029;
  const tabY = localBox.min.y + h * 0.715;

  const leds: { x: number; y: number; hex: string; sx?: number; sy?: number }[] = [
    // Left-bezel power LED inside its recessed window above "Power"
    { x: localBox.min.x + w * 0.05, y: localBox.min.y + h * 0.375, hex: "#5ce87e", sx: 0.0036, sy: 0.003 },
    // Port 1 (uplink): link + act
    { x: portCenter(1) + leftTab, y: tabY, hex: "#72f592" },
    { x: portCenter(1) + rightTab, y: tabY, hex: "#52d974" },
    // Port 2 (NAS): link
    { x: portCenter(2) + leftTab, y: tabY, hex: "#72f592" },
    // Port 5 (lab monitor / 100M): amber link
    { x: portCenter(5) + leftTab, y: tabY, hex: "#ffb845" },
    // Port 7 (desk): link + act
    { x: portCenter(7) + leftTab, y: tabY, hex: "#72f592" },
    { x: portCenter(7) + rightTab, y: tabY, hex: "#52d974" },
  ];

  const quads: BufferGeometry[] = leds.map((led) => {
    const q = new PlaneGeometry(led.sx ?? 0.0042, led.sy ?? 0.0033);
    q.translate(led.x, led.y, frontZ + 0.00045);
    const c = new Color(led.hex);
    const count = q.getAttribute("position").count;
    const cols = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    q.setAttribute("color", new Float32BufferAttribute(cols, 3));
    return q;
  });

  const merged = mergeGeos(quads);

  const mat = new MeshBasicMaterial({
    map: texture,
    vertexColors: true,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new Mesh(merged, mat);
  mesh.name = "switch_leds";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  sw.add(mesh);
}
