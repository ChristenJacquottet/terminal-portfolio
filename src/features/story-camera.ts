// The cameras really take a picture. Click the 35mm camera or the Kiev: the shutter, the flash,
// and the view you're looking at is rendered once into an offscreen target. A polaroid of it
// prints out, slides onto the desk (or the shelf, by the Kiev) and develops from grey to full
// colour over a few seconds, a little warm and faded. Three at most: the oldest goes. Click one to
// see it full size.
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  DataUtils,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from "three";
import type { DeskApi, Feature } from "./types";
import { easeInOut, easeOut, refreshChip, rendererOf, wobble } from "./story-kit";

// A polaroid, scaled to the desk: white card, the picture near its top, the wide strip below.
const CARD_W = 0.078;
const CARD_H = 0.064;
const PIC_W = 0.069;
const PIC_H = 0.044;
const PIC_TOP = 0.0045;
/** Pixels of the picture (the picture's own aspect). */
const SHOT_W = 552;
const SHOT_H = Math.round((SHOT_W * PIC_H) / PIC_W);
const KEEP = 3;
const DEVELOP_MS = 4200;

type Print = { root: Group; photo: HTMLCanvasElement; taken: Date; develop: { value: number }; material: MeshStandardMaterial; slot: number };
const prints: Print[] = [];
let desk: DeskApi | null = null;
let flash: PointLight | null = null;

const card = new MeshStandardMaterial({ color: "#f2eee4", roughness: 0.88 });
const cardGeo = new BoxGeometry(CARD_W, 0.0007, CARD_H);
const picGeo = new PlaneGeometry(PIC_W, PIC_H).rotateX(-Math.PI / 2);

/** A picture's material: the photo, with a uniform that runs from milky grey (0) to full colour (1). */
function developing(map: CanvasTexture) {
  const develop = { value: 0 };
  const m = new MeshStandardMaterial({ map, roughness: 0.42 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDevelop = develop;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uDevelop;").replace(
      "#include <map_fragment>",
      /* glsl */ `#include <map_fragment>
      {
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 milk = vec3(0.34, 0.35, 0.33);
        float shape = smoothstep(0.0, 0.55, uDevelop);
        float colour = smoothstep(0.3, 1.0, uDevelop);
        vec3 mono = mix(milk, vec3(lum) * vec3(1.02, 1.0, 0.94), shape);
        diffuseColor.rgb = mix(mono, diffuseColor.rgb, colour);
      }`,
    );
  };
  m.customProgramCacheKey = () => "story-polaroid";
  return { material: m, develop };
}

