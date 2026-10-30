// The desk scene: the computer, a desk and a lamp, with the live terminal mounted on the monitor.
// Loaded on demand by `exit`, so the terminal itself never pays for three.js.
//
// Performance rules: render only while something moves (camera tween or orbit damping), cap the
// pixel ratio, no realtime shadows (a baked contact shadow instead), one PMREM environment built
// once, and the terminal stays DOM (CSS3D), so text is never re-uploaded as a texture.
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  Color,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SpotLight,
  Vector3,
  WebGLRenderer,
  Box3,
  Matrix3,
  Matrix4,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MODEL_CREDIT } from "./credit";
import { addProps } from "./props";

/** CSS size of the terminal while it sits in the monitor (a 4:3 tube). */
const SCREEN_W = 800;
const SCREEN_H = 600;
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
  /** Fraction of the glass the terminal covers, so it sits inside the bezel. */
  inset: 0.95,
};

type Screen = { center: Vector3; normal: Vector3; up: Vector3; width: number; height: number };

export type Desk = {
  stepBack(): Promise<void>;
  sitDown(): Promise<void>;
  setGlow(fg: string, bg: string): void;
  hasModel: boolean;
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function woodTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a2f1c";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * c.height;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? "20,10,4" : "110,70,40"},${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= c.width; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 2.5);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(2, 3);
  t.anisotropy = 4;
  return t;
}

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
    new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
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

