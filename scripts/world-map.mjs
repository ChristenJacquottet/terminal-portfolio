#!/usr/bin/env node
// Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.
//
// Renders public/textures/world-map.webp (4096×2048) and research/map/preview.png (1600×800)
// from Natural Earth 1:50m Admin-0 Countries in Robinson projection.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea, geoCentroid, geoGraticule, geoPath } from "d3-geo";
import { geoRobinson } from "d3-geo-projection";
import shapefile from "shapefile";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 4096;
const H = 2048;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? path.resolve(root, process.argv[i + 1]) : fallback;
};

const paletteFile = path.join(root, "art", "palette.json");
const deskPalette = JSON.parse(fs.readFileSync(paletteFile, "utf8")).swatches;

// Fixed map palette rooted in art/palette.json: five distinct warm pastels tinted towards cream-paper (#ece2cc).
const COLORS = {
  paper: deskPalette["cream-paper"].color, // #ece2cc
  paperLight: "#f1e8d4",
  titleBand: "#efe6d1",
  ocean: "#b8cfd6", // soft muted sea blue, warm-shifted to sit on cream paper
  oceanEdge: "#aec6ce",
  antarctica: "#f2ece0",
  pastels: [
    "#e3af96", // warm apricot-coral (tomato #b8412c + cream-paper #ece2cc)
    "#ead08f", // warm butter-ochre (mustard #d39b32 + cream-paper #ece2cc)
    "#b6ccb3", // soft sage-celadon (teal #2f6f6b + mustard + cream-paper)
    "#dab4bf", // vintage dusty rose (tomato + taylor-purple #4b2e83 + cream-paper)
    "#d8c19e", // warm fawn-buff (cork #a87a4f / beige-plastic #d6c9ab + cream-paper)
  ],
  border: "#3a322b", // warm sepia-charcoal ink (near-black + walnut)
  frame: "#352d26",
  gratOcean: "#6f8b94",
  gratMajor: "#58737c",
  gratLand: "#3a322b",
  label: "#28221c",
  labelHalo: "#efe6d2",
  oceanLabel: "#526d77",
};

const DISPLAY_NAMES = {
  USA: "United States",
  GBR: "United Kingdom",
  RUS: "Russia",
  CHN: "China",
  COD: "Dem. Rep. Congo",
  COG: "Congo",
  CAF: "Central African Rep.",
  SDS: "South Sudan",
  SAH: "W. Sahara",
  CIV: "Ivory Coast",
  CZE: "Czechia",
  BIH: "Bosnia",
  MKD: "N. Macedonia",
  ARE: "U.A.E.",
  DOM: "Dominican Rep.",
  GNQ: "Eq. Guinea",
  PNG: "Papua New Guinea",
  FLK: "Falkland Is.",
  NCL: "New Caledonia",
  SLB: "Solomon Is.",
  PRK: "North Korea",
  KOR: "South Korea",
  LAO: "Laos",
  VNM: "Vietnam",
  BHS: "Bahamas",
};

const TWO_LINE_NAMES = {
  "United Kingdom": ["United", "Kingdom"],
  "Saudi Arabia": ["Saudi", "Arabia"],
  "South Africa": ["South", "Africa"],
  "Dem. Rep. Congo": ["Dem. Rep.", "Congo"],
  "Central African Rep.": ["Central", "African Rep."],
  "South Sudan": ["South", "Sudan"],
  "Papua New Guinea": ["Papua", "New Guinea"],
  "New Zealand": ["New", "Zealand"],
  "North Korea": ["North", "Korea"],
  "South Korea": ["South", "Korea"],
  "Sri Lanka": ["Sri", "Lanka"],
  "Ivory Coast": ["Ivory", "Coast"],
  "W. Sahara": ["W.", "Sahara"],
  "Sierra Leone": ["Sierra", "Leone"],
  "Burkina Faso": ["Burkina", "Faso"],
  "Costa Rica": ["Costa", "Rica"],
  "Dominican Rep.": ["Dominican", "Rep."],
  "Puerto Rico": ["Puerto", "Rico"],
  "Falkland Is.": ["Falkland", "Is."],
  "New Caledonia": ["New", "Caledonia"],
  "Solomon Is.": ["Solomon", "Is."],
  "Fr. Guiana": ["Fr.", "Guiana"],
};

