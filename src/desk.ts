// The desk scene: the computer on a desk in a room, with the live terminal mounted on the monitor.
// Loaded on demand by `exit`, so the terminal itself never pays for three.js.
//
// Performance rules: render only while something moves (camera tween or orbit damping), at most
// 60 fps, cap the pixel ratio (and drop it while the camera moves), shadow maps redrawn only when a
// shadow caster or light really moved, the environment captured from the room only when its light
// changes, and the terminal stays DOM (CSS3D), so text is never re-uploaded as a texture. Desktops finish each frame in post.ts (AO, bloom, grade); phones don't.
//
// The CSS3D layer sits *under* the WebGL canvas. The tube is drawn as a transparent hole, so the
// terminal shows through exactly where the curved glass is: the bezel crops it, and the glass
// shader darkens the edges and reflects the window on top, which makes the flat page read as curved.
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Cache,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoBlending,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Raycaster,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SpotLight,
  Vector2,
  Euler,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Texture,
  Box3,
  CircleGeometry,
  Quaternion,
  Matrix3,
  Matrix4,
  PCFShadowMap,
  type Object3D,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bus } from "./bus";
import { MODEL_CREDIT } from "./credit";
import { editing, locked } from "./layout";
import { fileName, projects } from "./content";
import { display, findFile } from "./fs";
import type { Cue } from "./audio";
import { createInteractions, type Drive } from "./interact";
import { addProps, type Disk } from "./props";
import { ROOM_TEXTURES, buildRoom, loadRoom, type Time } from "./room";
import { pulses } from "./alive";
import { features } from "./features";
import type { DeskApi, PvmScreen } from "./features/types";
import { createPost, createRoomProbe, postSupported, prepareGlow, settleMaterials, type Post } from "./post";
import { createAtmosphere } from "./atmosphere";

/** The tube's shape (4:3). In the monitor the terminal keeps the window's text size, see `fitTube`. */
const SCREEN_W = 800;
const SCREEN_H = 600;
/** Never let the terminal in the tube get shorter than this (CSS px), or a phone's tube is a postage stamp. */
const TUBE_MIN_H = 360;
const FOV = 35;
/** How much of the window the screen fills in the close-up pose, which must match the fullscreen hand-off. */
const FILL = 0.94;
/** The frame budget: the render loop never draws faster than 60 fps, whatever the display's refresh rate. */
const FRAME_MS = 1000 / 60;

/**
 * The real model, once it is in public/models. Credit is required (CC BY 4.0).
 * `screen` is in model space after normalisation; null means "find it by mesh name".
 */
export const MODEL = {
  url: "/models/apple-ii.glb",
  /** The tube's width in metres sets the scale: a 12" monitor shows about 24 cm. */
  screenWidth: 0.24,
  screenMaterial: /monitor_screen/i,
  /** Fraction of the glass the terminal covers; the rest is theme background under the glass. */
  inset: 0.93,
};

const PROPS_URL = "/models/props.glb";

// Shared in-flight prefetches populate THREE.Cache so an `exit` mid-prefetch reuses the download.
Cache.enabled = true;
const binaryFlights = new Map<string, Promise<ArrayBuffer | null>>();
const imageFlights = new Map<string, Promise<HTMLImageElement | null>>();
const blobUrls: string[] = [];

function fetchBinaryCached(url: string, lowPriority: boolean): Promise<ArrayBuffer | null> {
  Cache.enabled = true;
  const cached = Cache.get(`file:${url}`) as ArrayBuffer | undefined;
  if (cached) return Promise.resolve(cached);
  const existing = binaryFlights.get(url);
  if (existing) return existing;
  const job = fetch(url, (lowPriority ? { priority: "low" } : {}) as RequestInit)
    .then(async (res) => {
      if (!res.ok || res.headers.get("content-type")?.includes("text/html")) return null;
      const buf = await res.arrayBuffer();
      Cache.add(`file:${url}`, buf);
      return buf;
    })
    .catch(() => null)
    .finally(() => binaryFlights.delete(url));
  binaryFlights.set(url, job);
  return job;
}

function fetchImageCached(url: string, lowPriority: boolean): Promise<HTMLImageElement | null> {
  Cache.enabled = true;
  const cached = Cache.get(`image:${url}`) as HTMLImageElement | undefined;
  if (cached?.complete) return Promise.resolve(cached);
  const existing = imageFlights.get(url);
  if (existing) return existing;
  const job = fetch(url, (lowPriority ? { priority: "low" } : {}) as RequestInit)
    .then(async (res) => {
      if (!res.ok || res.headers.get("content-type")?.includes("text/html")) return null;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      blobUrls.push(objUrl);
      const img = new Image();
      img.src = objUrl;
      await img.decode();
      Cache.add(`image:${url}`, img);
      return img;
    })
    .catch(() => null)
    .finally(() => imageFlights.delete(url));
  imageFlights.set(url, job);
  return job;
}

let parsedModelJob: Promise<GLTF | null> | null = null;
let parsedPropsJob: Promise<GLTF | null> | null = null;

function parseGltfCached(url: string, lowPriority: boolean): Promise<GLTF | null> {
  return fetchBinaryCached(url, lowPriority).then(async (buf) => {
    if (!buf) return null;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      return await loader.parseAsync(buf, "/models/");
    } catch {
      return null;
    }
  });
}

/** Starts downloading the desk's files at low priority (network only; parsing waits for idle). */
export function preloadDeskFiles() {
  void fetchBinaryCached(MODEL.url, true);
  void fetchBinaryCached(PROPS_URL, true);
  for (const url of ROOM_TEXTURES) void fetchImageCached(url, true);
}

let warmJob: Promise<void> | null = null;

/** Quietly warms THREE.Cache, decodes textures, and pre-parses GLBs at low priority once the terminal is idle. */
export function prefetchDesk(onProgress?: (fraction: number) => void): Promise<void> {
  if (warmJob) return warmJob;
  MeshoptDecoder.useWorkers?.(2);
  let doneWeight = 0;
  const step = (w: number) => {
    doneWeight = Math.min(1, doneWeight + w);
    onProgress?.(doneWeight);
  };
  const texWeight = 0.11 / ROOM_TEXTURES.length;
  parsedModelJob ??= parseGltfCached(MODEL.url, true);
  parsedPropsJob ??= parseGltfCached(PROPS_URL, true);
  warmJob = Promise.all([
    MeshoptDecoder.ready,
    parsedModelJob.then(() => step(0.28)),
    parsedPropsJob.then(() => step(0.61)),
    ...ROOM_TEXTURES.map((url) => fetchImageCached(url, true).then(() => step(texWeight))),
  ]).then(() => {
    onProgress?.(1);
  });
  return warmJob;
}

type Screen = { center: Vector3; normal: Vector3; up: Vector3; width: number; height: number };

export type Desk = {
  stepBack(): Promise<void>;
  sitDown(): Promise<void>;
  setGlow(fg: string): void;
  hasModel: boolean;
  /** Everything on the desk loaded and prepared: step back only after this, so nothing pops in. */
  ready: Promise<void>;
};

/** One floppy per featured project, in the portfolio's order; loading one cats its file. */
function featuredDisks(): Disk[] {
  return projects
    .filter((p) => p.featured && !p.archived)
    .slice(0, 8)
    .flatMap((p) => {
      const file = findFile(fileName(p));
      return file ? [{ label: fileName(p).replace(/-/g, " ").toUpperCase(), title: p.title, command: `cat ${display(file.path)}` }] : [];
    });
}

/** Every texture on the materials under `root`, to upload before they are first drawn. */
function textures(root: Object3D) {
  const found = new Set<Texture>();
  root.traverse((o) => {
    const material = (o as Mesh).material;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(m)) if ((value as Texture | null)?.isTexture) found.add(value as Texture);
    }
  });
  return found;
}

const PROTECTED_SUBNODES = new Set([
  "cubies",
  "handset",
  "Empty.001_4",
  "portable_cassette_player_lid",
  "joystick-stick", // games-arcade.ts: the stick leans with the arrow keys
]);

/** Coalesces multi-material geometry groups that point to the same Material (e.g. 6-face floppy sleeves -> 2 groups). */
function coalesceMaterialGroups(mesh: Mesh) {
  if (!Array.isArray(mesh.material) || mesh.geometry.groups.length <= 1) return;
  const mats = mesh.material;
  const unique: Material[] = [];
  const remap: number[] = [];
  for (const m of mats) {
    let idx = unique.indexOf(m);
    if (idx === -1) {
      idx = unique.length;
      unique.push(m);
    }
    remap.push(idx);
  }
  if (unique.length === mats.length && mesh.geometry.groups.length <= unique.length) return;
  const geo = mesh.geometry;
  const index = geo.index;
  if (!index) return;
  const buckets: number[][] = unique.map(() => []);
  for (const g of geo.groups) {
    const u = remap[g.materialIndex ?? 0] ?? 0;
    const dst = buckets[u];
    const end = Math.min(index.count, g.start + g.count);
    for (let i = g.start; i < end; i++) dst.push(index.getX(i));
  }
  const total = buckets.reduce((s, b) => s + b.length, 0);
  const out = geo.attributes.position.count > 65535 ? new Uint32Array(total) : new Uint16Array(total);
  geo.clearGroups();
  let offset = 0;
  for (let u = 0; u < buckets.length; u++) {
    const b = buckets[u];
    if (!b.length) continue;
    out.set(b, offset);
    geo.addGroup(offset, b.length, u);
    offset += b.length;
  }
  geo.setIndex(new BufferAttribute(out, 1));
  mesh.material = unique.length === 1 ? unique[0] : unique;
}

