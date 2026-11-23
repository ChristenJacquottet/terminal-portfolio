// The globe tells the story in order. Each spin slows and lands with the next place of my life
// facing you: La Réunion (born), Guyane, Normandie, Indiana (college), London, Dallas (home now).
// As it lands, that place's postcard on the world map swings on its pin and its red string glows
// for a moment; the hover label says where it stopped and what the place means.
import { CatmullRomCurve3, Group, Matrix3, Mesh, MeshStandardMaterial, TubeGeometry, Vector3, type BufferGeometry, type Object3D } from "three";
import { projectMillerMap } from "../alive";
import { PLACES } from "../interact";
import type { DeskApi, Feature } from "./types";
import { easeOut, refreshChip, wobble } from "./story-kit";

type Stop = { place: string; name: string; lon: number; lat: number };
/** In the order I lived there; `place` is the postcard's name on the map (alive.ts). */
const STOPS: Stop[] = [
  { place: "LA RÉUNION", name: "La Réunion", lon: 55.53, lat: -21.11 },
  { place: "GUYANE", name: "Guyane", lon: -53.2, lat: 3.95 },
  { place: "NORMANDIE", name: "Normandie", lon: -0.85, lat: 49.15 },
  { place: "INDIANA", name: "Indiana", lon: -85.5, lat: 40.48 },
  { place: "LONDON", name: "London", lon: -0.13, lat: 51.51 },
  { place: "DALLAS", name: "Dallas", lon: -96.8, lat: 32.78 },
];

/**
 * The globe model (Sketchfab, gores printed onto a UV sphere): where its axis is and how a
 * longitude maps to an angle around it, worked out from the mesh's own UVs. On the gores v runs
 * with latitude (so the axis is where v grows), and at the equator, where the gores meet, u runs
 * evenly with longitude.
 */
type Ball = {
  pivot: Group;
  /** The polar axis and the sphere's centre, in the pivot's parent's space. */
  axis: Vector3;
  centre: Vector3;
  /** A surface direction for a longitude, in the pivot's parent's space, with the pivot at rest. */
  dirOf: (lon: number) => Vector3;
};

/**
 * Longitude at u = 0 of the gore print (the print runs a full turn across the texture), plus a
 * correction in degrees, both checked by eye against the coastlines (La Réunion east of Madagascar).
 */
const U0_LON = -180;
const LON_FIX = -156;

function rig(globe: Object3D): Ball | null {
  let ball: Mesh | null = null;
  globe.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && /^Globe_low/i.test(m.name)) ball = m;
  });
  const mesh = ball as Mesh | null;
  if (!mesh?.parent) return null;
  const geo = mesh.geometry as BufferGeometry;
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  if (!pos || !uv) return null;
  geo.computeBoundingBox();
  const centre = geo.boundingBox!.getCenter(new Vector3());
  const radius = geo.boundingBox!.getSize(new Vector3()).length() / (2 * Math.sqrt(3));
  // The polar axis: the direction along which v (latitude on the gores) grows, by least squares.
  const n = pos.count;
  const p = new Vector3();
  let vMean = 0;
  for (let i = 0; i < n; i++) vMean += uv.getY(i) / n;
  const C = new Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  const r = new Vector3();
  const e = C.elements;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i).sub(centre);
    const dv = uv.getY(i) - vMean;
    const q = [p.x, p.y, p.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) e[a * 3 + b] += q[a] * q[b];
    r.addScaledVector(p, dv);
  }
  if (Math.abs(C.determinant()) < 1e-12) return null;
  const axis = r.clone().applyMatrix3(C.clone().invert()).normalize();
  // Azimuth around the axis against u, on the equator, fitted with a line.
  const e1 = new Vector3(1, 0, 0);
  if (Math.abs(e1.dot(axis)) > 0.9) e1.set(0, 1, 0);
  e1.addScaledVector(axis, -e1.dot(axis)).normalize();
  const e2 = new Vector3().crossVectors(axis, e1);
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i).sub(centre);
    if (Math.abs(p.dot(axis)) < radius * 0.12) ring.push([uv.getX(i), Math.atan2(p.dot(e2), p.dot(e1))]);
  }
  if (ring.length < 6) return null;
  ring.sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < ring.length; i++) {
    while (ring[i][1] - ring[i - 1][1] > Math.PI) ring[i][1] -= Math.PI * 2;
    while (ring[i][1] - ring[i - 1][1] < -Math.PI) ring[i][1] += Math.PI * 2;
  }
  const mu = ring.reduce((s, [u]) => s + u, 0) / ring.length;
  const ma = ring.reduce((s, [, a]) => s + a, 0) / ring.length;
  let num = 0;
  let den = 0;
  for (const [u, a] of ring) {
    num += (u - mu) * (a - ma);
    den += (u - mu) ** 2;
  }
  const slope = num / Math.max(1e-9, den);
  const azOf = (u: number) => ma + slope * (u - mu);
  // The pivot: at the sphere's centre, in the ball's parent, so the ball turns about its own axis.
  const parent = mesh.parent;
  mesh.updateMatrix();
  const toParent = mesh.matrix.clone();
  const pivot = new Group();
  pivot.name = "globe:ball";
  parent.add(pivot);
  pivot.position.copy(centre).applyMatrix4(toParent);
  pivot.updateMatrix();
  pivot.attach(mesh);
  const axisP = axis.clone().transformDirection(toParent);
  const e1P = e1.clone().transformDirection(toParent);
  const e2P = e2.clone().transformDirection(toParent);
  const dirOf = (lon: number) => {
    const u = ((((lon + LON_FIX - U0_LON) / 360) % 1) + 1) % 1;
    const a = azOf(u);
    return e1P.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2P, Math.sin(a));
  };
  return { pivot, axis: axisP, centre: pivot.position.clone(), dirOf };
}

