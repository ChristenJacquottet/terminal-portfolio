// The desk scene: the computer on a desk in a room, with the live terminal mounted on the monitor.
// Loaded on demand by `exit`, so the terminal itself never pays for three.js.
//
// Performance rules: render only while something moves (camera tween or orbit damping), cap the
// pixel ratio, no realtime shadows (baked blob shadows instead), one PMREM environment built
// once, and the terminal stays DOM (CSS3D), so text is never re-uploaded as a texture.
//
// The CSS3D layer sits *under* the WebGL canvas. The tube is drawn as a transparent hole, so the
// terminal shows through exactly where the curved glass is: the bezel crops it, and the glass
// shader darkens the edges and reflects the window on top, which makes the flat page read as curved.
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  HemisphereLight,
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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MODEL_CREDIT } from "./credit";
import { editing } from "./layout";
import { fileName, projects } from "./content";
import { display, findFile } from "./fs";
import { createInteractions, type Drive } from "./interact";
import { addProps, type Disk } from "./props";
import { buildRoom, loadRoom } from "./room";

/** The tube's shape (4:3). In the monitor the terminal keeps the window's text size, see `fitTube`. */
const SCREEN_W = 800;
const SCREEN_H = 600;
/** Never let the terminal in the tube get shorter than this (CSS px), or a phone's tube is a postage stamp. */
const TUBE_MIN_H = 360;
const FOV = 35;
/** How much of the window the screen fills in the close-up pose, which must match the fullscreen hand-off. */
const FILL = 0.94;

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

type Screen = { center: Vector3; normal: Vector3; up: Vector3; width: number; height: number };

export type Desk = {
  stepBack(): Promise<void>;
  sitDown(): Promise<void>;
  setGlow(fg: string): void;
  hasModel: boolean;
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
function standIn(): { root: Group; screen: Screen } {
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
  return { root, screen: { center: new Vector3(0, 0.25, 0.108), normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), width: 0.29, height: 0.2175 } };
}