// Curated cartographic anchors [lon, lat, allowedWidthPx, targetFontSize] for major archipelagos & coastal/enclave shapes.
const CURATED_ANCHORS = {
  IDN: { coord: [117.8, -4.7], maxW: 265, fs: 18.5 },
  JPN: { coord: [139.3, 36.3], maxW: 96, fs: 15 },
  PHL: { coord: [124.6, 12.5], maxW: 115, fs: 12 },
  GBR: { coord: [-2.0, 54.2], maxW: 92, fs: 12.5 },
  IRL: { coord: [-8.5, 53.3], maxW: 74, fs: 9.8 },
  NZL: { coord: [172.8, -41.8], maxW: 96, fs: 12.5 },
  MDG: { coord: [46.7, -19.4], maxW: 102, fs: 11.5 },
  CUB: { coord: [-79.2, 21.8], maxW: 72, fs: 10.5 },
  LKA: { coord: [80.7, 7.5], maxW: 58, fs: 9.5 },
  ISL: { coord: [-18.8, 64.9], maxW: 78, fs: 11.5 },
  TWN: { coord: [121.2, 23.7], maxW: 64, fs: 9.8 },
  KOR: { coord: [127.9, 36.3], maxW: 64, fs: 9.5 },
  MYS: { coord: [109.5, 3.2], maxW: 120, fs: 12.5 },
  PNG: { coord: [145.2, -6.3], maxW: 105, fs: 11.5 },
  ZAF: { coord: [22.7, -30.8], maxW: 112, fs: 13.5 },
  MLI: { coord: [-3.2, 17.6], maxW: 110, fs: 14.5 },
  CHL: { coord: [-71.2, -35.5], maxW: 64, fs: 12 },
  NOR: { coord: [9.2, 61.2], maxW: 76, fs: 12.5 },
  VNM: { coord: [108.2, 15.6], maxW: 74, fs: 11 },
  ITA: { coord: [12.6, 42.8], maxW: 74, fs: 13.5 },
  GRC: { coord: [22.2, 39.2], maxW: 68, fs: 11 },
  PRT: { coord: [-8.6, 39.6], maxW: 74, fs: 9.8 },
  ECU: { coord: [-78.5, -1.5], maxW: 72, fs: 10 },
  URY: { coord: [-56.0, -32.8], maxW: 68, fs: 10 },
  GUY: { coord: [-59.0, 4.9], maxW: 54, fs: 8.8 },
  SUR: { coord: [-55.9, 3.8], maxW: 52, fs: 8.5 },
  KHM: { coord: [104.9, 12.7], maxW: 72, fs: 9.5 },
  FJI: { coord: [178.0, -17.8], maxW: 56, fs: 9.5 },
  FLK: { coord: [-59.2, -51.8], maxW: 68, fs: 9 },
};

const cleanStr = (v) => (typeof v === "string" ? v.replace(/\0+/g, "").trim() : "");
const escXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function resolveShapefile() {
  const explicit = arg("data", null);
  if (explicit) return explicit;
  const candidates = [
    path.join(root, "research", "map", "ne_50m_admin_0_countries_lakes.shp"),
    path.join(root, "research", "map", "ne_50m_admin_0_countries.shp"),
    path.join(root, "research", "map", "ne_110m_admin_0_countries_lakes.shp"),
    path.join(root, "research", "map", "ne_110m_admin_0_countries.shp"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      "Natural Earth shapefile not found in research/map/. See research/map/README.md for download details."
    );
  }
  return found;
}

/**
 * Assigns each country one of the 5 warm pastel colours using DSATUR graph colouring
 * with strict zero shared-border conflicts, narrow-strait separation, and land-area balancing.
 */