function toFloatClone(src: BufferGeometry): BufferGeometry {
  const dst = new BufferGeometry();
  if (src.index) {
    const idx = src.index;
    const arr = new Uint32Array(idx.count);
    for (let i = 0; i < idx.count; i++) arr[i] = idx.getX(i);
    dst.setIndex(new BufferAttribute(arr, 1));
  }
  for (const name of Object.keys(src.attributes).sort()) {
    const attr = src.attributes[name];
    const itemSize = attr.itemSize;
    const out = new Float32Array(attr.count * itemSize);
    for (let i = 0; i < attr.count; i++) {
      const o = i * itemSize;
      out[o] = attr.getX(i);
      if (itemSize > 1) out[o + 1] = attr.getY(i);
      if (itemSize > 2) out[o + 2] = attr.getZ(i);
      if (itemSize > 3) out[o + 3] = attr.getW(i);
    }
    dst.setAttribute(name, new Float32BufferAttribute(out, itemSize));
  }
  return dst;
}

const batchedRoots = new WeakSet<Object3D>();

/** Batches static same-material leaf meshes under `root` without touching named/interactive sub-parts. */
function mergeStaticLeaves(propName: string, root: Object3D, skipNode?: (o: Object3D) => boolean) {
  if (batchedRoots.has(root)) return;
  batchedRoots.add(root);
  root.traverse((o) => {
    if ((o as Mesh).isMesh) coalesceMaterialGroups(o as Mesh);
  });
  if (propName === "cube" || propName === "clock" || propName === "globe") return;

  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const rootDet = rootInv.determinant();

  if (propName === "books") {
    let sharedBooksMat: MeshStandardMaterial | null = null;
    for (const child of root.children) {
      const m = child as Mesh;
      const mat = m.material as MeshStandardMaterial | undefined;
      if (!m.isMesh || Array.isArray(m.material) || !mat?.isMeshStandardMaterial || mat.transparent || mat.map) continue;
      sharedBooksMat ??= new MeshStandardMaterial({ vertexColors: true, roughness: mat.roughness, metalness: mat.metalness });
      const count = m.geometry.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = mat.color.r;
        colors[i * 3 + 1] = mat.color.g;
        colors[i * 3 + 2] = mat.color.b;
      }
      const nextGeo = m.geometry.clone();
      nextGeo.setAttribute("color", new Float32BufferAttribute(colors, 3));
      m.geometry = nextGeo;
      m.material = sharedBooksMat;
    }
  }

  const buckets = new Map<Material, Map<string, Mesh[]>>();
  const rel = new Matrix4();

  const collect = (node: Object3D) => {
    if (node !== root) {
      if (!node.visible || node.userData?.hotspot || PROTECTED_SUBNODES.has(node.name) || skipNode?.(node)) return;
    }
    const mesh = node as Mesh;
    if (
      mesh.isMesh &&
      node !== root &&
      mesh.children.length === 0 &&
      !Array.isArray(mesh.material) &&
      !(mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh &&
      !(mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh &&
      Object.keys(mesh.geometry.morphAttributes).length === 0 &&
      mesh.matrixWorld.determinant() * rootDet > 0
    ) {
      const geo = mesh.geometry;
      const sig = `${mesh.castShadow ? 1 : 0}:${mesh.receiveShadow ? 1 : 0}:${mesh.renderOrder}:${geo.index ? 1 : 0}:${Object.keys(geo.attributes)
        .sort()
        .map((k) => `${k}${geo.attributes[k].itemSize}`)
        .join(",")}`;
      let bySig = buckets.get(mesh.material);
      if (!bySig) {
        bySig = new Map();
        buckets.set(mesh.material, bySig);
      }
      const list = bySig.get(sig) ?? [];
      list.push(mesh);
      bySig.set(sig, list);
      return;
    }
    for (const c of node.children) collect(c);
  };
  collect(root);

  for (const [material, bySig] of buckets) {
    for (const meshes of bySig.values()) {
      if (meshes.length < 2) continue;
      const geos: BufferGeometry[] = [];
      for (const m of meshes) {
        const g = toFloatClone(m.geometry);
        rel.multiplyMatrices(rootInv, m.matrixWorld);
        g.applyMatrix4(rel);
        geos.push(g);
      }
      const mergedGeo = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!mergedGeo) continue;
      const first = meshes[0];
      const batch = new Mesh(mergedGeo, material);
      batch.castShadow = first.castShadow;
      batch.receiveShadow = first.receiveShadow;
      batch.renderOrder = first.renderOrder;
      root.add(batch);
      for (const m of meshes) m.removeFromParent();
    }
  }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Out of a move that's already going (stepping back), and into one that keeps going (sitting down). */
const easeOut = (t: number) => 1 - (1 - t) ** 1.8;
const easeIn = (t: number) => t ** 1.8;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

function contactShadow(): Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.75)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const mesh = new Mesh(
    new PlaneGeometry(0.75, 0.65),
    new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0005;
  return mesh;
}

/** A plain beige stand-in until the real model is in public/models. */
function standIn(): { root: Group; screen: Screen; tube: Mesh } {
  const root = new Group();
  const beige = new MeshStandardMaterial({ color: "#d9cdb0", roughness: 0.6 });
  const dark = new MeshStandardMaterial({ color: "#2b2620", roughness: 0.8 });
  const base = new Mesh(new BoxGeometry(0.42, 0.09, 0.4), beige);
  base.position.set(0, 0.045, 0.02);
  const keys = new Mesh(new BoxGeometry(0.34, 0.012, 0.12), dark);
  keys.position.set(0, 0.096, 0.14);
  const monitor = new Mesh(new BoxGeometry(0.38, 0.31, 0.32), beige);
  monitor.position.set(0, 0.09 + 0.155, -0.06);
  const bezel = new Mesh(new BoxGeometry(0.32, 0.24, 0.01), dark);
  bezel.position.set(0, 0.25, 0.102);
  root.add(base, keys, monitor, bezel);
  return { root, tube: bezel, screen: { center: new Vector3(0, 0.25, 0.108), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), width: 0.29, height: 0.2175 } };
}

async function loadModel(onProgress: (f: number) => void): Promise<{ root: Group; screen: Screen; tube: Mesh } | null> {
  Cache.enabled = true;
  let gltf: GLTF | null = null;
  if (parsedModelJob) {
    const job = parsedModelJob;
    parsedModelJob = null;
    gltf = await job;
  } else {
    if (binaryFlights.has(MODEL.url)) {
      const buf = await binaryFlights.get(MODEL.url);
      if (!buf) return null;
    }
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      gltf = await loader.loadAsync(MODEL.url, (e) => e.total && onProgress(e.loaded / e.total));
    } catch {
      return null;
    }
  }
  if (!gltf) return null;
  onProgress(1);
  const model = gltf.scene;
  const root = new Group();
  root.add(model);
  root.updateMatrixWorld(true);

  let tube: Mesh | null = null;
  model.traverse((o) => {
    const mesh = o as Mesh;
    const name = (mesh.material as { name?: string } | undefined)?.name ?? "";
    if (!tube && mesh.isMesh && MODEL.screenMaterial.test(name)) tube = mesh;
  });
  if (!tube) return null;

  // Turn the model so the tube faces +z, scale it so the tube is MODEL.screenWidth wide, and stand it on y = 0.
  const measure = () => measureTube(tube!);
  const facing = measure().normal;
  model.rotation.y = -Math.atan2(facing.x, facing.z);
  root.updateMatrixWorld(true);
  model.scale.multiplyScalar(MODEL.screenWidth / measure().width);
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  const centre = box.getCenter(new Vector3());
  model.position.sub(new Vector3(centre.x, box.min.y, centre.z));
  root.updateMatrixWorld(true);

  const tubeShape = measure();
  return {
    tube: tube as Mesh,
    root,
    screen: {
      center: tubeShape.center,
      normal: tubeShape.normal,
      up: tubeShape.up,
      width: tubeShape.width * MODEL.inset,
      height: tubeShape.height * MODEL.inset,
    },
  };
}

/** Centre, outward normal and extents of the curved tube, from its vertices in world space. */
function measureTube(mesh: Mesh): Screen {
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const nrm = geo.getAttribute("normal");
  const m = mesh.matrixWorld;
  const normalMatrix = new Matrix3().getNormalMatrix(m);
  const normal = new Vector3();
  const points: Vector3[] = [];
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    points.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
    if (nrm) normal.add(v.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix));
  }
  normal.normalize();
  // A basis on the glass: "up" is world up with the normal removed.
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal).normalize();
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity, maxN = -Infinity;
  const origin = points[0].clone();
  for (const p of points) {
    const d = v.subVectors(p, origin);
    const r = d.dot(right), u = d.dot(up), n = d.dot(normal);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    maxN = Math.max(maxN, n);
  }
  // Sit just in front of the bulge's crown so the flat terminal clears the curved glass.
  const center = origin
    .clone()
    .addScaledVector(right, (minR + maxR) / 2)
    .addScaledVector(up, (minU + maxU) / 2)
    .addScaledVector(normal, maxN + 0.001);
  return { center, normal, up, width: maxR - minR, height: maxU - minU };
}

