// Furniture and lighting shared by the terminal and the radio cabin.
import {
  Box3, BoxGeometry, Cache, Color, DirectionalLight, Group, ImageLoader, Mesh,
  MeshStandardMaterial, Object3D, PointLight, RepeatWrapping, SRGBColorSpace,
  TextureLoader, Vector3, type BufferGeometry, type Scene, type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildCabin } from "./cabin";

export type RoomAssets = { polarView: Texture | null };

/** What the props need to know about the room. Desk top is y = 0; the wall faces +z. */
export type Room = {
  windowCenter: Vector3;
  wallZ: number;
  floorY: number;
  /** The window opening in the wall, in world x/y. */
  window: { x0: number; x1: number; y0: number; y1: number };
  /** Desk top extents in world space. */
  desk: { minX: number; maxX: number; backZ: number; frontZ: number };
  /** The portholes (a hotspot). */
  windowFrame: Object3D;
  /** Polar dusk or night watch: the sky outside and the light it lets in. */
  setTime(time: Time): void;
  /** Part way between them: 0 is dusk, 1 is night. The exterior and its light dim together. */
  blend(k: number): void;
};

export type Time = "dusk" | "night";

/** Exact extents of the desk footprint (2 m × 0.78744 m × 0.94711 m) every prop was arranged on. */
const DESK_SIZE = { w: 2, h: 0.78744, d: 0.94711 };

/** Phones get the room's surfaces at half size (public/textures/half, scripts/room-textures.mjs). */
const HALF = typeof matchMedia === "function" && matchMedia("(max-width: 640px) and (pointer: coarse)").matches;
const surface = (name: string) => `/textures/${HALF ? "half/" : ""}${name}.webp`;

export const ROOM_TEXTURES = [
  "/textures/polar-relay.webp",
  surface("oak_diff"),
  surface("oak_nor_gl"),
  surface("oak_rough"),
  "/textures/world-map.webp",
] as const;

export async function loadRoom(): Promise<RoomAssets> {
  Cache.enabled = true;
  const images = new ImageLoader();
  const [polarView] = await Promise.all([
    new TextureLoader().loadAsync(ROOM_TEXTURES[0]).catch(() => null),
    ...ROOM_TEXTURES.slice(1).map(url => images.loadAsync(url).catch(() => null)),
  ] as const);
  if (polarView) polarView.colorSpace = SRGBColorSpace;
  return { polarView };
}

const boxGeo = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y, z);

const box = (w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number) => new Mesh(boxGeo(w, h, d, x, y, z), mat);

function merged(parts: BufferGeometry[], mat: MeshStandardMaterial) {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return new Mesh(geo, mat);
}

/** Oak planks (Poly Haven, CC0), loaded now so the shaders are compiled with their maps. */
function oak(repeatX: number, repeatY: number) {
  const load = (name: string, srgb = false) => {
    const t = new TextureLoader().load(surface(`oak_${name}`));
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  return new MeshStandardMaterial({ map: load("diff", true), normalMap: load("nor_gl"), roughnessMap: load("rough"), roughness: 1, color: "#beaa8c" });
}

/** A wooden desk: an oak top 4 cm thick, a drawer pedestal at each end, a modesty panel. */
function woodDesk(bounds: Box3): Group {
  const g = new Group();
  const w = bounds.max.x - bounds.min.x;
  const d = bounds.max.z - bounds.min.z;
  const h = bounds.max.y - bounds.min.y;
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  const top = box(w + 0.04, 0.04, d + 0.03, oak(1.6, 0.8), cx, -0.02, cz);
  const body = new MeshStandardMaterial({ color: "#455651", roughness: 0.6 });
  const handle = new MeshStandardMaterial({ color: "#b58b4c", roughness: 0.35, metalness: 1 });
  const bodyParts: BufferGeometry[] = [];
  const pullParts: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const px = cx + side * (w / 2 - 0.22);
    bodyParts.push(boxGeo(0.42, h - 0.04, d - 0.06, px, -0.04 - (h - 0.04) / 2, cz - 0.01));
    for (let i = 0; i < 3; i++) {
      const dh = (h - 0.1) / 3;
      const y = -0.07 - dh / 2 - i * dh;
      bodyParts.push(boxGeo(0.39, dh - 0.012, 0.018, px, y, cz + (d - 0.06) / 2));
      pullParts.push(boxGeo(0.1, 0.012, 0.014, px, y + dh * 0.25, cz + (d - 0.06) / 2 + 0.014));
    }
  }
  bodyParts.push(boxGeo(w - 0.9, h * 0.45, 0.02, cx, -0.04 - h * 0.225, bounds.min.z + 0.04));
  g.add(top, merged(bodyParts, body), merged(pullParts, handle));
  return g;
}