function colorCountries(features, areas) {
  const n = features.length;
  const k = COLORS.pastels.length;
  const vertMap = new Map();

  features.forEach((f, idx) => {
    if (!f.geometry) return;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [lon, lat] of ring) {
          const key = `${Math.round(lon * 250)},${Math.round(lat * 250)}`;
          let bucket = vertMap.get(key);
          if (!bucket) {
            bucket = new Set();
            vertMap.set(key, bucket);
          }
          bucket.add(idx);
        }
      }
    }
  });

  const adj = Array.from({ length: n }, () => new Set());
  for (const bucket of vertMap.values()) {
    if (bucket.size < 2) continue;
    const ids = [...bucket];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        adj[ids[i]].add(ids[j]);
        adj[ids[j]].add(ids[i]);
      }
    }
  }

  const bboxes = features.map((f) => {
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const [lon, lat] of poly[0]) {
        if (Math.abs(lon) > 179) continue;
        if (lon < minX) minX = lon;
        if (lon > maxX) maxX = lon;
        if (lat < minY) minY = lat;
        if (lat > maxY) maxY = lat;
      }
    }
    return [minX, minY, maxX, maxY];
  });

  const softAdj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    const [ax0, ay0, ax1, ay1] = bboxes[i];
    for (let j = i + 1; j < n; j++) {
      if (adj[i].has(j)) continue;
      const [bx0, by0, bx1, by1] = bboxes[j];
      const dx = Math.max(0, ax0 - bx1, bx0 - ax1);
      const dy = Math.max(0, ay0 - by1, by0 - ay1);
      if (dx * dx + dy * dy < 16) {
        softAdj[i].add(j);
        softAdj[j].add(i);
      }
    }
  }

  const assigned = new Array(n).fill(-1);
  const areaUsed = new Array(k).fill(0);
  const countUsed = new Array(k).fill(0);

  for (let step = 0; step < n; step++) {
    let best = -1;
    let bestSat = -1;
    let bestDeg = -1;
    let bestArea = -1;

    for (let i = 0; i < n; i++) {
      if (assigned[i] !== -1) continue;
      const adm0 = cleanStr(features[i].properties.ADM0_A3);
      if (adm0 === "ATA") {
        assigned[i] = -2;
        continue;
      }
      const neighborColors = new Set();
      for (const nb of adj[i]) {
        if (assigned[nb] >= 0) neighborColors.add(assigned[nb]);
      }
      const sat = neighborColors.size;
      const deg = adj[i].size;
      if (
        sat > bestSat ||
        (sat === bestSat && deg > bestDeg) ||
        (sat === bestSat && deg === bestDeg && areas[i] > bestArea)
      ) {
        best = i;
        bestSat = sat;
        bestDeg = deg;
        bestArea = areas[i];
      }
    }

    if (best === -1) break;

    const forbidden = new Set();
    for (const nb of adj[best]) {
      if (assigned[nb] >= 0) forbidden.add(assigned[nb]);
    }

    let chosen = 0;
    let bestScore = Infinity;
    for (let c = 0; c < k; c++) {
      if (forbidden.has(c)) continue;
      let softHits = 0;
      for (const snb of softAdj[best]) {
        if (assigned[snb] === c) softHits++;
      }
      const score = softHits * 0.45 + areaUsed[c] * 1.6 + countUsed[c] * 0.0025;
      if (score < bestScore) {
        bestScore = score;
        chosen = c;
      }
    }

    assigned[best] = chosen;
    areaUsed[chosen] += areas[best];
    countUsed[chosen] += 1;
  }

  // Verify zero hard-border conflicts
  let conflicts = 0;
  for (let i = 0; i < n; i++) {
    if (assigned[i] < 0) continue;
    for (const j of adj[i]) {
      if (j > i && assigned[i] === assigned[j]) conflicts++;
    }
  }
  if (conflicts > 0) {
    console.warn(`warning: ${conflicts} adjacent country colour conflict(s)`);
  }

  return assigned.map((c) => (c === -2 ? COLORS.antarctica : COLORS.pastels[Math.max(0, c)]));
}

function projectPolygonRings(polyCoords, projection) {
  const rings = [];
  for (const ring of polyCoords) {
    const pts = [];
    let prevLon = null;
    let split = false;
    for (const [lon, lat] of ring) {
      if (prevLon !== null && Math.abs(lon - prevLon) > 170) split = true;
      prevLon = lon;
      const p = projection([lon, lat]);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push(p);
    }
    if (!split && pts.length >= 3) rings.push(pts);
  }
  return rings;
}

function polygonSignedAreaPx(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) * 0.5;
}

function horizontalIntervals(rings, y) {
  const xs = [];
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % n];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        const t = (y - y0) / (y1 - y0);
        xs.push(x0 + t * (x1 - x0));
      }
    }
  }
  xs.sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    segs.push([xs[i], xs[i + 1]]);
  }
  return segs;
}

/** Returns [totalSpanH, symmetricVerticalClearance] at (x, y) inside the polygon rings. */
function verticalMetricsAt(rings, x, y) {
  const ys = [];
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % n];
      if ((x0 <= x && x1 > x) || (x1 <= x && x0 > x)) {
        const t = (x - x0) / (x1 - x0);
        ys.push(y0 + t * (y1 - y0));
      }
    }
  }
  ys.sort((a, b) => a - b);
  for (let i = 0; i + 1 < ys.length; i += 2) {
    if (ys[i] <= y && y <= ys[i + 1]) {
      const span = ys[i + 1] - ys[i];
      const clearance = 2 * Math.min(y - ys[i], ys[i + 1] - y);
      return [span, clearance];
    }
  }
  return [0, 0];
}

/**
 * Finds the best-centered interior point inside a projected polygon by scoring both
 * horizontal chord width and symmetric vertical clearance from top/bottom/hole borders.
 */
function findInteriorAnchor(rings) {
  const outer = rings[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const midY = (minY + maxY) * 0.5;
  const midX = (minX + maxX) * 0.5;

  let best = { x: midX, y: midY, chordW: boxW * 0.55, chordH: boxH * 0.55, boxW, boxH };
  let bestScore = -1;

  const steps = 32;
  for (let s = 1; s < steps; s++) {
    const frac = 0.1 + (0.8 * s) / steps;
    const y = minY + boxH * frac;
    const segs = horizontalIntervals(rings, y);
    for (const [x0, x1] of segs) {
      const w = x1 - x0;
      if (w < 3) continue;
      // Sample 3 candidate x positions along the horizontal chord (35%, 50%, 65%) in case a hole/bay indents the midpoint
      for (const xf of [0.5, 0.4, 0.6]) {
        const cx = x0 + w * xf;
        const horizClearance = 2 * Math.min(cx - x0, x1 - cx);
        const [spanH, clearY] = verticalMetricsAt(rings, cx, y);
        if (clearY <= 2) continue;
        const centerBias = 1 - 0.22 * Math.abs(y - midY) / Math.max(1, boxH * 0.5);
        const vertWeight = Math.pow(Math.min(clearY, 120), 0.72);
        const score = Math.pow(horizClearance, 0.88) * vertWeight * centerBias;
        if (score > bestScore) {
          bestScore = score;
          best = { x: cx, y, chordW: horizClearance, chordH: Math.max(clearY, spanH * 0.6), boxW, boxH };
        }
      }
    }
  }
  return best;
}

function estimateSmallCapsWidth(text, fontSize, letterSpacing) {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += fontSize * 0.32;
    else if (ch === "." || ch === "'") w += fontSize * 0.24;
    else if (ch >= "A" && ch <= "Z") w += fontSize * 0.68;
    else w += fontSize * 0.57;
  }
  return w + Math.max(0, text.length - 1) * letterSpacing;
}

