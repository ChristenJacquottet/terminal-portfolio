// Living details on the desk and in the lab corner: the PVM's green-phosphor status tube,
// place postcards pinned around the world map, period paper artifacts from published case
// studies, and small status LEDs on the rack switch.
import {
  CanvasTexture,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from "three";
import { HOST } from "./content";

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