export function buildRoom(
  scene: Scene,
  assets: RoomAssets,
  computer: Box3,
  opts?: { sunMapSize?: number },
): Room {
  // ── the desk: 2 m of oak on two drawer pedestals, top at y = 0, the computer towards its left ─
  const deskBox = new Box3(
    new Vector3(0.12 - DESK_SIZE.w / 2, -DESK_SIZE.h, computer.min.z - 0.1),
    new Vector3(0.12 + DESK_SIZE.w / 2, 0, computer.min.z - 0.1 + DESK_SIZE.d),
  );
  scene.add(woodDesk(deskBox));
  const floorY = deskBox.min.y;
  const wallZ = deskBox.min.z - 0.03;

  const cabin = buildCabin(scene, floorY, wallZ, assets.polarView);
  const { x: cx, y: cy, radius } = cabin;
  const win = { x0: cx - radius, x1: cx + radius, y0: cy - radius, y1: cy + radius };

  const sun = new DirectionalLight("#6f8fc7", 0.55);
  // Aimed through the middle of the window at the desk, so its light actually gets in.
  const patch = new Vector3(-0.15, 0, computer.max.z - 0.05);
  const through = new Vector3(cx, cy - 0.1, wallZ - 0.04);
  sun.position.copy(through).addScaledVector(through.clone().sub(patch), 2.5);
  sun.target.position.copy(patch);
  sun.castShadow = true;
  const sunMapSize = opts?.sunMapSize ?? 2048;
  sun.shadow.mapSize.set(sunMapSize, sunMapSize);
  Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 1.6, bottom: -1.6, near: 0.5, far: 6.5 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // Diffuse light from the ice keeps the unlit corner readable and falls
  // off into blue shadow instead of black and dark camera bodies still read at 2 AM.
  const bounce = new PointLight("#7594d6", 0.82, 4.2, 1.4);
  bounce.position.set(cx - 0.15, win.y0 + 0.22, wallZ + 0.72);
  scene.add(bounce);

  // The steel shell cuts the daylight to the shape of the portholes.
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh === cabin.view || (mesh.material as MeshStandardMaterial).transparent) return;
    // The desk shadow cameras cover the operator station. The long deck extends past their edges.
    mesh.castShadow = !mesh.userData.deck;
    mesh.receiveShadow = !mesh.userData.deck;
  });


  return {
    windowCenter: new Vector3(cx, cy, wallZ),
    wallZ,
    floorY,
    window: win,
    windowFrame: cabin.frame,
    desk: { minX: deskBox.min.x, maxX: deskBox.max.x, backZ: deskBox.min.z, frontZ: deskBox.max.z },
    setTime(time) {
      this.blend(time === "night" ? 1 : 0);
    },
    blend(k) {
      const dusk = { sun: new Color("#d8eaf2"), sunI: 2.85, bounce: new Color("#c9e1ea"), bounceI: 0.78 };
      const night = { sun: new Color("#6892ce"), sunI: 0.82, bounce: new Color("#779acb"), bounceI: 0.6 };
      const e = k * k * (3 - 2 * k);
      sun.color.copy(dusk.sun).lerp(night.sun, e);
      sun.intensity = dusk.sunI + (night.sunI - dusk.sunI) * e;
      bounce.color.copy(dusk.bounce).lerp(night.bounce, e);
      bounce.intensity = dusk.bounceI + (night.bounceI - dusk.bounceI) * e;
      cabin.blend(e);
    },
  };
}