/**
 * The tube: a hole in the canvas (so the terminal underneath shows through), darkened towards its
 * rounded edges like a real CRT, with a soft reflection of the window. Written premultiplied with
 * no blending, so its alpha is how much of the terminal it covers.
 */
function glassMaterial(screen: Screen, windowDir: Vector3) {
  const right = new Vector3().crossVectors(screen.up, screen.normal);
  return new ShaderMaterial({
    blending: NoBlending,
    uniforms: {
      uCenter: { value: screen.center },
      uRight: { value: right },
      uUp: { value: screen.up },
      uHalf: { value: new Vector2(screen.width / 2 / MODEL.inset, screen.height / 2 / MODEL.inset) },
      uWindow: { value: windowDir },
      uStrength: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCenter, uRight, uUp, uWindow;
      uniform vec2 uHalf;
      uniform float uStrength;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 p = vWorld - uCenter;
        vec2 uv = vec2(dot(p, uRight), dot(p, uUp)) / uHalf;
        // Rounded-rectangle distance: 0 in the middle, 1 at the glass edge.
        vec2 q = max(abs(uv) - 0.72, 0.0) / 0.28;
        float edge = clamp(length(q), 0.0, 1.0);
        float shade = 0.62 * pow(edge, 1.6);
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.25;
        vec3 r = reflect(-v, n);
        float window = smoothstep(0.86, 0.99, dot(r, uWindow)) * 0.16;
        float sheen = 0.035 + fresnel + window;
        float a = clamp(shade + sheen, 0.0, 1.0) * uStrength;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * sheen * uStrength, a);
      }`,
  });
}

export async function createDesk(opts: {
  host: HTMLElement;
  screenEl: HTMLElement;
  glow: string;
  onSitDown: () => void;
  onProgress: (fraction: number) => void;
  /** Types a command into the terminal (a floppy opens its project, the phone runs contact). */
  run: (command: string) => void;
  /** Clears the terminal and boots it again (the power strip). */
  reboot?: () => Promise<void>;
  /** The sound layer (audio.ts); the desk works silently without it. */
  sound?: {
    play(cue: Cue, opts?: { pan?: number; volume?: number }): void;
    music(on: boolean): Promise<void>;
    loop(name: "room" | "hum", on: boolean): void;
    setInside(t: number): void;
    mount(parent: HTMLElement): void;
    muted(): boolean;
    setMuted(m: boolean): void;
  };
}): Promise<Desk> {
  const { host, screenEl } = opts;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const isPhone = window.matchMedia("(max-width: 640px) and (pointer: coarse)").matches;

  // Desktops draw through the finishing pass (post.ts: AO, bloom, grade), which anti-aliases its own
  // scene target, so the canvas needs none; phones keep the plain path and the canvas's MSAA.
  const renderer = new WebGLRenderer({ antialias: isPhone, alpha: true, powerPreference: "high-performance" });
  // A stable render grid avoids resampling fine lines and reallocating the HDR targets on each drag.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isPhone ? 1.25 : 1.5));
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  // Real shadows from the window and the lamp, but drawn only when something moves (see `relight`):
  // between those, orbiting and idling cost the same as without them.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const css = new CSS3DRenderer();
  css.domElement.className = "desk-css";
  host.append(css.domElement, renderer.domElement);

  const scene = new Scene();

  scene.background = new Color("#05060a");
  // Desktop: the environment is the room itself, captured once it's built and lit (see
  // `captureRoom` below). Phones keep the cheap path: a generic studio environment, no post.
  const post: Post | null = !isPhone && postSupported(renderer) ? createPost(renderer, scene) : null;
  if (!post) {
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  // Just enough fill that the shadowed faces still read: cool from above (the night), warm from the desk.
  const fill = new HemisphereLight("#6a7aa6", "#1a120b", 0.06);
  scene.add(fill);
  // The desk lamp's light. Off until the lamp model arrives and puts it on its bulb (props.ts);
  // without the model, it comes on here, over the desk.
  const lamp = new SpotLight("#ffb36b", 0, 6, 0.55, 0.6, 2);
  lamp.castShadow = true;
  const lampMapSize = isPhone ? 512 : 1024;
  lamp.shadow.mapSize.set(lampMapSize, lampMapSize);
  lamp.shadow.camera.near = 0.05;
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.01;
  lamp.shadow.radius = 4;
  lamp.position.set(-0.9, 1.5, 0.7);
  lamp.target.position.set(0, 0.15, 0);
  // The bulb's glow inside the shade, and a camera flash: made now, at 0, so the number of lights
  // (and with it every shader) never changes later.
  const spill = new PointLight("#ffb36b", 0, 0.16, 2); // reaches the inside of the shade, not the wall
  lamp.userData.spill = spill;
  const flash = new PointLight("#f4f6ff", 0, 1.2, 2);
  scene.add(lamp, lamp.target, spill, flash, contactShadow());

  // The computer and the room load together, so the first wide shot is never an empty void.
  const roomLoader = new GLTFLoader();
  roomLoader.setMeshoptDecoder(MeshoptDecoder);
  MeshoptDecoder.useWorkers?.(2); // decode the models off the main thread
  // Start props.glb in parallel if idle prefetch hasn't pre-parsed it yet, and reuse any in-flight work.
  const preParsedProps = parsedPropsJob;
  parsedPropsJob = null;
  const propsPrefetch = preParsedProps ? null : fetchBinaryCached(PROPS_URL, false);
  const rawLoadAsync = roomLoader.loadAsync.bind(roomLoader);
  roomLoader.loadAsync = async (url, onProgress) => {
    if (url === PROPS_URL) {
      if (preParsedProps) {
        const readyGltf = await preParsedProps;
        if (readyGltf) {
          onProgress?.(new ProgressEvent("progress", { lengthComputable: true, loaded: 1, total: 1 }));
          return readyGltf;
        }
      }
      await propsPrefetch;
    }
    const gltf = await rawLoadAsync(url, onProgress);
    onProgress?.(new ProgressEvent("progress", { lengthComputable: true, loaded: 1, total: 1 }));
    return gltf;
  };
  Cache.enabled = true;
  if (imageFlights.size) await Promise.all([...imageFlights.values()]);
  const roomAssets = loadRoom();
  // Progress: the computer is the first third, the props the rest.
  const loaded = await loadModel((f) => opts.onProgress(f * 0.35));
  const { root, screen, tube } = loaded ?? standIn();
  root.name = "computer"; // the Apple II, for features (the caption names it)
  scene.add(root);
  const room = buildRoom(scene, await roomAssets, new Box3().setFromObject(root), {
    initTexture: (t) => renderer.initTexture(t),
    skyScale: isPhone ? 0.5 : 1,
    sunMapSize: isPhone ? 1024 : 2048,
  });
  // The home-lab corner, past the right end of the desk, sits in the wall's shadow from the low
  // left sun; place a soft room fill out in front of the angled rack so every shelf and tool reads.
  const labLight = new PointLight("#ffd19c", 1.65, 4.2, 1.45);
  labLight.position.set(room.desk.maxX + 0.36, 0.62, room.wallZ + 1.05);
  scene.add(labLight);
  // Dust in the sunbeam (desktop only), and the room's own environment: one capture per time of
  // day, swapped as the light turns (see `captureRoom`). Until the first capture it's black, at
  // the capture's size, so the shaders compile once.
  const atmosphere = post ? createAtmosphere(scene, room, lamp, renderer.getPixelRatio()) : null;
  const probe = post ? createRoomProbe(renderer, scene, new Vector3(0.1, 0.32, screen.center.z + 0.3)) : null;
  const envs: Record<Time, WebGLRenderTarget | null> = { dusk: probe?.blank() ?? null, night: null };
  if (envs.dusk) scene.environment = envs.dusk.texture;
  /** Dusk (the default: warm, everything reads) or the middle of the night (the window toggles it). */
  let time: Time = "dusk";
  let timeK = 0; // 0 dusk … 1 night, where the light is right now
  let screenGlow: PointLight | null = null; // made below, with the screen
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const fillDusk = new Color("#e6d5bf"), fillNight = new Color("#4d6fb8");
  const groundDusk = new Color("#2e1d12"), groundNight = new Color("#101524");
  const labDusk = new Color("#ffd19c"), labNight = new Color("#5f83cc");
  /** Puts every light at `k` of the way from dusk to night. */
  const applyTime = (k: number) => {
    timeK = k;
    room.blend(k);
    fill.color.copy(fillDusk).lerp(fillNight, k);
    fill.groundColor.copy(groundDusk).lerp(groundNight, k);
    // The captured room is its own bounce light (so the flat fill can drop); the swap happens half
    // way, when the sky dips.
    fill.intensity = probe ? lerp(0.12, 0.2, k) : lerp(0.21, 0.2, k);
    const env = (k >= 0.5 ? envs.night : envs.dusk) ?? envs.dusk ?? envs.night;
    if (env && scene.environment !== env.texture) scene.environment = env.texture;
    scene.environmentIntensity = probe ? lerp(0.75, 1.0, k) : lerp(0.11, 0.08, k);
    renderer.toneMappingExposure = lerp(0.94, 0.88, k);
    labLight.color.copy(labDusk).lerp(labNight, k);
    labLight.intensity = lerp(1.65, 0.62, k);
    if (screenGlow) screenGlow.intensity = lerp(0.25, 0.55, k);
    atmosphere?.blend(k);
  };
  /**
   * Captures the room into the environment for `which` time of day, as lit right now (twice: the
   * second sees the first one's bounce). After load, at the end of a change of light, on idle for
   * the other time of day. A few small renders, never per frame.
   */
  let capturedKey = "";
  const stale: Record<Time, boolean> = { dusk: true, night: true };
  const lightKey = () => `${lamp.intensity.toFixed(2)}|${spill.intensity.toFixed(2)}`;
  const captureRoom = (which: Time) => {
    if (!probe) return;
    const was = timeK;
    applyTime(which === "night" ? 1 : 0);
    const hide = atmosphere ? [atmosphere.object] : [];
    for (let i = 0; i < 2; i++) {
      envs[which] = probe.capture(envs[which], hide);
      scene.environment = envs[which]!.texture;
    }
    stale[which] = false;
    capturedKey = lightKey();
    applyTime(was); // and back to wherever the light is
  };
  /** The lamp went on or off: the room it lights is a different room. Recaptured once it settles. */
  let recaptureTimer = 0;
  const lightChanged = () => {
    if (!capturedKey || lightKey() === capturedKey) return;
    clearTimeout(recaptureTimer);
    recaptureTimer = window.setTimeout(() => {
      if (blackoutRunning || lightKey() === capturedKey) return;
      stale[time === "dusk" ? "night" : "dusk"] = true; // captured again when the time turns
      captureRoom(time);
      request();
    }, 400);
  };
  const setTime = (next: Time) => {
    time = next;
    applyTime(next === "night" ? 1 : 0);
  };
  /** The window clicked: the sky turns and the light slides over, a second or so, not a cut. */
  const fadeTime = (next: Time) => {
    time = next;
    const from = timeK;
    const to = next === "night" ? 1 : 0;
    return animate(1100, (t) => applyTime(lerp(from, to, ease(t)))).then(() => {
      if (time === next && (stale[next] || !envs[next])) captureRoom(next);
    });
  };
  setTime(time);

  const glass = glassMaterial(screen, room.windowCenter.clone().sub(screen.center).normalize());
  tube.material = glass;
  tube.renderOrder = 1;
  if (loaded) {
    // The model's plastics are near white. Keep them that way (a clean machine, not a yellowed
    // one): only a whisper of warmth, so the warm lamp and sun do the tinting, and a satin finish.
    loaded.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh === loaded.tube) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mat = m as MeshStandardMaterial;
        if (!mat.color || /screen/i.test(mat.name)) continue;
        mat.color.multiply(new Color("#f4f1ec"));
        mat.roughness = Math.min(Math.max(mat.roughness, 0.5), 0.6);
        mat.envMapIntensity = post ? 1.15 : 1.6; // a little of the room (captured, see captureRoom) in the plastic's sheen
      }
    });
  }

  // The screen lights the room in the theme's colour: the keys, the desk in front, the drives.
  // Low at dusk (the sun and the lamp do the work), stronger at night (see setTime).
  const glow = new PointLight(opts.glow, 0.25, 1.7, 2);
  // out in front, so it washes the keys and the desk instead of blowing out the bezel around it
  glow.position.copy(screen.center).addScaledVector(screen.normal, 0.32);
  scene.add(glow);
  screenGlow = glow;

  // The terminal, as DOM, on the tube.
  const scale = Math.min(screen.width / SCREEN_W, screen.height / SCREEN_H);
  const holder = document.createElement("div");
  holder.style.width = `${SCREEN_W}px`;
  holder.style.height = `${SCREEN_H}px`;
  const screenObject = new CSS3DObject(holder);
  screenObject.position.copy(screen.center);
  const right = new Vector3().crossVectors(screen.up, screen.normal);
  screenObject.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, screen.up, screen.normal));
  screenObject.scale.setScalar(scale);
  scene.add(screenObject);
  const worldW = SCREEN_W * scale;
  const worldH = SCREEN_H * scale;

  // A near plane of 5 cm (the close-up is ~30 cm away) keeps depth precision for the flat props.
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 30);
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  // Props flank the computer and the wall has things on it, so the wide shot frames the desk, not just the machine.
  size.x += 0.62;
  size.y += 0.12;
  // Looking at the desk from just above head height, nearly straight on, the computer in the middle:
  // the whole desk, the window on the left, the map behind, the shelf and the lab corner on the right.
  const target = new Vector3(0.05, 0.28, -0.1);
  const camTarget = new Vector3();
  let controls: OrbitControls | null = null;

  let vw = 0;
  let vh = 0;
  let seated = true;
  let transitioning = false;
  let monitorFocused = false;
  const resize = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    renderer.setSize(vw, vh);
    css.setSize(vw, vh);
    fitTube();
    // A little closer or further than the wide shot, never into the keys or out of the room.
    // (The layout editor frees the camera and sets its own limits.)
    // At the desk, keep where you're looking but sit where the new window shape puts you.
    if (monitorFocused && !transitioning) place(monitorPose());
    if (!seated && !transitioning && !editing && look.active) {
      sitAt(widePose());
      const [minYaw, maxYaw] = yawBounds();
      look.toYaw = clamp(look.toYaw, minYaw, maxYaw);
      updateLook(true);
    }
    request();
  };

  /**
   * The terminal's CSS size in the tube: exactly the close-up rect, so stepping back changes the
   * screen's shape but never its text size (the hand-off is at scale 1).
   */
  let tubeW = SCREEN_W;
  let tubeH = SCREEN_H;
  function fitTube() {
    const term = screenEl.querySelector<HTMLElement>(".term");
    const atBottom = term && term.scrollHeight - term.scrollTop - term.clientHeight < 3;
    // Match the projected size for reading in the monitor. The wider desk view uses the
    // fullscreen hand-off dimensions so the slide into and out of the glass still lines up.
    tubeH = monitorFocused
      ? Math.max(210, Math.round(monitorPose().rect.h))
      : Math.max(TUBE_MIN_H, Math.round(closeUp().rect.h));
    tubeW = Math.round((tubeH * SCREEN_W) / SCREEN_H);
    holder.style.width = `${tubeW}px`;
    holder.style.height = `${tubeH}px`;
    screenObject.scale.setScalar(worldH / tubeH);
    if (term && atBottom) term.scrollTop = term.scrollHeight;
  }

  /** Camera distance where the screen fills FILL of the window, and the rect it lands on. */
  const closeUp = (fill = FILL) => {
    const tan = Math.tan((FOV * Math.PI) / 360);
    const k = Math.min(fill, (fill * camera.aspect * worldH) / worldW);
    const distance = worldH / (2 * tan * k);
    const h = k * vh;
    const w = (worldW / worldH) * h;
    return {
      position: screen.center.clone().addScaledVector(screen.normal, distance),
      target: screen.center.clone(),
      rect: { x: (vw - w) / 2, y: (vh - h) / 2, w, h },
    };
  };

  const monitorPose = () => closeUp(camera.aspect < 1 ? 0.51 : 0.56); // leave the housing and the desk around the tube in view

  /** Far enough back to frame the room around the desk (about 2.4 m of it). */
  function wideDistance() {
    const tan = Math.tan((FOV * Math.PI) / 360);
    // On tall screens let the outer props crop rather than shrinking the computer to a speck.
    const fit = Math.max(size.y, (2.25 * (camera.aspect < 1 ? 0.5 : 1)) / camera.aspect);
    return fit / (2 * tan);
  }
  // A three-quarter view from the front right: the window's light comes across from the left, the
  // lamp is in the foreground. The layout editor can replace it (`view` in layout.json).
  const savedView = (locked as unknown as { view?: { dir: number[]; target: number[]; k: number } }).view;
  const widePose = () => {
    const dir = new Vector3(...((savedView?.dir ?? [0.7, 0.57, 2.05]) as [number, number, number])).normalize();
    const at = savedView ? new Vector3(...(savedView.target as [number, number, number])) : target.clone();
    // Tall screens crop the sides: centre on the machine so it isn't cut off.
    if (camera.aspect < 1) at.x = bounds.getCenter(new Vector3()).x;
    return { position: at.clone().addScaledVector(dir, wideDistance() * (savedView?.k ?? 1)), target: at };
  };

  // ── looking around, as someone sitting at the desk: the head stays put, the eyes turn ─────────
  // Drag turns your head (grab the room and pull it), the wheel leans you in or back a little.
  const LIMITS = { yaw: 0.62, up: 0.32, down: 0.5, lean: [-0.08, 0.32] as const };
  const look = { active: false, yaw: 0, pitch: 0, lean: 0, toYaw: 0, toPitch: 0, toLean: 0, baseYaw: 0, basePitch: 0, head: new Vector3() };
  const lookEuler = new Euler(0, 0, 0, "YXZ");
  const forward = new Vector3();
  /** Sits you at a pose: the head goes there, and straight ahead is where it looks. */
  function sitAt(pose: { position: Vector3; target: Vector3 }) {
    const dir = pose.target.clone().sub(pose.position).normalize();
    look.head.copy(pose.position);
    look.baseYaw = Math.atan2(-dir.x, -dir.z);
    look.basePitch = Math.asin(dir.y);
  }
  /** Eases the head towards where you're pulling it; true while it's still moving. */
  function updateLook(snap = false) {
    if (!look.active) return false;
    const k = snap ? 1 : 0.16;
    look.yaw += (look.toYaw - look.yaw) * k;
    look.pitch += (look.toPitch - look.pitch) * k;
    look.lean += (look.toLean - look.lean) * k;
    lookEuler.set(look.basePitch + look.pitch, look.baseYaw + look.yaw, 0);
    camera.quaternion.setFromEuler(lookEuler);
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.position.copy(look.head).addScaledVector(forward, look.lean);
    return Math.abs(look.toYaw - look.yaw) + Math.abs(look.toPitch - look.pitch) + Math.abs(look.toLean - look.lean) > 1e-4;
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // Portrait screens crop horizontally, so let the head turn a bit further left to the window and right to the rack.
  const yawBounds = () => (camera.aspect < 1 ? ([-0.68, 0.72] as const) : ([-LIMITS.yaw, LIMITS.yaw] as const));
  function turnHead(dx: number, dy: number) {
    // a full drag across the window turns the head about as far as it goes
    const [minYaw, maxYaw] = yawBounds();
    look.toYaw = clamp(look.toYaw + (dx / vw) * 1.6, minYaw, maxYaw);
    look.toPitch = clamp(look.toPitch + (dy / vh) * 1.2, -LIMITS.down, LIMITS.up);
    request();
  }
  function leanBy(amount: number) {
    look.toLean = clamp(look.toLean + amount, LIMITS.lean[0], LIMITS.lean[1]);
    request();
  }
  /** Whatever you're looking at becomes the target the flight back into the screen starts from. */
  function lookTarget() {
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    return camera.position.clone().addScaledVector(forward, 1);
  }

  // Render on demand only.
  let running = false;
  let tween: ((now: number) => boolean) | null = null;
  /** Props in motion (interact.ts): each returns false when it's done. */
  const motions = new Set<(now: number) => boolean>();
  let frameMs = 0; // how long the last frame took: the heartbeat stays away from a slow machine
  let nextDraw = 0; // when the next frame is due (rAF time)
  /** Counters for devtools (`__desk.stats`): frames drawn, frames that redrew the shadow maps, frames skipped by the cap. */
  const stats = { frames: 0, shadowFrames: 0, capped: 0 };
  const frame = (now: number) => {
    // At most ~60 frames a second. ProMotion and other 120/144 Hz displays call rAF twice as often,
    // and each frame here is a full HDR render with AO and bloom: the extra frames only make heat.
    // Every tween and motion is timed by the clock, not by frames, so skipping one changes nothing.
    // Frames are due every 1/60 s (with 2 ms of slack for jitter), so 90, 100, 120 and 144 Hz all
    // average 60; after a pause the schedule restarts from now.
    if (now < nextDraw - 2) {
      stats.capped++;
      requestAnimationFrame(frame);
      return;
    }
    nextDraw = Math.max(nextDraw + FRAME_MS, now + FRAME_MS / 2);
    const tweening = tween ? tween(now) : false;
    if (!tweening) tween = null;
    for (const m of motions) if (!m(now)) motions.delete(m);
    const moving = controls?.enabled ? controls.update() : updateLook();
    // Moving things move their shadows; light-only changes (the time of day, the lamp's flicker, a
    // flash, steam) and the camera don't, so the shadow maps are redrawn only when a caster or a
    // shadow-casting light really moved (including the last step of an animation).
    if (shadowsMoved()) renderer.shadowMap.needsUpdate = true;
    if (renderer.shadowMap.needsUpdate) stats.shadowFrames++;
    // Seated, the canvas is hidden: motions still finish, but nothing is drawn that nobody sees.
    if (!host.hidden) {
      const t0 = performance.now();
      renderer.render(scene, camera);
      css.render(scene, camera);
      frameMs = performance.now() - t0;
      stats.frames++;
    }
    if (tweening || moving || motions.size) requestAnimationFrame(frame);
    else running = false;
  };

  /**
   * Whether anything the shadow maps draw has changed since the last check: every visible
   * shadow-casting mesh (where it is, its geometry's version, whether it's shown) and every
   * shadow-casting light (where it is, where it points, its cone). Casters marked
   * `userData.lazyShadow` (the clock's hands) don't count. A few thousand numbers compared,
   * against redrawing a 2048² and a 1024² depth map of the whole room (~300 draw calls).
   */
  let shadowSig = new Float64Array(4096);
  let nextSig = new Float64Array(4096);
  let shadowLen = -1;
  function shadowsMoved() {
    scene.updateMatrixWorld();
    let n = 0;
    const put = (v: number) => {
      if (n === nextSig.length) {
        const grown = new Float64Array(n * 2);
        grown.set(nextSig);
        nextSig = grown;
      }
      nextSig[n++] = v;
    };
    const putMatrix = (m: Matrix4) => {
      for (let i = 0; i < 16; i++) put(m.elements[i]);
    };
    scene.traverseVisible((o) => {
      const light = o as SpotLight;
      if (light.isLight) {
        if (!light.castShadow) return;
        put(o.id);
        putMatrix(o.matrixWorld);
        if (light.target) putMatrix(light.target.matrixWorld);
        put(light.angle ?? 0);
        put(light.distance ?? 0);
        return;
      }
      const mesh = o as Mesh;
      if (!mesh.isMesh || !mesh.castShadow || o.userData.lazyShadow) return;
      put(o.id);
      putMatrix(o.matrixWorld);
      const geometry = mesh.geometry;
      put(geometry.id);
      put((geometry.getAttribute("position") as BufferAttribute | undefined)?.version ?? 0);
      put(Array.isArray(mesh.material) ? 1 : mesh.material.visible ? 1 : 0);
      const instanced = mesh as unknown as { isInstancedMesh?: boolean; count: number; instanceMatrix: BufferAttribute };
      if (instanced.isInstancedMesh) {
        put(instanced.count);
        put(instanced.instanceMatrix.version);
      }
      if (mesh.morphTargetInfluences) for (const v of mesh.morphTargetInfluences) put(v);
      const skinned = mesh as unknown as { isSkinnedMesh?: boolean; skeleton: { bones: Object3D[] } };
      if (skinned.isSkinnedMesh) for (const bone of skinned.skeleton.bones) putMatrix(bone.matrixWorld);
    });
    let changed = n !== shadowLen;
    for (let i = 0; !changed && i < n; i++) changed = nextSig[i] !== shadowSig[i];
    [shadowSig, nextSig] = [nextSig, shadowSig];
    shadowLen = n;
    return changed;
  }

  // A light that's off (the lamp switched off, the blackout) lights nothing, so its shadow map
  // isn't redrawn while it's off; it's redrawn the moment it comes back on if anything moved
  // meanwhile. (The light itself stays in the scene: removing it would recompile every shader.)
  const unlitShadows = new Set<object>();
  const renderShadows = renderer.shadowMap.render;
  renderer.shadowMap.render = function (this: typeof renderer.shadowMap, lights, s, c) {
    let any = this.needsUpdate;
    for (const light of lights as SpotLight[]) {
      light.shadow.autoUpdate = false;
      const lit = light.intensity > 0;
      if (this.needsUpdate) {
        light.shadow.needsUpdate = lit;
        if (lit) unlitShadows.delete(light);
        else unlitShadows.add(light);
      } else if (lit && unlitShadows.has(light)) {
        light.shadow.needsUpdate = true;
        unlitShadows.delete(light);
        any = true;
      }
    }
    if (!any) return;
    this.needsUpdate = true;
    renderShadows.call(this, lights, s, c);
  };
  const animate = (ms: number, step: (t: number) => void) =>
    new Promise<void>((done) => {
      const start = performance.now();
      const duration = reduced() ? Math.min(ms, 1) : ms;
      motions.add((now) => {
        const t = Math.min(1, (now - start) / duration);
        step(t);
        if (t < 1) return true;
        done();
        return false;
      });
      request();
    });
  function request() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
  /** Something in the scene moved or arrived: redraw the shadow maps on the next frame. */
  function relight() {
    (lamp.userData.sync as (() => void) | undefined)?.(); // the light rides on the lamp's bulb
    renderer.shadowMap.needsUpdate = true;
    lightChanged();
    request();
  }
  relight();
  window.addEventListener("resize", () => {
    if (!host.hidden) resize();
  });
  // The heartbeat: about once a second while the desk is in view, the lab's activity lights
  // re-roll and one frame is drawn. Nothing else runs between frames.
  window.setInterval(() => {
    if (host.hidden || seated || transitioning || document.hidden || reduced() || !pulses.size || running || frameMs > 40) return;
    for (const pulse of pulses) pulse();
    request();
  }, 1100);

  // ── framing a prop up close (DeskApi.frame), and coming back to the seat ─────────────────────
  let framedNow = false;
  const frameOn = async (target: Object3D | Box3, o: { dir?: Vector3; fill?: number; ms?: number } = {}) => {
    if (seated || transitioning) return;
    setMonitorFocus(false);
    const box = target instanceof Box3 ? target.clone() : new Box3().setFromObject(target);
    const centre = box.getCenter(new Vector3());
    const radius = Math.max(0.03, box.getSize(new Vector3()).length() / 2);
    if (look.active) {
      camTarget.copy(lookTarget()); // the flight starts from where you're looking
      look.active = false;
    }
    const dir = (o.dir?.clone() ?? camera.position.clone().sub(centre)).normalize();
    const distance = radius / Math.tan(((FOV * Math.PI) / 360) * (o.fill ?? 0.6));
    framedNow = true;
    transitioning = true;
    if (touch.leave()) request();
    await fly({ position: centre.clone().addScaledVector(dir, distance), target: centre }, o.ms ?? 900, glass.uniforms.uStrength.value as number, ease);
    transitioning = false;
  };
  const unframe = async (ms = 900) => {
    if (!framedNow || seated || transitioning) return;
    setMonitorFocus(false);
    transitioning = true;
    const wide = widePose();
    await fly(wide, ms, glass.uniforms.uStrength.value as number, ease);
    sitAt(wide);
    Object.assign(look, { active: true, yaw: 0, pitch: 0, lean: 0, toYaw: 0, toPitch: 0, toLean: 0 });
    updateLook(true);
    framedNow = false;
    transitioning = false;
    request();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && framedNow && !seated && !transitioning) void unframe();
  });

  const fly = (to: { position: Vector3; target: Vector3 }, ms: number, glassTo = glass.uniforms.uStrength.value as number, curve = ease) =>
    new Promise<void>((done) => {
      const glassFrom = glass.uniforms.uStrength.value as number;
      const fromPos = camera.position.clone();
      const fromTarget = (controls ? controls.target : camTarget).clone();
      const fromOffset = fromPos.clone().sub(fromTarget);
      const toOffset = to.position.clone().sub(to.target);
      const fromDistance = fromOffset.length();
      const toDistance = toOffset.length();
      const direction = new Vector3();
      const start = performance.now();
      const duration = reduced() ? 0 : ms;
      tween = (now) => {
        const t = duration ? Math.min(1, (now - start) / duration) : 1;
        const e = curve(t);
        // Distance changes by the same ratio each moment (not the same metres), so the screen
        // shrinks or grows at an even rate instead of lurching while the camera is close to it.
        camTarget.lerpVectors(fromTarget, to.target, e);
        controls?.target.copy(camTarget);
        direction.lerpVectors(fromOffset, toOffset, e).normalize();
        camera.position.copy(camTarget).addScaledVector(direction, fromDistance * (toDistance / fromDistance) ** e);
        camera.lookAt(camTarget);
        // The glass comes in over the first third of the flight out, and goes in the last third back.
        const g = glassTo > glassFrom ? Math.min(1, t * 3) : Math.max(0, (t - 2 / 3) * 3);
        glass.uniforms.uStrength.value = glassFrom + (glassTo - glassFrom) * g;
        if (t >= 1) {
          done();
          return false;
        }
        return true;
      };
      request();
    });

  const place = (pose: { position: Vector3; target: Vector3 }) => {
    camera.position.copy(pose.position);
    camTarget.copy(pose.target);
    controls?.target.copy(pose.target);
    camera.lookAt(pose.target);
  };

  type Rect = { x: number; y: number; w: number; h: number };
  const fullWindow = (): Rect => ({ x: 0, y: 0, w: vw, h: vh });
  /**
   * Puts the fixed terminal on `rect` (window pixels). The fullscreen rect lays it out at the
   * window's size; the tube rect at the tube's size, scaled to fit (1 unless the window is tiny).
   */
  const pin = (rect: Rect) => {
    const full = rect.w === vw && rect.h === vh && rect.x === 0 && rect.y === 0;
    const w = full ? vw : tubeW;
    const h = full ? vh : tubeH;
    screenEl.style.width = `${w}px`;
    screenEl.style.height = `${h}px`;
    screenEl.style.inset = "0 auto auto 0";
    screenEl.style.transform = `translate(${rect.x}px, ${rect.y}px) scale(${rect.h / h})`;
  };
  /**
   * Morphs the screen between the window and the tube: its box narrows (the text rewraps, like a
   * window being resized) while it keeps the scrollback where it was.
   */
  const animateScreen = async (rect: Rect, ms: number, curve: string) => {
    const term = screenEl.querySelector<HTMLElement>(".term");
    const bottom = term ? term.scrollHeight - term.scrollTop - term.clientHeight < 4 : false;
    const time = reduced() ? 0 : ms;
    screenEl.style.transition = time ? ["transform", "width", "height"].map((p) => `${p} ${time}ms ${curve}`).join(", ") : "none";
    pin(rect);
    const end = performance.now() + time;
    while (performance.now() < end) {
      if (term && bottom) term.scrollTop = term.scrollHeight;
      await nextFrame();
    }
    if (term && bottom) term.scrollTop = term.scrollHeight;
    screenEl.style.transition = "";
  };
  /** Moving the element to another parent resets its scroll; this carries it across. */
  const moveScreen = (to: HTMLElement) => {
    const term = screenEl.querySelector<HTMLElement>(".term");
    const top = term?.scrollTop ?? 0;
    to.append(screenEl);
    if (term) term.scrollTop = top;
    // A freshly inserted element has no "before" style, so flush one or its first transition is skipped.
    void screenEl.getBoundingClientRect();
  };
  /**
   * The glass as it's seen at the close-up pose (the hole the bezel leaves), as a mask image in the
   * terminal's own box: one small render. The shrinking screen fades into this shape, so the frame
   * where it hands over to the real glass is the same picture.
   */
  let maskCache: { key: string; url: string } | null = null;
  const glassMask = (rect: Rect) => {
    if (!loaded) return null;
    // The same window gives the same picture; reusing it also skips decoding a new mask image.
    const key = `${vw}x${vh}`;
    if (maskCache?.key === key) return maskCache.url;
    const W = 400;
    const H = 300;
    const rt = new WebGLRenderTarget(W, H);
    const strength = glass.uniforms.uStrength.value as number;
    glass.uniforms.uStrength.value = 0;
    camera.setViewOffset(vw, vh, rect.x, rect.y, rect.w, rect.h);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    renderer.setRenderTarget(null);
    camera.clearViewOffset();
    rt.dispose();
    glass.uniforms.uStrength.value = strength;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) img.data[(y * W + x) * 4 + 3] = px[((H - 1 - y) * W + x) * 4 + 3] < 128 ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    maskCache = { key, url: c.toDataURL() };
    return maskCache.url;
  };
  /** `open` 1 shows the whole screen, 0 only the glass shape; in between, the corners fade. */
  const setMask = (url: string | null, open: number) => {
    const image = url ? `linear-gradient(rgba(0,0,0,${open}), rgba(0,0,0,${open})), url(${url})` : "";
    for (const prefix of ["", "-webkit-"]) {
      screenEl.style.setProperty(`${prefix}mask-image`, image);
      screenEl.style.setProperty(`${prefix}mask-size`, "100% 100%");
    }
  };
  const fadeMask = (url: string | null, from: number, to: number, ms: number) =>
    new Promise<void>((done) => {
      if (!url) return done();
      const start = performance.now();
      const step = (now: number) => {
        const t = reduced() ? 1 : Math.min(1, (now - start) / ms);
        setMask(url, from + (to - from) * ease(t));
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
  const release = () => {
    setMask(null, 1);
    for (const p of ["width", "height", "inset", "transform", "transition", "opacity"] as const) screenEl.style.removeProperty(p === "inset" ? "inset" : p);
  };

  opts.sound?.mount(host); // the mute button, shown with the desk once stepped back
  const soundToggle = host.querySelector<HTMLElement>(".sound-toggle");
  if (soundToggle) soundToggle.hidden = true;
  const hint = document.getElementById("desk-hint");
  // The caption strip: what you're looking at, named (features set it; see DeskApi.caption).
  const captionEl = document.createElement("p");
  captionEl.className = "desk-caption";
  captionEl.hidden = true;
  host.append(captionEl);
  // Two layers: the ambient caption (what the view is centred on, rewritten all the time) and a
  // held one (a game, a take on the slate) that wins until it's released with null.
  let ambientCaption: string | null = null;
  let heldCaption: string | null = null;
  let captionText: string | null = null;
  let captionShown: string | null = null;
  const showCaption = () => {
    captionText = heldCaption ?? ambientCaption;
    if (captionShown !== captionText) {
      // "Floppy box · 6 disks": the thing on the left, its count or state on the right
      captionShown = captionText;
      const [thing, ...rest] = (captionText ?? "").split(" · ");
      const left = document.createElement("span");
      const right = document.createElement("span");
      left.textContent = thing;
      right.textContent = rest.join(" · ");
      captionEl.replaceChildren(left, right);
    }
    captionEl.hidden = !captionText || seated || (transitioning && !framedNow) || editing; // a close-up keeps it
  };
  const wideHint = coarsePointer ? "drag to look · pinch to lean · tap the Apple II to zoom in" : hint?.textContent ?? "";
  const backButton = document.createElement("button");
  backButton.textContent = "Back to desk";
  backButton.onclick = () => void unframe();
  const enterButton = document.createElement("button");
  enterButton.textContent = "Enter terminal";
  enterButton.onclick = () => void api.sitDown();
  function setMonitorFocus(focused: boolean) {
    const changed = monitorFocused !== focused;
    monitorFocused = focused;
    if (changed) fitTube();
    if (!hint) return;
    if (focused) hint.replaceChildren(backButton, enterButton);
    else hint.textContent = wideHint;
  }
  setMonitorFocus(false);

  async function focusMonitor() {
    if (monitorFocused || seated || transitioning) return;
    if (look.active) {
      camTarget.copy(lookTarget());
      look.active = false;
    }
    transitioning = true;
    framedNow = true;
    touch.leave();
    bus.emit("desk:focus", { name: "computer" });
    await fly(monitorPose(), 800, 1);
    place(monitorPose()); // account for a resize during the flight
    transitioning = false;
    setMonitorFocus(true);
    request();
  }
  const credit = document.getElementById("credit");
  if (credit && loaded) {
    const c = MODEL_CREDIT;
    const a = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    credit.innerHTML = `${a(c.url, `“${c.title}”`)} by ${c.author} · ${a(c.licenseUrl, c.license)} · the other models: <code>credits</code>`;
  }

  // The canvas is on top, so clicks on the glass are found by ray: a click (not a drag) sits you down.
  const ray = new Raycaster();
  const pointer = new Vector2();
  const onComputer = (e: PointerEvent, exact = false) => {
    pointer.set((e.clientX / vw) * 2 - 1, -(e.clientY / vh) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    if (!ray.ray.intersectsBox(bounds)) return false;
    if (exact) return ray.intersectObject(root, true).length > 0;
    return computerOccluders.some((box) => ray.ray.intersectsBox(box)) ||
      ray.intersectObject(tube, false).length > 0;
  };
  const canvas = renderer.domElement;
  const activePointers = new Map<number, { x: number; y: number }>();
  let down: { id: number; x: number; y: number } | null = null;
  let gestureMoved = false;
  let pinchDist = 0;
  let touchChipTimer = 0;
  const clearTouchChip = () => {
    if (touchChipTimer) {
      clearTimeout(touchChipTimer);
      touchChipTimer = 0;
      if (touch.leave()) request();
    }
  };
  const pairDistance = () => {
    const [a, b] = [...activePointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  canvas.addEventListener("pointerdown", (e) => {
    clearTouchChip();
    if (e.pointerType === "touch" && e.isPrimary) activePointers.clear();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (look.active) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or uncapturable pointer */
      }
    }
    if (activePointers.size === 1) {
      down = { id: e.pointerId, x: e.clientX, y: e.clientY };
      gestureMoved = false;
    } else {
      down = null;
      gestureMoved = true;
      pinchDist = pairDistance();
    }
  });
  canvas.addEventListener("wheel", (e) => {
    if (look.active) leanBy(-e.deltaY * 0.0006);
  }, { passive: true });
  canvas.addEventListener("pointercancel", (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchDist = 0;
    if (down?.id === e.pointerId) down = null;
  });
  canvas.addEventListener("pointerup", (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchDist = 0;
    const tol = e.pointerType === "touch" ? 10 : 6;
    const click = down?.id === e.pointerId && !gestureMoved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < tol;
    down = null;
    if (!click || seated || transitioning || editing) return;
    const target = touch.pick(e, vw, vh);
    if (target) {
      touch.click(target);
      if (e.pointerType === "touch" && !target.spot.nav) {
        if (touch.hover(target, e)) request(); // the bubble sits over the prop itself
        touchChipTimer = window.setTimeout(() => {
          touchChipTimer = 0;
          if (touch.leave()) request();
        }, 1800);
      }
    } else if (onComputer(e, true)) void (monitorFocused ? api.sitDown() : focusMonitor());
    else if (framedNow) void unframe(); // a click on nothing comes back from a close-up
  });
  // Hover: one raycast per frame at most, however fast the pointer moves.
  let hoverEvent: PointerEvent | null = null;
  canvas.addEventListener("pointermove", (e) => {
    if (seated || editing) return;
    const prev = activePointers.get(e.pointerId);
    if (prev) {
      if (activePointers.size >= 2) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const dist = pairDistance();
        if (look.active && pinchDist > 0 && dist > 0) leanBy((dist - pinchDist) * 0.0028);
        pinchDist = dist;
        if (touch.leave()) request();
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= (e.pointerType === "touch" ? 10 : 6)) {
        gestureMoved = true;
      }
      if (touch.leave()) request();
      if (look.active && (dx !== 0 || dy !== 0)) {
        turnHead(dx, dy);
        canvas.style.cursor = "grabbing";
      }
      return;
    }
    if (e.pointerType === "touch") return;
    if (!hoverEvent) {
      requestAnimationFrame(() => {
        const ev = hoverEvent!;
        hoverEvent = null;
        if (seated || transitioning) return touch.leave();
        const target = touch.pick(ev, vw, vh);
        const glassy = !target && onComputer(ev);
        if (glassy ? touch.say("Apple II", monitorFocused ? "enter terminal" : "zoom in", ev, tube) : touch.hover(target, ev)) request();
        canvas.style.cursor = target ? "pointer" : glassy ? "zoom-in" : "grab";
      });
    }
    hoverEvent = e;
  });
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    if (touch.leave()) request();
  });

  // The Disk II: its slot from the drive's own mesh. Two drives are stacked; disks go in the top one.
  root.updateMatrixWorld(true);
  const drive = ((): Drive | null => {
    let mesh: Mesh | undefined;
    root.traverse((x) => {
      const m = x as Mesh;
      if (m.isMesh && /diskII/i.test((m.material as MeshStandardMaterial).name ?? "")) mesh = m;
    });
    if (!mesh) return null;
    const b = new Box3().setFromObject(mesh);
    const out = new Vector3(0, 0, 1).transformDirection(root.matrixWorld);
    const slot = new Vector3((b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * 0.8, b.max.z - 0.07);
    // A disk lies flat in it, label up, label end towards you (see the disk's face in props.ts).
    const quaternion = root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 1).normalize(), Math.PI));
    const led = new Mesh(new CircleGeometry(0.0025, 16), new MeshBasicMaterial({ color: "#ff3b2a", toneMapped: false }));
    led.position.set(b.min.x + (b.max.x - b.min.x) * 0.1, b.min.y + (b.max.y - b.min.y) * 0.56, b.max.z + 0.0008);
    led.lookAt(led.position.clone().add(out));
    led.visible = false;
    scene.add(led);
    return { slot, out, quaternion, led };
  })();
  const computerOccluders: Box3[] = [];
  root.traverse((x) => {
    const m = x as Mesh;
    if (m.isMesh && m !== tube) computerOccluders.push(new Box3().setFromObject(m));
  });
  mergeStaticLeaves("computer", root, (o) => o === tube);

  if (editing) {
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.zoomSpeed = 0.6;
    controls.enabled = false;
    controls.target.copy(camTarget);
    controls.addEventListener("change", request);
  }

  // for poking at it from devtools; `draw()` is one full frame (scene, post, terminal), `api()` the DeskApi
  if (import.meta.env.DEV) Object.assign(window, { __desk: { scene, renderer, camera, look, stats, idle: () => !running, three: { Raycaster, Vector2, Vector3, Box3 }, draw: () => { renderer.render(scene, camera); css.render(scene, camera); }, api: () => deskApi, post, captureRoom } });
  let deskApi: DeskApi | null = null;
  const touch = createInteractions({
    desk: () => deskApi,
    scene,
    camera,
    host,
    animate,
    relight,
    lamp,
    flash,
    drive,
    sfx: (cue, o) => opts.sound?.play(cue as Cue, o),
    music: (on) => void opts.sound?.music(on),
    muted: () => opts.sound?.muted() ?? null,
    time: () => time,
    setTime: (next) => {
      void fadeTime(next).then(relight);
    },
    setMuted: (m) => opts.sound?.setMuted(m),
    sitDownAndRun: async (command) => {
      await focusMonitor();
      opts.run(command);
    },
  });

  let nightWarmed = false;
  const api: Desk = {
    hasModel: Boolean(loaded),
    get ready() {
      return ready;
    },
    setGlow(fg) {
      glow.color.set(fg);
      request();
    },

    async stepBack() {
      if (monitorFocused) return unframe();
      if (!seated || transitioning) return;
      await ready;
      if (!seated || transitioning) return;
      transitioning = true;
      seated = false;
      host.hidden = false;
      resize();
      const close = closeUp();
      place(close);
      relight(); // the shadow maps must be current before the first frame anyone sees

      // Fullscreen → the tube rect, still as a plain fixed element above the canvas, taking on the
      // shape of the glass as it goes. It speeds up into the hand-off and the camera carries the
      // motion on, so it reads as one move back from the screen.
      const mask = glassMask(close.rect);
      pin(fullWindow());
      setMask(mask, 1);
      await nextFrame();
      await Promise.all([animateScreen(close.rect, 380, "cubic-bezier(.45,0,.8,.5)"), fadeMask(mask, 1, 0, 380)]);

      // Hand the element to CSS3D; at the close-up pose it projects onto the same rect. The room's
      // sound opens up as you lean back.
      release();
      moveScreen(holder);
      opts.sound?.loop("room", true);
      opts.sound?.loop("hum", true);
      opts.sound?.setInside(0);
      const wide = widePose();
      await fly(wide, 1700, 1, easeOut);
      if (editing && controls) controls.enabled = true; // the layout editor's free camera
      else {
        sitAt(wide);
        Object.assign(look, { active: true, yaw: 0, pitch: 0, lean: 0, toYaw: 0, toPitch: 0, toLean: 0 });
        updateLook(true);
      }
      if (hint) hint.hidden = editing; // the editor panel has its own help
      if (credit && loaded) credit.hidden = false;
      if (soundToggle) soundToggle.hidden = false;
      transitioning = false;
      showCaption();
      void touch.warm(6000); // the coffee's still warm
      if (!nightWarmed) {
        nightWarmed = true;
        const scheduleWarmNight = () => {
          const onIdle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 900));
          onIdle(() => {
            if (running || transitioning) scheduleWarmNight();
            else {
              room.warmNight();
              if (!envs.night || stale.night) captureRoom("night"); // so the first click on the window doesn't pop
            }
          });
        };
        scheduleWarmNight();
      }
    },

    async sitDown() {
      if (seated || transitioning) return;
      transitioning = true;
      framedNow = false;
      setMonitorFocus(false);
      touch.leave();
      clearTouchChip();
      activePointers.clear();
      down = null;
      if (controls) controls.enabled = false;
      if (look.active) {
        const at = lookTarget(); // the flight starts from where you're looking
        camTarget.copy(at);
        controls?.target.copy(at);
        look.active = false;
      }
      if (hint) hint.hidden = true;
      if (credit) credit.hidden = true;
      if (soundToggle) soundToggle.hidden = true;
      captionEl.hidden = true;
      const close = closeUp();
      opts.sound?.setInside(1);
      await fly(close, 1200, 0, easeIn);

      // Back out of CSS3D onto the same rect, in the glass's shape, then grow to fill the window,
      // still moving, so the camera's push in carries straight through.
      const mask = glassMask(close.rect);
      pin(close.rect);
      setMask(mask, 0);
      moveScreen(document.body);
      await Promise.all([animateScreen(fullWindow(), 380, "cubic-bezier(.2,.5,.55,1)"), fadeMask(mask, 0, 1, 380)]);
      release();
      host.hidden = true;
      seated = true;
      transitioning = false;
      opts.onSitDown();
    },
  };

  // ── the desk, for features (src/features): built once the props map exists, below ──────────
  const centreRay = new Raycaster();
  const lookingAt = (): string | null => {
    centreRay.setFromCamera(new Vector2(0, 0), camera);
    const hit = centreRay.intersectObjects([...props.values()], true)[0];
    if (!hit) return null;
    for (let p: Object3D | null = hit.object; p; p = p.parent) if (p.name && props.get(p.name) === p) return p.name;
    return null;
  };
  let blackoutRunning = false;
  const blackout = async (ms: number, keep: Object3D[] = [], o: { terminal?: boolean } = {}) => {
    if (blackoutRunning) return;
    blackoutRunning = true;
    const kept = new Set<Object3D>();
    for (const k of keep) k.traverse((o) => kept.add(o));
    const lights: { light: { intensity: number }; was: number }[] = [];
    const emissives: { m: MeshStandardMaterial; was: number }[] = [];
    const hidden: Object3D[] = [];
    scene.traverse((o) => {
      const l = o as unknown as { isLight?: boolean; intensity: number };
      if (l.isLight && !kept.has(o)) lights.push({ light: l, was: l.intensity });
      const mesh = o as Mesh;
      if (!mesh.isMesh || kept.has(o)) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const std = m as MeshStandardMaterial;
        if (std.isMeshStandardMaterial && std.emissiveIntensity > 0) emissives.push({ m: std, was: std.emissiveIntensity });
      }
      // LEDs and the like: additive, unlit, not tone mapped
      const basic = mesh.material as MeshBasicMaterial;
      if (basic.isMeshBasicMaterial && basic.transparent && !basic.toneMapped && mesh.visible) {
        hidden.push(mesh);
      }
    });
    for (const l of lights) l.light.intensity = 0;
    for (const e of emissives) e.m.emissiveIntensity = 0;
    for (const h of hidden) h.visible = false;
    const exposure = renderer.toneMappingExposure;
    const env = scene.environmentIntensity;
    renderer.toneMappingExposure = 0.35;
    scene.environmentIntensity = 0;
    if (!o.terminal) css.domElement.style.visibility = "hidden"; // the terminal under the glass goes dark (unless a UPS keeps it up)
    opts.sound?.loop("hum", false);
    relight();
    await animate(Math.max(1, ms), () => {});
    for (const l of lights) l.light.intensity = l.was;
    for (const e of emissives) e.m.emissiveIntensity = e.was;
    for (const h of hidden) h.visible = true;
    renderer.toneMappingExposure = exposure;
    scene.environmentIntensity = env;
    css.domElement.style.visibility = "";
    opts.sound?.loop("hum", true);
    relight();
    blackoutRunning = false;
  };

  /** Uploads textures to WebGL in <= 6 ms slices so the fullscreen terminal stays responsive without burning 140 frames. */
  const uploadTextures = async (set: Iterable<Texture>) => {
    let slice = performance.now();
    for (const t of set) {
      renderer.initTexture(t);
      if (performance.now() - slice > 6) {
        await nextFrame();
        slice = performance.now();
      }
    }
  };

  // The rest of the desk streams in after the computer; everything prepares behind the fullscreen terminal.
  const props = new Map<string, Object3D>();
  resize();
  place(closeUp());
  const prepare = async (_arrivals: Object3D) => {
    for (const [name, prop] of props) mergeStaticLeaves(name, prop);
  };
  const propsReady = loaded ? addProps(scene, roomLoader, bounds, room, lamp, props, prepare, relight, featuredDisks(), (f) => opts.onProgress(0.35 + f * 0.6)) : Promise.resolve();
  // `?edit`: the layout editor, for arranging the props (never loaded otherwise).
  if (editing && loaded && controls) {
    const editorControls = controls;
    void Promise.all([import("./editor"), propsReady]).then(([{ startEditor }]) =>
      startEditor({ scene, camera, canvas, controls: editorControls, props, request: relight, sitDown: () => api.sitDown(), wideDistance }),
    );
  }

  const ready = propsReady.then(async () => {
    // Share one 64x64 radial-gradient blob shadow material across all placed props instead of 38 identical textures.
    let sharedBlobMat: MeshBasicMaterial | null = null;
    for (const [name, prop] of props) {
      mergeStaticLeaves(name, prop);
      for (const child of prop.children) {
        const m = child as Mesh;
        const mat = m.material as MeshBasicMaterial | undefined;
        const img = mat?.map?.image as { width?: number; height?: number } | undefined;
        if (m.isMesh && mat?.isMeshBasicMaterial && mat.transparent && mat.polygonOffset && img?.width === 64 && img?.height === 64 && Math.abs(m.position.y - 0.0006) < 1e-4) {
          if (!sharedBlobMat) sharedBlobMat = mat;
          else if (mat !== sharedBlobMat) {
            mat.map?.dispose();
            mat.dispose();
            m.material = sharedBlobMat;
          }
        }
      }
    }
    touch.setTargets([...props.values(), room.windowFrame], computerOccluders);
    deskApi = {
      scene,
      camera,
      props,
      request,
      relight,
      animate,
      lights: { lamp, glow, fill, lab: labLight },
      time: () => time,
      setTime: (next) => void fadeTime(next).then(relight),
      blackout,
      caption: (text) => {
        ambientCaption = text;
        showCaption();
      },
      holdCaption: (text) => {
        heldCaption = text;
        showCaption();
      },
      lookingAt,
      pulses,
      sound: opts.sound
        ? { play: (cue, o) => opts.sound!.play(cue as Cue, o), music: (on) => opts.sound!.music(on), loop: (name, on) => opts.sound!.loop(name, on), muted: () => opts.sound!.muted() }
        : null,
      terminal: { run: opts.run, reboot: opts.reboot ?? (async () => {}) },
      sitDown: focusMonitor,
      pvm: () => (props.get("crt")?.userData.pvm as PvmScreen | undefined) ?? null,
      activate: (object, o) => touch.activate(object, o),
      frame: frameOn,
      unframe,
      framed: () => framedNow,
      seated: () => seated,
      stepBack: () => api.stepBack(),
    };
    for (const f of features) {
      try {
        f.onDesk?.(deskApi);
      } catch (e) {
        console.warn(`feature ${f.name}: onDesk failed`, e);
      }
    }
    if (!lamp.intensity) {
      lamp.intensity = 14;
      relight();
    }
    // Let any cached TextureLoader callbacks (world-map.webp) attach their maps before final shader compile.
    await new Promise((r) => setTimeout(r, 0));
    // Anisotropic filtering on everything seen at a grazing angle (the mat, the desk, the map, labels):
    // the one cheap setting that separates a blurry render from a sharp one.
    const all = textures(scene);
    for (const t of all) {
      if (t.anisotropy < maxAniso && t.generateMipmaps) {
        t.anisotropy = maxAniso;
        t.needsUpdate = true;
      }
    }
    if (post) {
      settleMaterials(scene); // roughness bands, reflections for the captured room (post.ts)
      prepareGlow(scene); // what glows keys the bloom (post.ts); before the shaders compile
    }
    // With post the scene draws into a target (linear, tone mapped later), so compile for that.
    const bound = renderer.getRenderTarget();
    if (post) renderer.setRenderTarget(post.target);
    const compiling = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(bound);
    await compiling;
    await uploadTextures(all);
    renderer.shadowMap.needsUpdate = true;
    captureRoom(time); // the room, lit, as its own environment
    while (blobUrls.length) URL.revokeObjectURL(blobUrls.pop()!);
    opts.onProgress(1);
  });

  return api;
}