export async function createDesk(opts: {
  host: HTMLElement;
  screenEl: HTMLElement;
  glow: string;
  /** Theme background, for the glass around the terminal. */
  glass: string;
  onSitDown: () => void;
  onProgress: (fraction: number) => void;
}): Promise<Desk> {
  const { host, screenEl } = opts;

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const css = new CSS3DRenderer();
  css.domElement.className = "desk-css";
  host.append(renderer.domElement, css.domElement);

  const scene = new Scene();
  scene.background = new Color("#070605");
  scene.fog = new Fog("#070605", 2.2, 6);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();

  scene.add(new HemisphereLight("#ffeedd", "#1a120c", 0.35));
  const lamp = new SpotLight("#ffd29a", 14, 6, 0.55, 0.75, 2);
  lamp.position.set(-0.9, 1.5, 0.7);
  lamp.target.position.set(0, 0.15, 0);
  scene.add(lamp, lamp.target);

  const desk = new Mesh(new BoxGeometry(2.6, 0.04, 1.3), new MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 }));
  desk.position.set(0, -0.02, 0.05);
  const wall = new Mesh(new PlaneGeometry(8, 4), new MeshStandardMaterial({ color: "#1b1713", roughness: 1 }));
  wall.position.set(0, 1.2, -0.75);
  scene.add(desk, wall, contactShadow());

  const loaded = await loadModel(opts.onProgress);
  const { root, screen } = loaded ?? standIn();
  scene.add(root);

  // The tube's own texture is a pale grey; dark glossy glass in the theme colour reads as a lit CRT.
  const glass = new MeshStandardMaterial({ color: opts.glass, roughness: 0.12, metalness: 0, emissive: opts.glow, emissiveIntensity: 0.04 });
  if (loaded) loaded.tube.material = glass;

  const glow = new PointLight(opts.glow, 0.06, 0.6, 2);
  glow.position.copy(screen.center).addScaledVector(screen.normal, 0.18);
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

  const camera = new PerspectiveCamera(FOV, 1, 0.01, 20);
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  // Props flank the computer, so the wide shot frames a little more than the machine.
  size.x += 0.35;
  const target = new Vector3(0, size.y * 0.5, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = Math.max(size.x, size.y) * 0.9;
  controls.maxDistance = Math.max(size.x, size.y) * 8;
  controls.minAzimuthAngle = -0.65;
  controls.maxAzimuthAngle = 0.65;
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 1.52;
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
    // Fog starts just behind the computer at any framing distance.
    const fog = scene.fog as Fog;
    fog.near = wideDistance() * 1.05;
    fog.far = wideDistance() * 3.2;
    // At the desk, keep the viewing angle but re-frame for the new window shape.
    if (!seated && !transitioning) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, wideDistance());
    }
    request();
  };

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
    const fit = Math.max(size.y, (size.x * (camera.aspect < 1 ? 0.62 : 1)) / camera.aspect, size.z * 0.6);
    return (fit / (2 * tan)) * 1.75;
  }
  const widePose = () => {
    const dir = new Vector3(-0.42, 0.34, 1).normalize();
    return { position: target.clone().addScaledVector(dir, wideDistance()), target: target.clone() };
  };

  // Render on demand only.
  let running = false;
  let tween: ((now: number) => boolean) | null = null;
  const frame = (now: number) => {
    const tweening = tween ? tween(now) : false;
    if (!tweening) tween = null;
    const moving = controls.enabled ? controls.update() : false;
    renderer.render(scene, camera);
    css.render(scene, camera);
    if (tweening || moving) requestAnimationFrame(frame);
    else running = false;
  };
  function request() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
  controls.addEventListener("change", request);
  window.addEventListener("resize", () => {
    if (!host.hidden) resize();
  });

  const fly = (to: { position: Vector3; target: Vector3 }, ms: number) =>
    new Promise<void>((done) => {
      const fromPos = camera.position.clone();
      const fromTarget = controls.target.clone();
      const start = performance.now();
      const duration = reduced() ? 0 : ms;
      tween = (now) => {
        const t = duration ? Math.min(1, (now - start) / duration) : 1;
        const e = ease(t);
        camera.position.lerpVectors(fromPos, to.position, e);
        controls.target.lerpVectors(fromTarget, to.target, e);
        camera.lookAt(controls.target);
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

  /** Puts the fullscreen terminal at `rect` (window pixels) at its 4:3 desk size. */
  const pin = (rect: { x: number; y: number; w: number; h: number }) => {
    screenEl.style.width = `${SCREEN_W}px`;
    screenEl.style.height = `${SCREEN_H}px`;
    screenEl.style.inset = "0 auto auto 0";
    screenEl.style.transform = `translate(${rect.x}px, ${rect.y}px) scale(${rect.h / SCREEN_H})`;
  };
  /** The 4:3 screen fitted inside the window: nothing is cropped, the bezel shows around it. */
  const fitWindow = () => {
    const s = Math.min(vw / SCREEN_W, vh / SCREEN_H);
    return { x: (vw - SCREEN_W * s) / 2, y: (vh - SCREEN_H * s) / 2, w: SCREEN_W * s, h: SCREEN_H * s };
  };
  const animateScreen = async (rect: { x: number; y: number; w: number; h: number }, ms: number) => {
    screenEl.style.transition = reduced() ? "none" : `transform ${ms}ms cubic-bezier(.65,0,.35,1)`;
    pin(rect);
    await wait(reduced() ? 0 : ms);
    screenEl.style.transition = "";
  };
  const release = () => {
    for (const p of ["width", "height", "inset", "transform", "transition", "opacity"] as const) screenEl.style.removeProperty(p === "inset" ? "inset" : p);
  };

  const hint = document.getElementById("desk-hint");
  const credit = document.getElementById("credit");
  if (credit && loaded) {
    const c = MODEL_CREDIT;
    credit.innerHTML = `<a href="${c.url}" target="_blank" rel="noopener noreferrer">“${c.title}”</a> by ${c.author} · <a href="${c.licenseUrl}" target="_blank" rel="noopener noreferrer">${c.license}</a>`;
  }

  holder.addEventListener("click", () => {
    if (!seated) void api.sitDown();
  });

  const api: Desk = {
    hasModel: Boolean(loaded),
    setGlow(fg, bg) {
      glow.color.set(fg);
      glass.color.set(bg);
      glass.emissive.set(fg);
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
      request();

      // Fullscreen → the 4:3 tube rect, still as a plain fixed element above the canvas.
      screenEl.style.opacity = "0";
      pin(fitWindow());
      await nextFrame();
      screenEl.style.opacity = "";
      await animateScreen(close.rect, 420);

      // Hand the element to CSS3D; at the close-up pose it projects onto the same rect.
      release();
      holder.append(screenEl);
      request();
      await nextFrame();

      await fly(widePose(), 1500);
      controls.enabled = true;
      if (hint) hint.hidden = false;
      if (credit && loaded) credit.hidden = false;
      transitioning = false;
    },

    async sitDown() {
      if (seated || transitioning) return;
      transitioning = true;
      controls.enabled = false;
      if (hint) hint.hidden = true;
      if (credit) credit.hidden = true;
      const close = closeUp();
      await fly(close, 1100);

      // Back out of CSS3D onto the same rect, then grow to fill the window.
      document.body.append(screenEl);
      pin(close.rect);
      await nextFrame();
      await animateScreen(fitWindow(), 380);
      release();
      host.hidden = true;
      seated = true;
      transitioning = false;
      opts.onSitDown();
    },
  };

  // The rest of the desk streams in after the computer; each piece just asks for a frame.
  if (loaded) {
    const propLoader = new GLTFLoader();
    propLoader.setMeshoptDecoder(MeshoptDecoder);
    void addProps(scene, propLoader, bounds, lamp, request);
  }

  resize();
  return api;
}