// three's ACES filmic curve (what the renderer does on screen), applied to the linear render.
const acesIn = [0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777];
const acesOut = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];
const rrt = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Renders the view once, offscreen, and develops it into a warm, slightly faded print. */
function takePicture(renderer: WebGLRenderer, scene: Scene, camera: Camera, exposure: number): HTMLCanvasElement {
  const cam = camera as PerspectiveCamera;
  // The render at the screen's aspect, then cropped to the picture's.
  const h = SHOT_H + 40;
  const w = Math.max(SHOT_W, Math.round(h * (cam.aspect || 1.6)));
  const target = new WebGLRenderTarget(w, h, { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter });
  const before = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(before);
  const raw = new Uint16Array(w * h * 4);
  let ok = true;
  try {
    renderer.readRenderTargetPixels(target, 0, 0, w, h, raw);
  } catch {
    ok = false;
  }
  target.dispose();
  const out = document.createElement("canvas");
  out.width = SHOT_W;
  out.height = SHOT_H;
  const g = out.getContext("2d")!;
  const img = g.createImageData(SHOT_W, SHOT_H);
  const x0 = Math.floor((w - SHOT_W) / 2);
  const y0 = Math.floor((h - SHOT_H) / 2);
  const k = exposure / 0.6;
  const d = img.data;
  for (let y = 0; y < SHOT_H; y++) {
    const row = h - 1 - (y0 + y); // GL rows run bottom up
    for (let x = 0; x < SHOT_W; x++) {
      const i = (row * w + x0 + x) * 4;
      let r = ok ? DataUtils.fromHalfFloat(raw[i]) * k : 0;
      let gg = ok ? DataUtils.fromHalfFloat(raw[i + 1]) * k : 0;
      let b = ok ? DataUtils.fromHalfFloat(raw[i + 2]) * k : 0;
      const a = ok ? DataUtils.fromHalfFloat(raw[i + 3]) : 1;
      // where the canvas is see-through (the screen's glass), the terminal's dark shows instead
      r = r * a + 0.02 * (1 - a);
      gg = gg * a + 0.03 * (1 - a);
      b = b * a + 0.035 * (1 - a);
      const ir = acesIn[0] * r + acesIn[1] * gg + acesIn[2] * b;
      const ig = acesIn[3] * r + acesIn[4] * gg + acesIn[5] * b;
      const ib = acesIn[6] * r + acesIn[7] * gg + acesIn[8] * b;
      const fr = rrt(ir);
      const fg = rrt(ig);
      const fb = rrt(ib);
      let R = toSrgb(Math.min(1, Math.max(0, acesOut[0] * fr + acesOut[1] * fg + acesOut[2] * fb)));
      let G = toSrgb(Math.min(1, Math.max(0, acesOut[3] * fr + acesOut[4] * fg + acesOut[5] * fb)));
      let B = toSrgb(Math.min(1, Math.max(0, acesOut[6] * fr + acesOut[7] * fg + acesOut[8] * fb)));
      // instant film: blacks lifted, highlights softened, a warm cast, a little less colour
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      R = L + (R - L) * 0.86;
      G = L + (G - L) * 0.86;
      B = L + (B - L) * 0.86;
      R = 0.07 + R * 0.88 * 1.05;
      G = 0.06 + G * 0.88 * 1.0;
      B = 0.05 + B * 0.88 * 0.86;
      // and darker towards the corners
      const dx = x / SHOT_W - 0.5;
      const dy = y / SHOT_H - 0.5;
      const v = 1 - 0.38 * (dx * dx + dy * dy) * 1.6;
      const j = (y * SHOT_W + x) * 4;
      d[j] = Math.min(255, R * v * 255);
      d[j + 1] = Math.min(255, G * v * 255);
      d[j + 2] = Math.min(255, B * v * 255);
      d[j + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

/**
 * Where prints come to rest, by camera, in the room: offsets from the camera on the desk (x, z),
 * the desk top's height, and which way the print lies. Picked from a top-down look at the desk so
 * they land on bare wood (between the camera, the Super 8 and the papers), not under anything.
 */
const SPOTS: Record<string, { x: number; z: number; y?: number; turn: number }[]> = {
  camera: [
    { x: 0.1, z: 0.064, turn: 0.25 },
    { x: -0.126, z: 0.118, turn: -0.35 },
    { x: 0.236, z: 0.238, turn: 0.5 },
  ],
  // the Kiev is on the shelf, with no room beside it: its prints drop to the bare desk under the shelf
  kiev: [
    { x: -0.11, z: 0.046, y: 0, turn: 0.3 },
    { x: -0.19, z: 0.076, y: 0, turn: -0.25 },
    { x: -0.03, z: 0.026, y: 0, turn: 0.75 },
  ],
};

/** A resting place in the camera holder's own space (position, and turn about its up). */
function restOf(camera: Object3D, n: number): { position: Vector3; turn: number } {
  const spot = (SPOTS[camera.name] ?? SPOTS.camera)[n % 3];
  camera.updateMatrixWorld(true);
  const at = camera.getWorldPosition(new Vector3());
  const world = new Vector3(at.x + spot.x, (spot.y ?? at.y) + 0.0004 + n * 0.0006, at.z + spot.z);
  return { position: camera.worldToLocal(world), turn: spot.turn - camera.rotation.y };
}

function printOf(photo: HTMLCanvasElement): Print {
  const tex = new CanvasTexture(photo);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const { material, develop } = developing(tex);
  const root = new Group();
  root.name = "polaroid";
  const paper = new Mesh(cardGeo, card);
  paper.position.y = 0.00035;
  const pic = new Mesh(picGeo, material);
  pic.position.set(0, 0.0008, -CARD_H / 2 + PIC_TOP + PIC_H / 2);
  root.add(paper, pic);
  root.traverse((o) => {
    (o as Mesh).castShadow = true;
    (o as Mesh).receiveShadow = true;
  });
  root.userData.hotspot = { kind: "polaroid", label: "a polaroid", hint: "look at it" };
  return { root, photo, taken: new Date(), develop, material, slot: 0 };
}

async function shoot(object: Object3D, sfx: (cue: string, at?: Object3D, volume?: number) => void, animate: DeskApi["animate"], camera: Camera, leave: () => void) {
  const d = desk;
  if (!d) return;
  leave(); // no rim light in the picture
  sfx("shutter", object);
  const renderer = await rendererOf(d.scene, d.request);
  const exposure = renderer.toneMappingExposure;
  // the picture is the moment the shutter opens, before the flash lights the room
  const photo = takePicture(renderer, d.scene, camera, exposure);
  object.updateMatrixWorld();
  if (flash) {
    flash.position.copy(object.getWorldPosition(new Vector3())).add(new Vector3(0, 0.08, 0.06));
    void animate(320, (t) => (flash!.intensity = 6 * (1 - t) ** 2)).then(() => (flash!.intensity = 0));
  }
  const print = printOf(photo);
  // The oldest goes: it slides off and is gone.
  if (prints.length >= KEEP) {
    const old = prints.shift()!;
    const from = old.root.position.clone();
    const s0 = old.root.scale.x;
    void animate(380, (t) => {
      old.root.position.y = from.y + 0.01 * Math.sin(t * Math.PI);
      old.root.scale.setScalar(s0 * (1 - easeOut(t)));
    }).then(() => {
      old.root.removeFromParent();
      old.material.map?.dispose();
      old.material.dispose();
    });
  }
  // The first free place by this camera.
  const taken = new Set(prints.filter((p) => p.root.parent === object).map((p) => p.slot));
  print.slot = [0, 1, 2].find((i) => !taken.has(i)) ?? 0;
  const rest = restOf(object, print.slot);
  const holderScale = object.getWorldScale(new Vector3()).x || 1;
  print.root.scale.setScalar(1 / holderScale);
  object.add(print.root);
  prints.push(print);
  // Out of the camera's side, a breath of motor, then down onto the desk with a little skid.
  // the slot: the middle of the camera's body (the model, not the prints), in the holder's space
  const body = object.children.find((c) => c.name !== "polaroid" && (c as Mesh).geometry === undefined) ?? object;
  body.updateMatrixWorld(true);
  const inside = object.worldToLocal(new Box3().setFromObject(body).getCenter(new Vector3()));
  const out = inside.clone().add(new Vector3(0.05 / holderScale, 0.012 / holderScale, 0.03 / holderScale));
  const end = rest.position.clone();
  print.root.position.copy(inside);
  print.root.rotation.set(0, rest.turn - 0.6, 0);
  print.root.scale.setScalar(0.2 / holderScale);
  sfx("polaroidOut", object);
  await animate(560, (t) => {
    const e = easeOut(t);
    print.root.position.lerpVectors(inside, out, e);
    print.root.scale.setScalar(((0.2 + 0.8 * e) / holderScale));
    print.root.rotation.z = 0.25 * (1 - e);
  });
  // from a shelf it drops, fluttering side to side like paper does
  const drop = Math.max(0, (out.y - end.y) * holderScale);
  const flutter = Math.min(1, drop / 0.3);
  await animate(620 + 900 * flutter, (t) => {
    const e = flutter ? t * t * (3 - 2 * t) : easeInOut(t);
    print.root.position.lerpVectors(out, end, e);
    print.root.position.y += (0.035 / holderScale) * Math.sin(t * Math.PI) * (1 - t * 0.4);
    print.root.position.x += (0.05 / holderScale) * flutter * Math.sin(t * Math.PI * 3) * (1 - t);
    print.root.rotation.y = rest.turn - 0.6 + 0.6 * e + 0.05 * wobble(t, 1.2, 3);
    print.root.rotation.z = (0.08 + 0.5 * flutter) * Math.sin(t * Math.PI * (1 + 2 * flutter)) * (1 - t);
    print.root.rotation.x = (0.06 + 0.25 * flutter) * Math.sin(t * Math.PI * 2) * (1 - t);
  });
  print.root.position.copy(end);
  print.root.rotation.set(0, rest.turn, 0);
  sfx("paper", object, 0.35);
  d.relight();
  void develop(print, animate);
}

/** From milky grey, the shapes come up, then the colour. */
async function develop(print: Print, animate: DeskApi["animate"]) {
  const t0 = performance.now();
  await animate(DEVELOP_MS, () => {
    const t = Math.min(1, (performance.now() - t0) / DEVELOP_MS);
    print.develop.value = 1 - (1 - t) ** 1.6;
  });
  print.develop.value = 1;
  desk?.request();
}

// ── full size: a DOM overlay over the desk ───────────────────────────────────────────────────
let overlay: HTMLElement | null = null;
function style() {
  if (document.getElementById("story-photo-style")) return;
  const s = document.createElement("style");
  s.id = "story-photo-style";
  s.textContent = `
.story-photo{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(6,5,4,.74);opacity:0;transition:opacity .25s ease;cursor:zoom-out;padding:24px}
.story-photo.open{opacity:1}
.story-photo figure{margin:0;background:#f4f0e6;padding:clamp(10px,2.2vw,22px) clamp(10px,2.2vw,22px) clamp(44px,7vw,74px);border-radius:2px;box-shadow:0 22px 60px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.35);transform:rotate(-1.4deg) scale(.94);transition:transform .35s cubic-bezier(.2,.9,.3,1.15);cursor:default;max-width:min(92vw,980px);position:relative}
.story-photo.open figure{transform:rotate(-1.4deg) scale(1)}
.story-photo img{display:block;width:min(86vw,936px);height:auto;max-height:70vh;object-fit:contain;background:#555}
.story-photo figcaption{position:absolute;left:0;right:0;bottom:clamp(12px,2.2vw,24px);text-align:center;font:500 clamp(13px,1.6vw,17px)/1.2 "IBM Plex Mono",ui-monospace,monospace;color:#3b352c;letter-spacing:.02em}
.story-photo button,.story-photo a{position:absolute;top:-14px;font:12px/1 "IBM Plex Mono",ui-monospace,monospace;color:#fff;background:rgba(8,8,10,.86);border:1px solid rgba(255,232,194,.5);border-radius:14px;padding:7px 11px;cursor:pointer;text-decoration:none}
.story-photo button{right:-14px}
.story-photo a{right:44px}
.story-photo button:hover,.story-photo a:hover,.story-photo button:focus-visible,.story-photo a:focus-visible{background:#000;outline:none;border-color:#ffe8c2}
`;
  document.head.append(s);
}

export function photoOpen() {
  return overlay !== null;
}

function close() {
  const o = overlay;
  if (!o) return;
  overlay = null;
  o.classList.remove("open");
  window.setTimeout(() => o.remove(), 260);
  window.removeEventListener("keydown", onKey, true);
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && overlay) {
    e.stopImmediatePropagation();
    e.preventDefault();
    close();
  }
}

function open(print: Print) {
  if (overlay) close();
  style();
  const o = document.createElement("div");
  o.className = "story-photo";
  o.setAttribute("role", "dialog");
  o.setAttribute("aria-label", "the polaroid, full size");
  const fig = document.createElement("figure");
  const img = document.createElement("img");
  const url = print.photo.toDataURL("image/jpeg", 0.92);
  img.src = url;
  img.alt = "a polaroid of the desk, as you were looking at it";
  const cap = document.createElement("figcaption");
  cap.textContent = print.taken.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "close ×";
  x.setAttribute("aria-label", "close");
  const save = document.createElement("a");
  save.href = url;
  save.download = `desk-polaroid-${print.taken.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.jpg`;
  save.textContent = "save";
  fig.append(img, cap, save, x);
  o.append(fig);
  o.addEventListener("click", (e) => {
    if (e.target === o || e.target === x) close();
  });
  fig.addEventListener("click", (e) => {
    if (e.target !== x && e.target !== save) e.stopPropagation();
  });
  document.body.append(o);
  overlay = o;
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => o.classList.add("open"));
  x.focus({ preventScroll: true });
}

const cameras: Feature = {
  name: "story-camera",
  hotspots: {
    camera: { kind: "photo", label: "35mm camera", hint: "take a picture" },
    kiev: { kind: "photo", label: "Kiev rangefinder", hint: "take a picture" },
  },
  label(object, spot) {
    if (spot.kind === "polaroid") {
      const p = prints.find((x) => x.root === object);
      if (!p) return null;
      return ["a polaroid", p.develop.value < 0.98 ? "still developing · look at it" : "look at it"];
    }
    if (spot.kind === "photo") {
      const n = prints.length;
      return [spot.label, n ? `take another · ${n} on the desk` : "take a picture"];
    }
    return null;
  },
  onDesk(d) {
    desk = d;
    // the camera flash desk.ts made at load (a cold PointLight at 0)
    d.scene.traverse((o) => {
      const l = o as PointLight;
      if (!flash && l.isPointLight && l.distance === 1.2 && l.color.getHexString() === "f4f6ff") flash = l;
    });
    void rendererOf(d.scene, () => {});
  },
  actions: {
    async photo({ object, sfx, once, animate, camera, leave }) {
      await once(object, () => shoot(object, sfx, animate, camera, leave));
      refreshChip();
    },
    polaroid({ object, sfx, leave }) {
      const p = prints.find((x) => x.root === object);
      if (!p) return;
      leave();
      sfx("paper", object, 0.4);
      open(p);
    },
  },
};

export default cameras;