async function loadModel(onProgress: (f: number) => void): Promise<{ root: Group; screen: Screen; tube: Mesh } | null> {
  try {
    const head = await fetch(MODEL.url, { method: "HEAD" });
    if (!head.ok || !head.headers.get("content-type")?.match(/gltf|octet|model/)) return null;
  } catch {
    return null;
  }
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(MODEL.url, (e) => e.total && onProgress(e.loaded / e.total));
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
  sfx?: (cue: string) => void;
  music?: (on: boolean) => void;
}): Promise<Desk> {
  const { host, screenEl } = opts;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.04; // a dark room: the lamp, the screen and the window do the lighting
  pmrem.dispose();

  // Just enough fill that the shadowed faces still read: cool from above (the night), warm from the desk.
  scene.add(new HemisphereLight("#6a7aa6", "#1a120b", 0.06));
  // The desk lamp's light. Off until the lamp model arrives and puts it on its bulb (props.ts);
  // without the model, it comes on here, over the desk.
  const lamp = new SpotLight("#ffb36b", 0, 6, 0.55, 0.6, 2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.near = 0.05;
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.01;
  lamp.shadow.radius = 4;
  lamp.position.set(-0.9, 1.5, 0.7);
  lamp.target.position.set(0, 0.15, 0);
  // The bulb's glow inside the shade, and a camera flash: made now, at 0, so the number of lights
  // (and with it every shader) never changes later.
  const spill = new PointLight("#ffb36b", 0, 1.4, 2);
  lamp.userData.spill = spill;
  const flash = new PointLight("#f4f6ff", 0, 1.2, 2);
  scene.add(lamp, lamp.target, spill, flash, contactShadow());

  // The computer and the room load together, so the first wide shot is never an empty void.
  const roomLoader = new GLTFLoader();
  roomLoader.setMeshoptDecoder(MeshoptDecoder);
  MeshoptDecoder.useWorkers?.(2); // decode the models off the main thread
  const roomAssets = loadRoom(roomLoader);
  const loaded = await loadModel(opts.onProgress);
  const { root, screen } = loaded ?? standIn();
  scene.add(root);
  const room = buildRoom(scene, await roomAssets, new Box3().setFromObject(root));

  const glass = glassMaterial(screen, room.windowCenter.clone().sub(screen.center).normalize());
  if (loaded) {
    loaded.tube.material = glass;
    loaded.tube.renderOrder = 1;
  }

  // The screen lights the room in the theme's colour: the keys, the desk in front, the drives.
  const glow = new PointLight(opts.glow, 0.8, 1.6, 2);
  glow.position.copy(screen.center).addScaledVector(screen.normal, 0.12);
  scene.add(glow);

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
  // Aimed a little above the computer and from nearly eye level, so the wall gets as much of the frame as the desk.
  const target = new Vector3(0, size.y * 0.5 + 0.1, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minAzimuthAngle = -0.6;
  controls.maxAzimuthAngle = 0.6;
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 1.45;
  controls.zoomSpeed = 0.6;
  controls.enabled = false;

  let vw = 0;
  let vh = 0;
  let seated = true;
  let transitioning = false;
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
    if (!editing) {
      controls.minDistance = wideDistance() * 0.62;
      controls.maxDistance = wideDistance() * 1.12;
    }
    // At the desk, keep the viewing angle but re-frame for the new window shape.
    if (!seated && !transitioning && !editing) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, wideDistance());
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
    tubeH = Math.max(TUBE_MIN_H, Math.round(closeUp().rect.h));
    tubeW = Math.round((tubeH * SCREEN_W) / SCREEN_H);
    holder.style.width = `${tubeW}px`;
    holder.style.height = `${tubeH}px`;
    screenObject.scale.setScalar(worldH / tubeH);
  }

  /** Camera distance where the screen fills FILL of the window, and the rect it lands on. */
  const closeUp = () => {
    const tan = Math.tan((FOV * Math.PI) / 360);
    const k = Math.min(FILL, (FILL * camera.aspect * worldH) / worldW);
    const distance = worldH / (2 * tan * k);
    const h = k * vh;
    const w = (worldW / worldH) * h;
    return {
      position: screen.center.clone().addScaledVector(screen.normal, distance),
      target: screen.center.clone(),
      rect: { x: (vw - w) / 2, y: (vh - h) / 2, w, h },
    };
  };

  /** Three-quarter view from the lamp side, far enough back to see the whole machine and some desk. */
  function wideDistance() {
    const tan = Math.tan((FOV * Math.PI) / 360);
    // On tall screens let the outer props crop rather than shrinking the computer to a speck.
    const fit = Math.max(size.y, (size.x * (camera.aspect < 1 ? 0.45 : 1)) / camera.aspect, size.z * 0.6);
    return (fit / (2 * tan)) * 1.75;
  }
  const widePose = () => {
    const dir = new Vector3(-0.42, 0.24, 1).normalize();
    return { position: target.clone().addScaledVector(dir, wideDistance()), target: target.clone() };
  };

  // Render on demand only.
  let running = false;
  let tween: ((now: number) => boolean) | null = null;
  /** Props in motion (interact.ts): each returns false when it's done. */
  const motions = new Set<(now: number) => boolean>();
  const frame = (now: number) => {
    const tweening = tween ? tween(now) : false;
    if (!tweening) tween = null;
    for (const m of motions) if (!m(now)) motions.delete(m);
    if (motions.size) renderer.shadowMap.needsUpdate = true; // moving things move their shadows
    const moving = controls.enabled ? controls.update() : false;
    renderer.render(scene, camera);
    css.render(scene, camera);
    if (tweening || moving || motions.size) requestAnimationFrame(frame);
    else running = false;
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
    request();
  }
  relight();
  controls.addEventListener("change", request);
  window.addEventListener("resize", () => {
    if (!host.hidden) resize();
  });

  const fly = (to: { position: Vector3; target: Vector3 }, ms: number, glassTo = glass.uniforms.uStrength.value as number, curve = ease) =>
    new Promise<void>((done) => {
      const glassFrom = glass.uniforms.uStrength.value as number;
      const fromPos = camera.position.clone();
      const fromTarget = controls.target.clone();
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
        controls.target.lerpVectors(fromTarget, to.target, e);
        direction.lerpVectors(fromOffset, toOffset, e).normalize();
        camera.position.copy(controls.target).addScaledVector(direction, fromDistance * (toDistance / fromDistance) ** e);
        camera.lookAt(controls.target);
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
    controls.target.copy(pose.target);
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

  const hint = document.getElementById("desk-hint");
  const credit = document.getElementById("credit");
  if (credit && loaded) {
    const c = MODEL_CREDIT;
    const a = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    credit.innerHTML = `${a(c.url, `“${c.title}”`)} by ${c.author} · ${a(c.licenseUrl, c.license)} · the other models: <code>credits</code>`;
  }

  // The canvas is on top, so clicks on the glass are found by ray: a click (not a drag) sits you down.
  const ray = new Raycaster();
  const pointer = new Vector2();
  const onGlass = (e: PointerEvent) => {
    if (!loaded) return true;
    pointer.set((e.clientX / vw) * 2 - 1, -(e.clientY / vh) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObject(loaded.tube, false).length > 0;
  };
  let down: { x: number; y: number } | null = null;
  const canvas = renderer.domElement;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    const click = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6;
    down = null;
    if (!click || seated || transitioning || editing) return;
    const target = touch.pick(e, vw, vh);
    if (target) touch.click(target);
    else if (onGlass(e)) void api.sitDown();
  });
  // Hover: one raycast per frame at most, however fast the pointer moves.
  let hoverEvent: PointerEvent | null = null;
  canvas.addEventListener("pointermove", (e) => {
    if (seated || editing) return;
    if (e.buttons) {
      if (touch.leave()) request();
      return;
    }
    if (!hoverEvent) {
      requestAnimationFrame(() => {
        const ev = hoverEvent!;
        hoverEvent = null;
        if (seated || transitioning) return touch.leave();
        const target = touch.pick(ev, vw, vh);
        const glassy = !target && onGlass(ev);
        if (glassy ? touch.say("Apple II", "sit back down", ev) : touch.hover(target, ev)) request();
        canvas.style.cursor = target ? "pointer" : glassy ? "zoom-in" : "grab";
      });
    }
    hoverEvent = e;
  });
  canvas.addEventListener("pointerleave", () => {
    if (touch.leave()) request();
  });

  // The Disk II: its slot from the drive's own mesh. Two drives are stacked; disks go in the top one.
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

  if (import.meta.env.DEV) Object.assign(window, { __desk: { scene, renderer, camera } }); // for poking at it from devtools
  const touch = createInteractions({
    scene,
    camera,
    host,
    animate,
    relight,
    lamp,
    flash,
    drive,
    sfx: (cue) => opts.sfx?.(cue),
    music: (on) => opts.music?.(on),
    sitDownAndRun: async (command) => {
      await api.sitDown();
      opts.run(command);
    },
  });

  const api: Desk = {
    hasModel: Boolean(loaded),
    setGlow(fg) {
      glow.color.set(fg);
      request();
    },

    async stepBack() {
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

      // Hand the element to CSS3D; at the close-up pose it projects onto the same rect.
      release();
      moveScreen(holder);
      await fly(widePose(), 1700, 1, easeOut);
      controls.enabled = true;
      if (hint) hint.hidden = editing; // the editor panel has its own help
      if (credit && loaded) credit.hidden = false;
      transitioning = false;
      landed();
    },

    async sitDown() {
      if (seated || transitioning) return;
      transitioning = true;
      controls.enabled = false;
      if (hint) hint.hidden = true;
      if (credit) credit.hidden = true;
      const close = closeUp();
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

  // The rest of the desk streams in after the computer; each piece just asks for a frame.
  const props = new Map<string, Object3D>();
  // The loaded props wait for the first flight to land, then compile and upload a texture a frame.
  let landed = () => {};
  const firstLanding = new Promise<void>((r) => (landed = r));
  const prepare = async (arrivals: Object3D) => {
    await firstLanding;
    await renderer.compileAsync(arrivals, camera, scene);
    for (const t of textures(arrivals)) {
      renderer.initTexture(t);
      await nextFrame();
    }
  };
  const propsReady = loaded ? addProps(scene, roomLoader, bounds, room, lamp, props, prepare, relight, featuredDisks()) : Promise.resolve();
  void propsReady.then(() => {
    const parts: Box3[] = [];
    root.traverse((x) => {
      const m = x as Mesh;
      if (m.isMesh && m !== loaded?.tube) parts.push(new Box3().setFromObject(m));
    });
    touch.setTargets(props.values(), parts);
  });
  void propsReady.then(() => {
    if (lamp.intensity) return;
    lamp.intensity = 14;
    relight();
  });
  // `?edit`: the layout editor, for arranging the props (never loaded otherwise).
  if (editing && loaded) {
    void Promise.all([import("./editor"), propsReady]).then(([{ startEditor }]) =>
      startEditor({ scene, camera, canvas, controls, props, request: relight, sitDown: () => api.sitDown() }),
    );
  }

  resize();
  // Compile every shader now, behind the fullscreen terminal, so the flight out never hitches.
  place(closeUp());
  await renderer.compileAsync(scene, camera);
  for (const t of textures(scene)) renderer.initTexture(t); // the painted props, before the first frame

  return api;
}