/** The red string from a postcard's pin to its place, as a brighter strand laid over the twine. */
function glowString(card: Object3D, lon: number, lat: number): Mesh {
  const [mapX, mapY] = projectMillerMap(lon, lat);
  const pinX = card.position.x;
  const pinY = card.position.y;
  const dist = Math.hypot(mapX - pinX, mapY - pinY);
  const sag = Math.min(0.016, dist * 0.06);
  const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const k = 4 * t * (1 - t);
    return new Vector3(pinX + (mapX - pinX) * t, pinY + (mapY - pinY) * t - sag * k, 0.0058 + (0.004 - 0.0058) * t + 0.001 * k);
  });
  const mesh = new Mesh(
    new TubeGeometry(new CatmullRomCurve3(pts), 18, 0.0014, 6, false),
    new MeshStandardMaterial({ color: "#c2452e", roughness: 0.6, emissive: "#ff5a36", emissiveIntensity: 0 }),
  );
  mesh.raycast = () => {};
  mesh.visible = false;
  return mesh;
}

let ball: Ball | null = null;
let next = 0;
let landed: Stop | null = null;
let turned = 0;
let desk: DeskApi | null = null;
const strings = new Map<string, Mesh>();

function cardOf(scene: Object3D, stop: Stop) {
  return scene.getObjectByName(`postcard:${stop.place.toLowerCase()}`) ?? null;
}

const globe: Feature = {
  name: "story-globe",
  hotspots: { globe: { kind: "globe", label: "the globe", hint: "give it a spin" } },
  label(_object, spot) {
    if (spot.kind !== "globe") return null;
    if (!landed) return ["the globe", "give it a spin · where I've lived"];
    const i = STOPS.indexOf(landed);
    return [`${landed.name}`, `${PLACES[landed.place] ?? "home, once"} · ${i + 1} of ${STOPS.length} · spin on`];
  },
  onDesk(d) {
    desk = d;
    const g = d.props.get("globe");
    if (g) ball = rig(g);
    const map = d.props.get("worldmap");
    if (map) {
      for (const stop of STOPS) {
        const card = cardOf(map, stop);
        if (!card?.parent) continue;
        const s = glowString(card, stop.lon, stop.lat);
        card.parent.add(s);
        strings.set(stop.place, s);
      }
    }
  },
  actions: {
    async globe({ object, sfx, once, animate, motions, camera, leave }) {
      if (!ball) {
        sfx("spin", object);
        await once(object, () => motions.spin(object));
        return;
      }
      const b = ball;
      await once(object, async () => {
        leave();
        const stop = STOPS[next];
        next = (next + 1) % STOPS.length;
        landed = null;
        sfx("spin", object);
        // Where the place must end up: its meridian turned to face the camera.
        const parent = b.pivot.parent!;
        parent.updateMatrixWorld(true);
        const eye = parent.worldToLocal(camera.getWorldPosition(new Vector3())).sub(b.centre);
        const at = stop && b.dirOf(stop.lon);
        const flat = (v: Vector3) => v.clone().addScaledVector(b.axis, -v.dot(b.axis)).normalize();
        const p = flat(at);
        const c = flat(eye);
        const want = Math.atan2(b.axis.dot(new Vector3().crossVectors(p, c)), p.dot(c));
        // From where it is now, forwards, at least a turn and a half.
        const from = turned;
        let to = want;
        while (to < from + Math.PI * 3) to += Math.PI * 2;
        const span = to - from;
        await animate(2600, (t) => {
          // a hand's flick: fast, then the bearing's drag, a small rock as it stops
          const k = 1 - (1 - t) ** 3.2;
          turned = from + span * k + (t > 0.86 ? 0.025 * wobble((t - 0.86) / 0.14, 0.8, 3) : 0);
          b.pivot.quaternion.setFromAxisAngle(b.axis, turned);
        });
        turned = to;
        b.pivot.quaternion.setFromAxisAngle(b.axis, turned);
        landed = stop;
        sfx("globeStop", object);
        void land(stop);
        refreshChip();
      });
    },
  },
};

/** The place's postcard swings on its pin and its string glows, then fades. */
async function land(stop: Stop) {
  const d = desk;
  if (!d) return;
  const card = cardOf(d.scene, stop);
  const s = strings.get(stop.place);
  const m = s?.material as MeshStandardMaterial | undefined;
  if (s && m) s.visible = true;
  d.sound?.play("paper", { volume: 0.5 });
  const swing = card ? swingCard(d, card) : Promise.resolve();
  await d.animate(1700, (t) => {
    if (m) m.emissiveIntensity = 2.2 * Math.sin(Math.min(1, t * 2.4) * Math.PI * 0.5) * (1 - easeOut(Math.max(0, t - 0.35) / 0.65));
  });
  await swing;
  if (s && m) {
    m.emissiveIntensity = 0;
    s.visible = false;
  }
  d.request();
}

/** The same swing a click gives a postcard: from its pin. */
function swingCard(d: DeskApi, card: Object3D) {
  const tilt = card.rotation.z;
  return d.animate(1500, (t) => {
    card.rotation.z = tilt + 0.07 * wobble(t, 1.5, 2.6);
  }).then(() => {
    card.rotation.z = tilt;
  });
}

export default globe;
