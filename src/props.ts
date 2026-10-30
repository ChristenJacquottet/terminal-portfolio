// Things on the desk around the computer. Loaded after the computer so `exit` never waits on them.
// Models: Poly Haven (CC0), merged into public/models/props.glb, one glTF scene per prop in this order.
import {
  Box3,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SpotLight,
  TorusGeometry,
  Vector2,
  Vector3,
  type Object3D,
  type Scene,
} from "three";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const PROPS_URL = "/models/props.glb";
const ORDER = ["lamp", "cassette", "notepads", "pens", "spectacles", "duck"] as const;

/** Soft blob shadow under a prop (no realtime shadows anywhere). */
function blob(width: number, depth: number, strength = 0.6): Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, `rgba(0,0,0,${strength})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const m = new Mesh(new PlaneGeometry(width, depth), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.0015;
  return m;
}

/** Sits `object` on the desk at (x, z), scaled so its height (or width) is `size` metres. */
function place(object: Object3D, x: number, z: number, opts: { height?: number; width?: number; rotY?: number; y?: number } = {}) {
  const holder = new Group();
  holder.add(object);
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const scale = opts.height ? opts.height / size.y : opts.width ? opts.width / Math.max(size.x, size.z) : 1;
  object.scale.multiplyScalar(scale);
  box.setFromObject(object);
  const c = box.getCenter(new Vector3());
  object.position.sub(new Vector3(c.x, box.min.y, c.z));
  holder.position.set(x, opts.y ?? 0, z);
  holder.rotation.y = opts.rotY ?? 0;
  const footprint = new Box3().setFromObject(object).getSize(new Vector3());
  if (!opts.y) holder.add(blob(footprint.x * 1.3, footprint.z * 1.3));
  return holder;
}

function mug(): Group {
  const g = new Group();
  const ceramic = new MeshStandardMaterial({ color: "#b8342b", roughness: 0.35 });
  const profile = [
    [0, 0], [0.036, 0], [0.04, 0.004], [0.04, 0.095], [0.036, 0.095], [0.035, 0.008], [0, 0.008],
  ].map(([x, y]) => new Vector2(x, y));
  g.add(new Mesh(new LatheGeometry(profile, 32), ceramic));
  const handle = new Mesh(new TorusGeometry(0.025, 0.0055, 10, 20, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.04, 0.05, 0);
  const coffee = new Mesh(new CylinderGeometry(0.035, 0.035, 0.001, 32), new MeshStandardMaterial({ color: "#2a160b", roughness: 0.15 }));
  coffee.position.y = 0.08;
  g.add(handle, coffee);
  return g;
}

/** A small stack of 5¼" floppies with hand-written labels. */
function floppies(labels: string[]): Group {
  const g = new Group();
  const sleeve = new MeshStandardMaterial({ color: "#0a0a0a", roughness: 0.85 });
  labels.forEach((text, i) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f2ead2";
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = "#c8432b";
    ctx.fillRect(0, 0, 256, 10);
    ctx.fillStyle = "#1d2a6b";
    ctx.font = "italic 34px 'Comic Sans MS', 'Marker Felt', cursive";
    ctx.fillText(text, 14, 62);
    const label = new CanvasTexture(c);
    label.colorSpace = SRGBColorSpace;
    const disk = new Mesh(new PlaneGeometry(0.133, 0.133), sleeve);
    disk.rotation.x = -Math.PI / 2;
    const sticker = new Mesh(new PlaneGeometry(0.09, 0.034), new MeshStandardMaterial({ map: label, roughness: 0.8, side: DoubleSide }));
    sticker.rotation.x = -Math.PI / 2;
    sticker.position.set(0, 0.0006, -0.038);
    const hub = new Mesh(new CylinderGeometry(0.016, 0.016, 0.0004, 24), new MeshStandardMaterial({ color: "#3b3022", roughness: 0.9 }));
    hub.position.y = 0.0003;
    const layer = new Group();
    layer.add(disk, sticker, hub);
    layer.position.y = 0.0022 * i + 0.001;
    layer.rotation.y = (i - 1) * 0.18;
    g.add(layer);
  });
  return g;
}

/**
 * Loads and arranges the desk props around the computer. `bounds` is the computer's world box;
 * the lamp's light is moved onto the lamp head. Calls `onChange` whenever the scene needs a frame.
 */
export async function addProps(scene: Scene, loader: GLTFLoader, bounds: Box3, light: SpotLight, onChange: () => void) {
  const { min, max } = bounds;
  const front = max.z;

  // The code-made props first: they cost nothing to load.
  scene.add(place(mug(), max.x + 0.07, front - 0.02, { height: 0.095 }));
  scene.add(place(floppies(["PORTFOLIO", "CRASHERS", "DISK 3"]), min.x - 0.05, front + 0.02, { width: 0.135, rotY: 0.25 }));
  onChange();

  let gltf: GLTF;
  try {
    gltf = await loader.loadAsync(PROPS_URL);
  } catch {
    return; // the scene is complete without them
  }
  const byName = Object.fromEntries(ORDER.map((name, i) => [name, gltf.scenes[i]])) as Record<(typeof ORDER)[number], Group | undefined>;

  if (byName.lamp) {
    const lamp = place(byName.lamp, min.x - 0.13, min.z + 0.02, { height: 0.5, rotY: 0.85 });
    scene.add(lamp);
    // The shade is at the top front of the model; aim the lamp's light from there at the keyboard.
    lamp.updateMatrixWorld(true);
    const head = new Box3().setFromObject(lamp);
    light.position.set(head.max.x - 0.04, head.max.y - 0.06, head.max.z - 0.02);
    light.target.position.set((min.x + max.x) / 2, 0.05, front - 0.05);
    light.angle = 0.75;
    light.distance = 3;
    light.intensity = 3.2; // much closer to the desk than the default lamp position
  }
  if (byName.cassette) scene.add(place(byName.cassette, max.x + 0.16, front - 0.22, { width: 0.16, rotY: -0.5 }));
  if (byName.notepads) scene.add(place(byName.notepads, max.x + 0.12, front + 0.1, { width: 0.2, rotY: -0.2 }));
  if (byName.pens) scene.add(place(byName.pens, max.x + 0.13, front + 0.1, { width: 0.15, rotY: 0.9, y: 0.006 }));
  if (byName.spectacles) scene.add(place(byName.spectacles, min.x + 0.06, front + 0.09, { width: 0.13, rotY: 0.35 }));
  if (byName.duck) scene.add(place(byName.duck, min.x - 0.1, front - 0.08, { height: 0.065, rotY: 0.6 }));
  onChange();
}