function buildCountryLabels(features, projection) {
  const candidates = [];

  for (const f of features) {
    if (!f.geometry) continue;
    const p = f.properties;
    const adm0 = cleanStr(p.ADM0_A3);
    const rawName = cleanStr(p.NAME);
    const name = DISPLAY_NAMES[adm0] || rawName;
    if (!name) continue;

    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let bestRings = null;
    let bestPolyArea = 0;
    let totalAreaPx = 0;

    for (const poly of polys) {
      const rings = projectPolygonRings(poly, projection);
      if (!rings.length) continue;
      const a = polygonSignedAreaPx(rings[0]);
      totalAreaPx += a;
      if (a > bestPolyArea) {
        bestPolyArea = a;
        bestRings = rings;
      }
    }

    if (!bestRings || totalAreaPx < 24) continue;

    let anchor = findInteriorAnchor(bestRings);
    const curated = CURATED_ANCHORS[adm0];
    if (curated) {
      const pt = projection(curated.coord);
      if (pt) {
        anchor = {
          x: pt[0],
          y: pt[1],
          chordW: curated.maxW,
          chordH: Math.max(anchor.chordH, 38),
          boxW: Math.max(anchor.boxW, curated.maxW),
          boxH: Math.max(anchor.boxH, 38),
        };
      }
    } else if (adm0 === "ATA") {
      const pt = projection([25, -77]);
      if (pt) anchor = { x: pt[0], y: pt[1], chordW: 520, chordH: 48, boxW: 1600, boxH: 90 };
    }

    candidates.push({
      adm0,
      name,
      areaPx: totalAreaPx,
      anchor,
      curatedFs: curated ? curated.fs : null,
      allowCoastalOverhang: Boolean(curated),
      isAntarctica: adm0 === "ATA",
    });
  }

  // Add French Guiana & La Réunion (polygons inside France's MultiPolygon)
  const fra = features.find((f) => cleanStr(f.properties.ADM0_A3) === "FRA");
  if (fra && fra.geometry.type === "MultiPolygon") {
    for (const poly of fra.geometry.coordinates) {
      const c = geoCentroid({ type: "Polygon", coordinates: poly });
      if (c[0] < -45 && c[0] > -60 && c[1] > 0 && c[1] < 8) {
        const rings = projectPolygonRings(poly, projection);
        if (rings.length) {
          const areaPx = polygonSignedAreaPx(rings[0]);
          const anc = projection([-52.0, 4.7]);
          if (anc) {
            candidates.push({
              adm0: "GUF",
              name: "Fr. Guiana",
              areaPx: areaPx + 50,
              anchor: { x: anc[0], y: anc[1], chordW: 52, chordH: 28, boxW: 52, boxH: 28 },
              curatedFs: 8.6,
              allowCoastalOverhang: true,
              isAntarctica: false,
            });
          }
        }
      }
      if (c[0] > 54 && c[0] < 57 && c[1] < -20 && c[1] > -22.5) {
        const pt = projection([c[0] + 2.5, c[1] + 0.15]);
        if (pt) {
          candidates.push({
            adm0: "REU",
            name: "Réunion",
            areaPx: 140,
            anchor: { x: pt[0], y: pt[1], chordW: 72, chordH: 18, boxW: 72, boxH: 18 },
            curatedFs: 9.2,
            allowCoastalOverhang: true,
            isAntarctica: false,
            oceanOffsetLabel: projection(c),
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.areaPx - a.areaPx);

  const placedBoxes = [];
  const placedLabels = [];

  const overlaps = (box) => {
    for (const b of placedBoxes) {
      if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) return true;
    }
    return false;
  };

  for (const c of candidates) {
    const { anchor, areaPx } = c;
    const sqrtA = Math.sqrt(areaPx);

    let targetFs = c.curatedFs ?? Math.min(38, Math.max(9.2, 4.3 + sqrtA * 0.115));
    if (c.isAntarctica) targetFs = 23;

    const splitWords =
      TWO_LINE_NAMES[c.name] ||
      (c.name.includes(" ") && anchor.chordW < anchor.boxH * 1.45
        ? (() => {
            const parts = c.name.split(" ");
            if (parts.length === 2) return parts;
            const mid = Math.ceil(parts.length / 2);
            return [parts.slice(0, mid).join(" "), parts.slice(mid).join(" ")];
          })()
        : null);

    // Strictly keep continental countries within their territory; allow curated coastal/island nations modest overhang
    const maxAllowedW = c.allowCoastalOverhang
      ? anchor.chordW * 1.05
      : Math.max(anchor.chordW * 0.96, anchor.boxW * 0.72);
    const maxAllowedH = c.allowCoastalOverhang
      ? Math.max(anchor.chordH * 1.35, 34)
      : Math.max(anchor.chordH * 1.08, anchor.boxH * 0.74);

    const minFs = c.allowCoastalOverhang ? 8.4 : 9.2;

    const layoutsToTry = [];
    if (splitWords && (anchor.chordW < estimateSmallCapsWidth(c.name, targetFs, 1.4) * 0.95 || TWO_LINE_NAMES[c.name])) {
      layoutsToTry.push(splitWords);
      layoutsToTry.push([c.name]);
    } else {
      layoutsToTry.push([c.name]);
      if (splitWords) layoutsToTry.push(splitWords);
    }

    let chosen = null;

    for (const lines of layoutsToTry) {
      let fs = targetFs;
      if (lines.length === 2) fs = Math.min(fs, 25);

      while (fs >= minFs) {
        const ls =
          c.adm0 === "IDN"
            ? 5.0
            : fs >= 28
              ? Math.round((fs - 18) * 0.36 * 10) / 10
              : fs >= 18
                ? 2.2
                : fs >= 13
                  ? 1.3
                  : 0.8;
        const lineW = Math.max(...lines.map((ln) => estimateSmallCapsWidth(ln, fs, ls)));
        const lineH = fs * 1.08;
        const totalH = lines.length * lineH;

        if (lineW <= maxAllowedW && totalH <= maxAllowedH) {
          const nudges = [
            [0, 0],
            [0, -4],
            [0, 4],
            [-5, 0],
            [5, 0],
            [0, -8],
            [0, 8],
          ];
          for (const [dx, dy] of nudges) {
            const cx = anchor.x + dx;
            const cy = anchor.y + dy;
            const padX = Math.max(3, fs * 0.16);
            const padY = Math.max(2, fs * 0.12);
            const box = {
              x0: cx - lineW * 0.5 - padX,
              x1: cx + lineW * 0.5 + padX,
              y0: cy - totalH * 0.5 - padY,
              y1: cy + totalH * 0.5 + padY,
            };
            if (!overlaps(box)) {
              chosen = { lines, fs, ls, cx, cy, lineH, totalH, box };
              break;
            }
          }
        }
        if (chosen) break;
        fs -= 0.8;
      }
      if (chosen) break;
    }

    if (chosen) {
      placedBoxes.push(chosen.box);
      placedLabels.push({
        ...chosen,
        isAntarctica: c.isAntarctica,
        oceanOffsetLabel: c.oceanOffsetLabel || null,
      });
    }
  }

  return placedLabels;
}

function renderTitleBand() {
  const bandTop = 29;
  const bandH = 116;
  const bandBot = bandTop + bandH;
  const cy = bandTop + 76;

  return `
  <!-- Cream Title Band -->
  <rect x="29" y="${bandTop}" width="${W - 58}" height="${bandH}" fill="${COLORS.titleBand}" />
  <line x1="29" y1="${bandBot}" x2="${W - 29}" y2="${bandBot}" stroke="${COLORS.frame}" stroke-width="2.2" />
  <line x1="29" y1="${bandBot + 5}" x2="${W - 29}" y2="${bandBot + 5}" stroke="${COLORS.frame}" stroke-width="0.9" />

  <!-- Subtle symmetric cartographic rules flanking title -->
  <line x1="1120" y1="${bandTop + 60}" x2="1650" y2="${bandTop + 60}" stroke="${COLORS.frame}" stroke-width="1" stroke-opacity="0.55" />
  <polygon points="1668,${bandTop + 60} 1675,${bandTop + 55} 1682,${bandTop + 60} 1675,${bandTop + 65}" fill="${COLORS.frame}" fill-opacity="0.65" />
  <line x1="2446" y1="${bandTop + 60}" x2="2976" y2="${bandTop + 60}" stroke="${COLORS.frame}" stroke-width="1" stroke-opacity="0.55" />
  <polygon points="2414,${bandTop + 60} 2421,${bandTop + 55} 2428,${bandTop + 60} 2421,${bandTop + 65}" fill="${COLORS.frame}" fill-opacity="0.65" />

  <text x="${W / 2}" y="${cy}" text-anchor="middle"
    font-family="Baskerville, Georgia, 'Times New Roman', serif"
    font-size="54" font-weight="600" letter-spacing="16"
    fill="${COLORS.label}">THE WORLD</text>
  `;
}

function renderDegreeLabels(projection) {
  const out = [];
  const lats = [75, 60, 45, 30, 15, 0, -15, -30, -45, -60, -75];
  for (const lat of lats) {
    const label = lat === 0 ? "0°" : `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`;
    const left = projection([-180, lat]);
    const right = projection([180, lat]);
    if (left) {
      out.push(
        `<text x="${(left[0] - 10).toFixed(1)}" y="${(left[1] + 4).toFixed(1)}" text-anchor="end" font-family="'Gill Sans', Optima, sans-serif" font-size="11.5" fill="${COLORS.frame}" fill-opacity="0.72">${label}</text>`
      );
    }
    if (right) {
      out.push(
        `<text x="${(right[0] + 10).toFixed(1)}" y="${(right[1] + 4).toFixed(1)}" text-anchor="start" font-family="'Gill Sans', Optima, sans-serif" font-size="11.5" fill="${COLORS.frame}" fill-opacity="0.72">${label}</text>`
      );
    }
  }

  const lons = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  for (const lon of lons) {
    const label = lon === 0 ? "0°" : `${Math.abs(lon)}°${lon > 0 ? "E" : "W"}`;
    const top = projection([lon, 90]);
    const bot = projection([lon, -90]);
    if (top) {
      out.push(
        `<text x="${top[0].toFixed(1)}" y="${(top[1] - 8).toFixed(1)}" text-anchor="middle" font-family="'Gill Sans', Optima, sans-serif" font-size="11" fill="${COLORS.frame}" fill-opacity="0.68">${label}</text>`
      );
    }
    if (bot) {
      out.push(
        `<text x="${bot[0].toFixed(1)}" y="${(bot[1] + 17).toFixed(1)}" text-anchor="middle" font-family="'Gill Sans', Optima, sans-serif" font-size="11" fill="${COLORS.frame}" fill-opacity="0.68">${label}</text>`
      );
    }
  }
  return out.join("\n  ");
}

function renderOceanLabels(projection) {
  // Coordinates chosen mid-cell so labels sit cleanly away from 15° graticules and dashed tropics
  const oceans = [
    { lines: ["North", "Atlantic", "Ocean"], coord: [-41, 35.5], size: 22, spacing: 6 },
    { lines: ["South", "Atlantic", "Ocean"], coord: [-20, -35.5], size: 22, spacing: 6 },
    { lines: ["North", "Pacific", "Ocean"], coord: [-151, 35.5], size: 25, spacing: 7 },
    { lines: ["South", "Pacific", "Ocean"], coord: [-134, -36.5], size: 25, spacing: 7 },
    { lines: ["Pacific", "Ocean"], coord: [158, 19.5], size: 21, spacing: 6 },
    { lines: ["Indian", "Ocean"], coord: [78, -34.5], size: 24, spacing: 7 },
    { lines: ["Arctic Ocean"], coord: [15, 82.5], size: 17, spacing: 7 },
    { lines: ["Southern Ocean"], coord: [-105, -64.5], size: 17, spacing: 6 },
  ];

  const items = [];
  for (const o of oceans) {
    const pt = projection(o.coord);
    if (!pt) continue;
    const lh = o.size * 1.38;
    const startY = pt[1] - ((o.lines.length - 1) * lh) / 2;
    const tspans = o.lines
      .map((ln, idx) => `<tspan x="${pt[0].toFixed(1)}" y="${(startY + idx * lh).toFixed(1)}">${escXml(ln)}</tspan>`)
      .join("");
    items.push(
      `<text text-anchor="middle" font-family="Baskerville, Georgia, serif" font-style="italic" font-variant="small-caps" font-size="${o.size}" letter-spacing="${o.spacing}" fill="${COLORS.oceanLabel}" fill-opacity="0.72">${tspans}</text>`
    );
  }
  return items.join("\n  ");
}

function renderScaleBar(projection) {
  const p0 = projection([0, 0]);
  const p10 = projection([10, 0]);
  const pxPerDeg = (p10[0] - p0[0]) / 10;
  const pxPerKm = pxPerDeg / 111.31949;
  const km1000 = pxPerKm * 1000;
  const mi1000 = pxPerKm * 1609.344;

  const x0 = 86;
  const yBar = 1938;
  const barH = 8;
  const totalKm = 4000;
  const totalW = km1000 * 4;

  const segments = [];
  const stops = [0, 500, 1000, 2000, 3000, 4000];
  for (let i = 0; i < stops.length - 1; i++) {
    const sx = x0 + stops[i] * pxPerKm;
    const sw = (stops[i + 1] - stops[i]) * pxPerKm;
    const fill = i % 2 === 0 ? COLORS.frame : COLORS.titleBand;
    segments.push(
      `<rect x="${sx.toFixed(2)}" y="${yBar}" width="${sw.toFixed(2)}" height="${barH}" fill="${fill}" stroke="${COLORS.frame}" stroke-width="1" />`
    );
  }

  const kmLabels = [0, 1000, 2000, 3000, 4000].map((km) => {
    const tx = x0 + km * pxPerKm;
    const label = km === totalKm ? `${km} km` : String(km);
    return `
    <line x1="${tx.toFixed(2)}" y1="${yBar - 4}" x2="${tx.toFixed(2)}" y2="${yBar}" stroke="${COLORS.frame}" stroke-width="1" />
    <text x="${tx.toFixed(2)}" y="${yBar - 8}" text-anchor="middle" font-family="'Gill Sans', Optima, sans-serif" font-size="11.5" fill="${COLORS.label}">${label}</text>`;
  });

  const miLabels = [0, 1000, 2000].map((mi) => {
    const tx = x0 + (mi / 1000) * mi1000;
    const label = mi === 2000 ? `${mi} mi` : String(mi);
    return `
    <line x1="${tx.toFixed(2)}" y1="${yBar + barH}" x2="${tx.toFixed(2)}" y2="${yBar + barH + 4}" stroke="${COLORS.frame}" stroke-width="1" />
    <text x="${tx.toFixed(2)}" y="${yBar + barH + 15}" text-anchor="middle" font-family="'Gill Sans', Optima, sans-serif" font-size="11" fill="${COLORS.frame}" fill-opacity="0.82">${label}</text>`;
  });

  return `
  <!-- Equatorial Scale Bar (bottom-left cream spandrel) -->
  <g>
    <text x="${(x0 + totalW * 0.5).toFixed(1)}" y="${yBar - 26}" text-anchor="middle"
      font-family="'Gill Sans', Optima, sans-serif" font-variant="small-caps" font-weight="600"
      font-size="13.5" letter-spacing="2.2" fill="${COLORS.label}">Equatorial Scale</text>
    ${segments.join("\n    ")}
    ${kmLabels.join("")}
    ${miLabels.join("")}
  </g>

  <!-- Projection note (bottom-right cream spandrel) -->
  <g>
    <text x="${W - 86}" y="${yBar + 2}" text-anchor="end"
      font-family="'Gill Sans', Optima, sans-serif" font-variant="small-caps" font-weight="600"
      font-size="13.5" letter-spacing="2.2" fill="${COLORS.label}" fill-opacity="0.82">Robinson Projection</text>
    <text x="${W - 86}" y="${yBar + 20}" text-anchor="end"
      font-family="'Gill Sans', Optima, sans-serif" font-variant="small-caps"
      font-size="11.5" letter-spacing="1.6" fill="${COLORS.frame}" fill-opacity="0.68">15° Graticule · Political Edition</text>
  </g>
  `;
}

async function main() {
  const shpPath = resolveShapefile();
  const dbfPath = shpPath.replace(/\.shp$/i, ".dbf");
  const fc = await shapefile.read(shpPath, dbfPath, { encoding: "utf-8" });
  const features = fc.features.filter((f) => f && f.geometry);

  const sphere = { type: "Sphere" };
  const projection = geoRobinson().fitExtent(
    [
      [170, 184],
      [W - 170, H - 62],
    ],
    sphere
  );
  const pathGen = geoPath(projection).digits(2);

  const areas = features.map((f) => geoArea(f));
  const fills = colorCountries(features, areas);

  const spherePath = pathGen(sphere);

  const grat15 = geoGraticule()
    .step([15, 15])
    .extentMajor([[-180, -90], [180, 90]])
    .extentMinor([[-180, -75], [180, 75]]);
  const gratPath = pathGen(grat15());

  const majorLines = {
    type: "MultiLineString",
    coordinates: [
      Array.from({ length: 181 }, (_, i) => [-180 + i * 2, 0]),
      Array.from({ length: 91 }, (_, i) => [0, -90 + i * 2]),
    ],
  };
  const majorPath = pathGen(majorLines);

  const specialLatLines = {
    type: "MultiLineString",
    coordinates: [23.4366, -23.4366, 66.5634, -66.5634].map((lat) =>
      Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat])
    ),
  };
  const specialLatPath = pathGen(specialLatLines);

  const countryFillPaths = [];
  const countryBorderPaths = [];
  for (let i = 0; i < features.length; i++) {
    const d = pathGen(features[i]);
    if (!d) continue;
    countryFillPaths.push(`<path d="${d}" fill="${fills[i]}" />`);
    countryBorderPaths.push(`<path d="${d}" />`);
  }

  const labels = buildCountryLabels(features, projection);
  const labelSvg = labels
    .map((lb) => {
      const startY = lb.cy - ((lb.lines.length - 1) * lb.lineH) / 2 + lb.fs * 0.34;
      const tspans = lb.lines
        .map((ln, idx) => `<tspan x="${lb.cx.toFixed(1)}" y="${(startY + idx * lb.lineH).toFixed(1)}">${escXml(ln)}</tspan>`)
        .join("");
      const opacity = lb.isAntarctica ? "0.62" : "0.94";
      const haloColor = lb.isAntarctica ? COLORS.antarctica : COLORS.labelHalo;
      const haloW = Math.max(1.9, Math.min(3.4, lb.fs * 0.15)).toFixed(2);
      const leader = lb.oceanOffsetLabel
        ? `<circle cx="${lb.oceanOffsetLabel[0].toFixed(1)}" cy="${lb.oceanOffsetLabel[1].toFixed(1)}" r="1.6" fill="${COLORS.border}" fill-opacity="0.7" />`
        : "";
      return `${leader}<text text-anchor="middle"
      font-family="'Gill Sans', Optima, 'Helvetica Neue', sans-serif"
      font-variant="small-caps" font-weight="600"
      font-size="${lb.fs.toFixed(1)}" letter-spacing="${lb.ls.toFixed(1)}"
      fill="${COLORS.label}" fill-opacity="${opacity}"
      stroke="${haloColor}" stroke-opacity="0.52" stroke-width="${haloW}" stroke-linejoin="round"
      paint-order="stroke fill">${tspans}</text>`;
    })
    .join("\n    ");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="globe-clip">
      <path d="${spherePath}" />
    </clipPath>
    <radialGradient id="paper-warmth" cx="48%" cy="44%" r="68%">
      <stop offset="0%" stop-color="${COLORS.paperLight}" stop-opacity="0.45" />
      <stop offset="72%" stop-color="${COLORS.paper}" stop-opacity="0" />
      <stop offset="100%" stop-color="#c9b898" stop-opacity="0.22" />
    </radialGradient>
    <radialGradient id="ocean-tone" cx="50%" cy="48%" r="56%">
      <stop offset="0%" stop-color="#c0d6dc" />
      <stop offset="78%" stop-color="${COLORS.ocean}" />
      <stop offset="100%" stop-color="${COLORS.oceanEdge}" />
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${COLORS.paper}" />

  ${renderTitleBand()}

  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${COLORS.frame}" stroke-width="2.6" />
  <rect x="29" y="29" width="${W - 58}" height="${H - 58}" fill="none" stroke="${COLORS.frame}" stroke-width="1" />

  <g clip-path="url(#globe-clip)">
    <path d="${spherePath}" fill="url(#ocean-tone)" />

    <path d="${gratPath}" fill="none" stroke="${COLORS.gratOcean}" stroke-width="0.9" stroke-opacity="0.52" />
    <path d="${specialLatPath}" fill="none" stroke="${COLORS.gratMajor}" stroke-width="0.85" stroke-dasharray="7,6" stroke-opacity="0.52" />
    <path d="${majorPath}" fill="none" stroke="${COLORS.gratMajor}" stroke-width="1.15" stroke-opacity="0.64" />

    <g shape-rendering="geometricPrecision">
      ${countryFillPaths.join("\n      ")}
    </g>

    <path d="${gratPath}" fill="none" stroke="${COLORS.gratLand}" stroke-width="0.7" stroke-opacity="0.12" />
    <path d="${majorPath}" fill="none" stroke="${COLORS.gratLand}" stroke-width="0.85" stroke-opacity="0.18" />

    <g fill="none" stroke="${COLORS.border}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.92">
      ${countryBorderPaths.join("\n      ")}
    </g>

    ${renderOceanLabels(projection)}

    <g>
      ${labelSvg}
    </g>
  </g>

  <path d="${spherePath}" fill="none" stroke="${COLORS.frame}" stroke-width="2" />

  ${renderDegreeLabels(projection)}

  ${renderScaleBar(projection)}

  <rect width="${W}" height="${H}" fill="url(#paper-warmth)" pointer-events="none" />
</svg>`;

  const outWebp = path.join(root, "public", "textures", "world-map.webp");
  const outPreview = path.join(root, "research", "map", "preview.png");
  fs.mkdirSync(path.dirname(outWebp), { recursive: true });
  fs.mkdirSync(path.dirname(outPreview), { recursive: true });

  const svgBuf = Buffer.from(svg);
  const rawPng = await sharp(svgBuf).png().toBuffer();

  const maxBytes = 900 * 1024;
  let webpBuf = null;
  let usedQuality = 90;
  for (const q of [92, 90, 86, 82, 78, 74, 70]) {
    const candidate = await sharp(rawPng)
      .webp({ quality: q, effort: 6, smartSubsample: true })
      .toBuffer();
    usedQuality = q;
    webpBuf = candidate;
    if (candidate.length < maxBytes - 15 * 1024) break;
  }

  fs.writeFileSync(outWebp, webpBuf);

  await sharp(rawPng)
    .resize({ width: 1600 })
    .png({ compressionLevel: 9 })
    .toFile(outPreview);

  const kb = (webpBuf.length / 1024).toFixed(1);
  console.log(
    `wrote ${path.relative(root, outWebp)} (${W}×${H}, ${kb} KB, q=${usedQuality}, ${labels.length} labels) and ${path.relative(root, outPreview)} (1600×800)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
