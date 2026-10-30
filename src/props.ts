// Things on the desk and the wall. Loaded after the computer so `exit` never waits on them.
// Models are merged into public/models/props.glb (scripts/build-props.sh), one glTF scene per prop
// in ORDER: Poly Haven (CC0) and Sketchfab (CC BY, see credit.ts). The rest is made here in code.
//
// What's here is true to Christen: tennis (college team), Réunion and French Guiana (the globe and
// the print), photography and filmmaking (the cameras, the slate, the studio light), computer
// science (the notebook), the video call where the microphone died and everyone held up paper (the
// card by the phone), and the rest of the "what's on your fridge" timeline: the moves from Réunion
// to French Guiana, Normandy, Indiana, the UK and Dallas (the cork board, the suitcase, the plane),
// longhorns in DFW, rugby, skateboards built for friends, the first bitcoin, the baccalauréat and
// graduating from Taylor, and collecting digital art (the pixel portrait).
//
// Every prop has a name; src/layout.json can move, turn, scale or hide it (see layout.ts).
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TextureLoader,
  PointLight,
  SpotLight,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Object3D,
  type Scene,
} from "three";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyPose, currentLayout, poseOf } from "./layout";
import type { Room } from "./room";

const PROPS_URL = "/models/props.glb";
const ORDER = [
  "lamp", "cassette", "pens", "spectacles", "duck", "camera", "plant", "clock", "frame", "globe", "super8", "phone",
  "longhorn", "rugby", "skateboard", "clapper", "biplane", "studiolight", "chair", "suitcase",
  "breadboard", "multimeter", "joystick", "headphones", "answering",
] as const;

/** Decals (shadows, labels, paper) sit a hair above what they're on and win the depth test. */
const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, flipY = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.flipY = flipY;
  return t;
}

/** Soft blob shadow under a prop (no realtime shadows anywhere). */
function blob(width: number, depth: number, strength = 0.42): Mesh {
  const map = canvas(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
  const m = new Mesh(new PlaneGeometry(width, depth), new MeshBasicMaterial({ map, transparent: true, depthWrite: false, ...decal }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.0006;
  return m;
}

type PlaceOpts = { height?: number; width?: number; rotY?: number; y?: number; shadow?: boolean };

/** Sits `object` on the desk at (x, z), scaled so its height (or largest footprint side) is `size` metres. */
function place(object: Object3D, x: number, z: number, opts: PlaceOpts = {}) {
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
  if (opts.shadow ?? !opts.y) holder.add(blob(footprint.x * 1.3, footprint.z * 1.3));
  return holder;
}

/** Hangs `object` flat on the wall, centred at (x, y), facing the room. */
function hang(object: Object3D, x: number, y: number, wallZ: number, height: number, turn = 0) {
  const holder = new Group();
  holder.add(object);
  object.rotation.y += turn;
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  object.scale.multiplyScalar(height / size.y);
  box.setFromObject(object);
  const c = box.getCenter(new Vector3());
  object.position.sub(new Vector3(c.x, c.y, box.min.z));
  holder.position.set(x, y, wallZ + 0.002);
  return holder;
}

/**
 * Pulls the named pieces out of a model, baked into its own space. Poly Haven's kits are laid out
 * like a product shot (pens floating in a row, the tape standing beside the player), so the desk
 * re-arranges them as things would really lie. Returns null when a piece is missing.
 */
function piece(root: Object3D, name: string, center = false): Group | null {
  const node = root.getObjectByName(name);
  if (!node) return null;
  root.updateMatrixWorld(true);
  const g = new Group();
  node.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) g.add(new Mesh(m.geometry.clone().applyMatrix4(m.matrixWorld), m.material));
  });
  if (center) {
    const c = new Box3().setFromObject(g).getCenter(new Vector3());
    g.children.forEach((m) => (m as Mesh).geometry.translate(-c.x, -c.y, -c.z));
  }
  return g;
}

/** The pencil cup with its pens and pencils standing in it, leaning on the rim, points up. */
function penCup(kit: Object3D): Group | null {
  const cup = piece(kit, "stationery_supplies_pencilcup", true);
  if (!cup) return null;
  const g = new Group();
  const cupBox = new Box3().setFromObject(cup);
  cup.position.y = -cupBox.min.y;
  g.add(cup);
  const inside = ["pen_red", "pencil_new_a", "pen_blue", "pencil_used", "pen_fancy"];
  inside.forEach((name, i) => {
    const pen = piece(kit, `stationery_supplies_${name}`, true);
    if (!pen) return;
    const length = new Box3().setFromObject(pen).getSize(new Vector3()).x;
    const a = (i / inside.length) * Math.PI * 2 + 0.4;
    const pivot = new Group(); // at the pen's foot, on the cup floor
    pivot.position.set(-Math.cos(a) * 0.018, 0.006, -Math.sin(a) * 0.018);
    pen.rotation.set(i * 1.7, 0, -Math.PI / 2, "ZYX"); // spun about its own length, then stood up, sharpened end up
    pen.position.y = length / 2;
    pivot.add(pen);
    // lean outwards, towards the far side of the rim
    pivot.rotation.set(Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38);
    g.add(pivot);
  });
  return g;
}

// ── made in code ──────────────────────────────────────────────────────────────────────────

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

/** One floppy per featured project: what the label says, what the hover says, what loading it runs. */
export type Disk = { label: string; title: string; command: string };

/**
 * The work: a beige floppy box with a 5¼" disk for each project, fanned back so every label shows
 * above the one in front. Each disk is its own group (userData.hotspot), so it can be lifted out and
 * loaded into the Disk II; its place in the box is kept in userData.slot to put it back.
 */
function diskBox(disks: Disk[]): Group {
  const g = new Group();
  const W = 0.152;
  const D = 0.06 + disks.length * 0.016;
  const plastic = new MeshStandardMaterial({ color: "#d6c9ab", roughness: 0.5 });
  const wall = (w: number, h: number, d: number, x: number, z: number) => {
    const m = new Mesh(new BoxGeometry(w, h, d), plastic);
    m.position.set(x, h / 2, z);
    g.add(m);
  };
  wall(W, 0.004, D, 0, 0); // floor
  wall(W, 0.03, 0.004, 0, D / 2); // low front, so the labels show
  wall(W, 0.07, 0.004, 0, -D / 2); // tall back
  for (const x of [-W / 2, W / 2]) wall(0.004, 0.05, D, x, 0);

  const sleeve = new MeshStandardMaterial({ color: "#1f1d1b", roughness: 0.6 });
  const tabs = ["#b8412c", "#d39b32", "#2f6f6b", "#ece2cc", "#9d968a", "#b8412c", "#d39b32", "#2f6f6b"];
  disks.forEach((disk, i) => {
    // The front of the sleeve: the hub ring, the read window, the write-protect notch and a label.
    const face = canvas(256, 256, (c) => {
      c.fillStyle = "#1f1d1b";
      c.fillRect(0, 0, 256, 256);
      c.strokeStyle = "#3a3633";
      c.lineWidth = 10;
      c.beginPath();
      c.arc(128, 150, 34, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#0c0b0a";
      c.beginPath();
      c.arc(128, 150, 22, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.roundRect(116, 196, 24, 54, 12);
      c.fill();
      c.fillRect(250, 70, 6, 22);
      // the label, across the top, with a coloured tab
      c.fillStyle = "#ece2cc";
      c.fillRect(14, 10, 228, 62);
      c.fillStyle = tabs[i % tabs.length];
      c.fillRect(14, 10, 228, 12);
      c.fillStyle = "#1d2a6b";
      c.font = "italic bold 25px 'Marker Felt', 'Comic Sans MS', cursive";
      c.textBaseline = "middle";
      const text = disk.label.length > 17 ? `${disk.label.slice(0, 16)}…` : disk.label;
      c.fillText(text, 22, 48, 212);
    });
    const front = new MeshStandardMaterial({ map: face, roughness: 0.6 });
    const sheet = new Mesh(new BoxGeometry(0.133, 0.133, 0.0018), [sleeve, sleeve, sleeve, sleeve, front, sleeve]);
    const holder = new Group();
    holder.add(sheet);
    // Standing on edge, leaning back, each one further back and a little higher than the last.
    const z = D / 2 - 0.022 - i * 0.016;
    holder.position.set(0, 0.0665 + 0.004 + i * 0.006, z);
    holder.rotation.x = -0.28;
    holder.userData.slot = { position: holder.position.clone(), rotation: holder.rotation.clone() };
    holder.userData.hotspot = { kind: "disk", label: disk.title, hint: "load it", nav: true, command: disk.command };
    holder.name = `disk:${disk.label.toLowerCase()}`;
    g.add(holder);
  });
  return g;
}

/**
 * A Rubik's cube in the palette's colours: 27 cubies under "cubies", one draw each (the stickers are
 * vertex colours through one shared sticker texture), so interact.ts can turn real faces.
 */
function rubik(): Group {
  const step = 0.019;
  const sticker = canvas(64, 64, (c) => {
    c.fillStyle = "#000";
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = "#fff";
    c.beginPath();
    c.roundRect(6, 6, 52, 52, 9);
    c.fill();
  });
  sticker.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ map: sticker, vertexColors: true, roughness: 0.42 });
  // +x, -x, +y, -y, +z, -z: the classic scheme, aged towards the palette
  const faces = ["#c46a2b", "#b8412c", "#ece2cc", "#d39b32", "#2f6f6b", "#3f5f8c"].map((h) => new Color(h).convertSRGBToLinear());
  const inside = new Color("#1f1d1b").convertSRGBToLinear();
  const cubies = new Group();
  cubies.name = "cubies";
  cubies.userData.step = step;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (let k = -1; k <= 1; k++) {
        const geo = new BoxGeometry(step * 0.97, step * 0.97, step * 0.97);
        const colours: number[] = [];
        const outer = [i === 1, i === -1, j === 1, j === -1, k === 1, k === -1];
        outer.forEach((out, f) => {
          const c = out ? faces[f] : inside;
          for (let v = 0; v < 4; v++) colours.push(c.r, c.g, c.b);
        });
        geo.setAttribute("color", new Float32BufferAttribute(colours, 3));
        const cubie = new Mesh(geo, material);
        cubie.position.set(i * step, j * step, k * step);
        cubies.add(cubie);
      }
    }
  }
  cubies.position.y = 1.5 * step;
  const g = new Group();
  g.add(cubies);
  return g;
}

/** A floating walnut shelf on two black steel brackets, its top at y, its back on the wall. */
function shelf(x: number, y: number, wallZ: number, w: number, d: number): Group {
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: "#5a3a28", roughness: 0.6 });
  const steel = new MeshStandardMaterial({ color: "#1f1d1b", roughness: 0.45, metalness: 0.6 });
  const plank = new Mesh(new BoxGeometry(w, 0.025, d), wood);
  plank.position.set(0, -0.0125, d / 2);
  g.add(plank);
  for (const bx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    const arm = new Mesh(new BoxGeometry(0.012, 0.01, d * 0.85), steel);
    arm.position.set(bx, -0.03, d * 0.43);
    const post = new Mesh(new BoxGeometry(0.012, 0.12, 0.01), steel);
    post.position.set(bx, -0.085, 0.005);
    g.add(arm, post);
  }
  g.position.set(x, y, wallZ);
  return g;
}

/** A row of books, spines out, in the palette's cloth colours, a couple leaning. */
function books(n: number): Group {
  const g = new Group();
  const cloth = ["#5a3a28", "#2f6f6b", "#b8412c", "#d39b32", "#1f1d1b", "#ece2cc", "#3f5f8c", "#7a4a35", "#9d968a"];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.17 + ((i * 37) % 7) * 0.008;
    const t = 0.018 + ((i * 13) % 5) * 0.004;
    const book = new Mesh(new BoxGeometry(t, h, 0.13), new MeshStandardMaterial({ color: cloth[i % cloth.length], roughness: 0.8 }));
    book.position.set(x + t / 2, h / 2, 0);
    if (i === n - 1) {
      book.rotation.z = -0.32; // the last one leans on the rest
      book.position.x += 0.03;
    }
    g.add(book);
    x += t + 0.001;
  }
  return g;
}

/** A teal self-healing cutting mat: a 1 cm grid, inch rules on two edges, 45° guides. */
function cuttingMat(x0: number, x1: number, z0: number, z1: number): Mesh {
  const w = x1 - x0;
  const d = z1 - z0;
  const px = 1600;
  const art = canvas(px, Math.round((px * d) / w), (c) => {
    const W = c.canvas.width;
    const H = c.canvas.height;
    const cm = W / (w * 100);
    c.fillStyle = "#2f6f6b";
    c.fillRect(0, 0, W, H);
    for (let i = 0; i * cm <= W; i++) {
      c.fillStyle = i % 5 ? "rgba(225,240,230,0.22)" : "rgba(225,240,230,0.45)";
      c.fillRect(i * cm, 0, i % 5 ? 1 : 2, H);
    }
    for (let i = 0; i * cm <= H; i++) {
      c.fillStyle = i % 5 ? "rgba(225,240,230,0.22)" : "rgba(225,240,230,0.45)";
      c.fillRect(0, i * cm, W, i % 5 ? 1 : 2);
    }
    c.strokeStyle = "rgba(225,240,230,0.3)";
    c.lineWidth = 2;
    for (const k of [-1, 1]) {
      c.beginPath();
      c.moveTo(W / 2 - (k * H) / 2, 0);
      c.lineTo(W / 2 + (k * H) / 2, H);
      c.stroke();
    }
    c.fillStyle = "rgba(240,248,240,0.75)";
    c.font = `${Math.round(cm * 0.9)}px Helvetica, Arial, sans-serif`;
    for (let i = 1; i * cm * 2.54 < W - cm; i++) c.fillText(String(i), i * cm * 2.54 - cm * 0.25, cm * 1.1);
    for (let i = 1; i * cm * 2.54 < H - cm; i++) c.fillText(String(i), cm * 0.25, i * cm * 2.54 + cm * 0.3);
  });
  const mat = new Mesh(new PlaneGeometry(w, d), new MeshStandardMaterial({ map: art, roughness: 0.85, ...decal }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set((x0 + x1) / 2, 0.0012, (z0 + z1) / 2);
  mat.receiveShadow = true;
  return mat;
}

/**
 * The big laminated world map from my room: drawn from public-domain Natural Earth data into
 * public/textures/world-map.webp (scripts/world-map.mjs). Pinned at the corners, a little sheen.
 */
function wallMap(onReady: () => void): Group {
  const g = new Group();
  const W = 1.12;
  const H = 0.56;
  const material = new MeshStandardMaterial({ color: "#a9c6d6", roughness: 0.32 });
  new TextureLoader().load(
    "/textures/world-map.webp",
    (t) => {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      material.map = t;
      material.color.set("#ffffff");
      material.needsUpdate = true;
      onReady();
    },
    undefined,
    () => {}, // no map yet: a plain sheet
  );
  const sheet = new Mesh(new PlaneGeometry(W, H), material);
  sheet.position.z = 0.002;
  const pin = new MeshStandardMaterial({ color: "#b8412c", roughness: 0.4 });
  for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new Mesh(new SphereGeometry(0.006, 12, 8), pin);
    p.position.set(x * (W / 2 - 0.015), y * (H / 2 - 0.015), 0.008);
    g.add(p);
  }
  g.add(sheet);
  return g;
}

/** An open graph-paper notebook with a BASIC doodle (the pencil is its own prop). */
function notebook(): Group {
  const g = new Group();
  const page = canvas(512, 704, (ctx) => {
    ctx.fillStyle = "#f4f0e2";
    ctx.fillRect(0, 0, 512, 704);
    ctx.strokeStyle = "rgba(80,140,170,0.35)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 512; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 704); ctx.stroke(); }
    for (let y = 0; y <= 704; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    ctx.fillStyle = "rgba(40,40,50,0.85)";
    ctx.font = "26px 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive";
    const lines = ["10 REM imagination", "20 REM  -> implementation", "30 PRINT \"HELLO, WORLD\"", "40 GOTO 30", "", "RUN"];
    lines.forEach((l, i) => ctx.fillText(l, 36, 80 + i * 48));
    ctx.strokeStyle = "rgba(40,40,50,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(300, 420, 160, 120); // a little screen sketch
    ctx.beginPath(); ctx.moveTo(320, 560); ctx.lineTo(440, 560); ctx.stroke();
  });
  const cover = new MeshStandardMaterial({ color: "#2f4a3a", roughness: 0.8 });
  const base = new Mesh(new BoxGeometry(0.31, 0.006, 0.21), cover);
  base.position.y = 0.003;
  const paperMat = new MeshStandardMaterial({ map: page, roughness: 0.9, ...decal });
  const left = new Mesh(new BoxGeometry(0.15, 0.004, 0.205), new MeshStandardMaterial({ color: "#f1ecdd", roughness: 0.9 }));
  left.position.set(-0.077, 0.008, 0);
  const right = new Mesh(new PlaneGeometry(0.15, 0.205), paperMat);
  right.rotation.x = -Math.PI / 2;
  right.position.set(0.077, 0.0062, 0);
  const rightBlock = new Mesh(new BoxGeometry(0.15, 0.0005, 0.205), new MeshStandardMaterial({ color: "#f1ecdd", roughness: 0.9 }));
  rightBlock.position.set(0.077, 0.0059, 0);
  g.add(base, left, rightBlock, right);
  return g;
}

/** A folded paper card: “CAN YOU HEAR ME?”, in pencil. */
function card(): Group {
  const g = new Group();
  const map = canvas(512, 256, (ctx) => {
    ctx.fillStyle = "#f7f3e8";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "rgba(50,50,60,0.85)";
    ctx.font = "bold 58px 'Marker Felt', 'Comic Sans MS', cursive";
    ctx.textAlign = "center";
    ctx.fillText("CAN YOU", 256, 110);
    ctx.fillText("HEAR ME?", 256, 180);
  });
  const face = new MeshStandardMaterial({ map, roughness: 0.9, side: DoubleSide });
  const back = new MeshStandardMaterial({ color: "#f1ecdf", roughness: 0.9, side: DoubleSide });
  const w = 0.11;
  const h = 0.06;
  const tilt = 0.32;
  for (const [mat, dir] of [[face, 1], [back, -1]] as const) {
    const panel = new Mesh(new PlaneGeometry(w, h), mat);
    panel.position.set(0, (h / 2) * Math.cos(tilt), (dir * h * Math.sin(tilt)) / 2);
    panel.rotation.x = -dir * tilt;
    if (dir < 0) panel.rotation.y = Math.PI;
    g.add(panel);
  }
  return g;
}

/** A 1980s wooden tennis racquet, lying on the desk. */
function racquet(): Group {
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: "#a8743f", roughness: 0.45 });
  const headA = 0.115; // half-length of the oval head
  const headB = 0.0875; // half-width
  const pts = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return new Vector3(Math.sin(a) * headB, 0, -Math.cos(a) * headA - headA);
  });
  g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, true), 96, 0.007, 8, true), wood));
  // strings
  const strings = canvas(256, 320, (ctx) => {
    ctx.strokeStyle = "rgba(236,230,210,0.95)";
    ctx.lineWidth = 2;
    for (let x = 8; x < 256; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 320); ctx.stroke(); }
    for (let y = 8; y < 320; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
  });
  const bed = new Mesh(
    new ShapeGeometry(new Shape().absellipse(0, 0, headB - 0.004, headA - 0.004, 0, Math.PI * 2, false, 0)),
    new MeshBasicMaterial({ map: strings, transparent: true, alphaTest: 0.3, side: DoubleSide, color: "#bdb6a2" }),
  );
  // ShapeGeometry UVs are in metres; stretch them to 0..1 across the bed.
  const uv = bed.geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (headB * 2) + 0.5, uv.getY(i) / (headA * 2) + 0.5);
  bed.rotation.x = -Math.PI / 2;
  bed.position.z = -headA;
  g.add(bed);
  // throat and handle
  for (const side of [-1, 1]) {
    const throat = new CatmullRomCurve3([new Vector3(side * headB * 0.55, 0, -0.012), new Vector3(side * 0.02, 0, 0.05), new Vector3(side * 0.012, 0, 0.09)]);
    g.add(new Mesh(new TubeGeometry(throat, 12, 0.006, 6), wood));
  }
  const shaft = new Mesh(new CylinderGeometry(0.014, 0.014, 0.06, 8), wood);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.1;
  const grip = new Mesh(new CylinderGeometry(0.016, 0.017, 0.17, 8), new MeshStandardMaterial({ color: "#5a3a22", roughness: 0.7 }));
  grip.rotation.x = Math.PI / 2;
  grip.position.z = 0.215;
  g.add(shaft, grip);
  return g;
}

function tennisBall(): Mesh {
  const map = canvas(256, 128, (ctx) => {
    ctx.fillStyle = "#cfdc48";
    ctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,200" : "120,130,30"},0.12)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
    }
    ctx.strokeStyle = "#f3f1e6";
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 64 + Math.sin((x / 256) * Math.PI * 4) * 30;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  return new Mesh(new SphereGeometry(0.0335, 24, 16), new MeshStandardMaterial({ map, roughness: 0.95 }));
}

/** A felt pennant from college tennis. */
function pennant(): Mesh {
  const map = canvas(512, 192, (ctx) => {
    ctx.fillStyle = "#4b2a6e";
    ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, 44, 192);
    ctx.fillStyle = "#e9b84a";
    ctx.font = "bold 54px Georgia, 'Times New Roman', serif";
    ctx.fillText("TAYLOR", 70, 92);
    ctx.font = "bold 30px Georgia, serif";
    ctx.fillText("TENNIS", 74, 136);
  });
  const shape = new Shape().moveTo(0, 0.07).lineTo(0.42, 0).lineTo(0, -0.07).closePath();
  const geo = new ShapeGeometry(shape);
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.42, uv.getY(i) / 0.14 + 0.5);
  const m = new Mesh(geo, new MeshStandardMaterial({ map, roughness: 1, side: DoubleSide }));
  m.rotation.z = -0.08;
  return m;
}

/** The print in the frame: Réunion's peaks over the Indian Ocean, as a screen-print. */
function reunionPrint() {
  return canvas(
    384,
    512,
    (g) => {
      const sky = g.createLinearGradient(0, 0, 0, 300);
      sky.addColorStop(0, "#f2c9a0");
      sky.addColorStop(1, "#f6e3c4");
      g.fillStyle = sky;
      g.fillRect(0, 0, 384, 512);
      g.fillStyle = "#f7d27a";
      g.beginPath();
      g.arc(250, 170, 46, 0, Math.PI * 2);
      g.fill();
      const ridge = (color: string, base: number, peaks: [number, number][]) => {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, 512);
        g.lineTo(0, base);
        for (const [x, y] of peaks) g.lineTo(x, y);
        g.lineTo(384, base);
        g.lineTo(384, 512);
        g.fill();
      };
      ridge("#b98a7a", 300, [[60, 230], [120, 180], [170, 205], [220, 140], [270, 200], [330, 230]]);
      ridge("#6f6a5a", 340, [[40, 300], [110, 250], [160, 290], [230, 230], [300, 280], [360, 300]]);
      ridge("#3f5a48", 380, [[80, 350], [150, 330], [240, 360], [320, 340]]);
      g.fillStyle = "#2f6f8a";
      g.fillRect(0, 400, 384, 112);
      g.fillStyle = "rgba(255,255,255,0.35)";
      for (let y = 412; y < 512; y += 14) g.fillRect(20 + ((y * 7) % 60), y, 120, 2);
      // a palm on the left
      g.strokeStyle = "#243326";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(70, 512);
      g.quadraticCurveTo(80, 420, 60, 330);
      g.stroke();
      g.fillStyle = "#243326";
      for (let a = -2.6; a < 0.4; a += 0.5) {
        g.beginPath();
        g.ellipse(60 + Math.cos(a) * 34, 330 + Math.sin(a) * 18, 40, 7, a, 0, Math.PI * 2);
        g.fill();
      }
      // paper border
      g.strokeStyle = "#f4ecd8";
      g.lineWidth = 26;
      g.strokeRect(0, 0, 384, 512);
    },
    false, // glTF UVs
  );
}

/** A brass physical bitcoin, the kind people bought in 2016. */
function bitcoin(): Group {
  const face = canvas(256, 256, (g) => {
    const grad = g.createRadialGradient(110, 100, 10, 128, 128, 128);
    grad.addColorStop(0, "#f6d77a");
    grad.addColorStop(1, "#b8862e");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(90,60,10,0.55)";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 128, 112, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(90,60,10,0.75)";
    g.font = "bold 120px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("₿", 128, 132);
    g.font = "bold 20px Georgia, serif";
    g.fillText("BITCOIN", 128, 46);
    g.fillText("1 BTC", 128, 214);
  });
  const edge = new MeshStandardMaterial({ color: "#c89a3c", metalness: 0.9, roughness: 0.35 });
  const top = new MeshStandardMaterial({ map: face, metalness: 0.85, roughness: 0.35 });
  const coin = new Mesh(new CylinderGeometry(0.02, 0.02, 0.0032, 40), [edge, top, top]);
  coin.position.y = 0.0016;
  const g = new Group();
  g.add(coin);
  return g;
}

/** A graduation cap with a purple-and-gold tassel (Taylor's colours). */
function mortarboard(): Group {
  const g = new Group();
  const cloth = new MeshStandardMaterial({ color: "#151417", roughness: 0.9 });
  const skull = new Mesh(new CylinderGeometry(0.085, 0.09, 0.07, 28, 1, true), new MeshStandardMaterial({ color: "#151417", roughness: 0.9, side: DoubleSide }));
  skull.position.y = 0.035;
  const board = new Mesh(new BoxGeometry(0.25, 0.006, 0.25), cloth);
  board.position.y = 0.073;
  board.rotation.y = Math.PI / 4;
  const button = new Mesh(new CylinderGeometry(0.008, 0.008, 0.006, 12), new MeshStandardMaterial({ color: "#e0b44a", roughness: 0.5 }));
  button.position.y = 0.079;
  const gold = new MeshStandardMaterial({ color: "#e0b44a", roughness: 0.7 });
  const cord = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(0, 0.08, 0), new Vector3(0.09, 0.078, 0.02), new Vector3(0.155, 0.074, 0.04), new Vector3(0.16, 0.03, 0.045)]), 16, 0.0018, 5), gold);
  const tassel = new Mesh(new CylinderGeometry(0.004, 0.008, 0.045, 10), new MeshStandardMaterial({ color: "#5b2d86", roughness: 0.85 }));
  tassel.position.set(0.16, 0.01, 0.045);
  g.add(skull, board, button, cord, tassel);
  return g;
}

/** A picture frame around `art`: dark wood, a cream mat, the art. Faces +z, back at z = 0. */
function framed(art: CanvasTexture, w: number, h: number, wood = "#3a2a1e", mat = 0.025): Group {
  const g = new Group();
  const border = 0.018;
  const woodMat = new MeshStandardMaterial({ color: wood, roughness: 0.55 });
  const W = w + 2 * (mat + border);
  const H = h + 2 * (mat + border);
  for (const [bw, bh, x, y] of [[W, border, 0, (H - border) / 2], [W, border, 0, -(H - border) / 2], [border, H, -(W - border) / 2, 0], [border, H, (W - border) / 2, 0]]) {
    const b = new Mesh(new BoxGeometry(bw, bh, 0.02), woodMat);
    b.position.set(x, y, 0.01);
    g.add(b);
  }
  const back = new Mesh(new PlaneGeometry(W - border, H - border), new MeshStandardMaterial({ color: "#efe8d6", roughness: 0.9 }));
  back.position.z = 0.006;
  const pic = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: art, roughness: 0.8, ...decal }));
  pic.position.z = 0.007;
  g.add(back, pic);
  return g;
}

/** The baccalauréat, framed. No name, just the document's look. */
function diploma(): Group {
  const art = canvas(420, 300, (g) => {
    g.fillStyle = "#efe3c4";
    g.fillRect(0, 0, 420, 300);
    g.strokeStyle = "#9a7b4a";
    g.lineWidth = 3;
    g.strokeRect(12, 12, 396, 276);
    g.lineWidth = 1;
    g.strokeRect(18, 18, 384, 264);
    g.fillStyle = "#3a3024";
    g.textAlign = "center";
    g.font = "11px Georgia, serif";
    g.fillText("RÉPUBLIQUE FRANÇAISE", 210, 44);
    g.font = "bold 26px Georgia, serif";
    g.fillText("DIPLÔME", 210, 86);
    g.font = "bold 17px Georgia, serif";
    g.fillText("DU BACCALAURÉAT GÉNÉRAL", 210, 112);
    g.fillStyle = "rgba(58,48,36,0.35)";
    for (let i = 0; i < 6; i++) g.fillRect(60, 140 + i * 16, i % 3 === 2 ? 180 : 300, 4);
    g.strokeStyle = "rgba(120,60,40,0.6)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(90, 245, 26, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(270, 252);
    g.bezierCurveTo(290, 230, 310, 262, 340, 240);
    g.stroke();
  });
  return framed(art, 0.3, 0.214, "#2d2219", 0.02);
}

/** Pixel art from the digital-art-collector years: a small portrait in a hoodie and shades. */
function pixelPortrait(): Group {
  const rows = [
    "................",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "...hhssssssh....",
    "...hssssssssh...",
    "...hkkkkskkkh...",
    "...hkkkkskkkh...",
    "...hssssssssh...",
    "...hsssmmsssh...",
    "....hssssssh....",
    "...ooosssssooo..",
    "..oooooooooooo..",
    "..oooo3ooooooo..",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "................",
  ];
  const colors: Record<string, string> = { ".": "#7cc6b8", h: "#3a2618", s: "#e6b48c", k: "#101014", m: "#a8564a", o: "#e5533d", "3": "#f4f0e6" };
  const art = canvas(16, 16, (g) => {
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      g.fillStyle = colors[c];
      g.fillRect(x, y, 1, 1);
    }));
  });
  art.magFilter = NearestFilter;
  art.minFilter = NearestFilter;
  art.generateMipmaps = false;
  return framed(art, 0.15, 0.15, "#111", 0.02);
}

/** The cork board: postcards of every place home has been, joined by red string, like the fridge timeline. */
function corkboard(): Group {
  const W = 1024;
  const H = 720;
  const areas: { x: number; y: number; w: number; h: number; place: string }[] = [];
  const art = canvas(W, H, (g) => {
    g.fillStyle = "#b98a5a";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "90,55,25" : "235,200,150"},${0.12 + Math.random() * 0.18})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    type Card = { x: number; y: number; rot: number; place: string; paint: (g: CanvasRenderingContext2D) => void };
    const cards: Card[] = [
      { x: 150, y: 520, rot: -0.06, place: "LA RÉUNION", paint: (c) => {
        c.fillStyle = "#8ccbe0"; c.fillRect(0, 0, 220, 100);
        c.fillStyle = "#4c6b43"; c.beginPath(); c.moveTo(0, 100); c.lineTo(70, 30); c.lineTo(110, 55); c.lineTo(150, 20); c.lineTo(220, 100); c.fill();
        c.fillStyle = "#2b6f95"; c.fillRect(0, 100, 220, 40);
      } },
      { x: 410, y: 560, rot: 0.05, place: "GUYANE", paint: (c) => {
        c.fillStyle = "#cfe8d0"; c.fillRect(0, 0, 220, 140);
        c.fillStyle = "#2f6b3a"; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(10 + i * 16, 110 - (i % 3) * 8, 22, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = "#f2f2f2"; c.fillRect(150, 20, 12, 70); c.beginPath(); c.moveTo(150, 20); c.lineTo(156, 4); c.lineTo(162, 20); c.fill();
      } },
      { x: 180, y: 250, rot: 0.04, place: "NORMANDIE", paint: (c) => {
        c.fillStyle = "#c7d6e2"; c.fillRect(0, 0, 220, 140);
        c.fillStyle = "#e8e4d6"; c.beginPath(); c.moveTo(0, 30); c.lineTo(120, 40); c.lineTo(140, 100); c.lineTo(110, 100); c.lineTo(100, 70); c.lineTo(80, 140); c.lineTo(0, 140); c.fill();
        c.fillStyle = "#5f8aa3"; c.fillRect(0, 115, 220, 25);
      } },
      { x: 520, y: 170, rot: -0.04, place: "INDIANA", paint: (c) => {
        c.fillStyle = "#bcdcf0"; c.fillRect(0, 0, 220, 140);
        c.fillStyle = "#d8b24a"; c.fillRect(0, 80, 220, 60);
        c.fillStyle = "#a83a2c"; c.fillRect(120, 45, 60, 45); c.beginPath(); c.moveTo(115, 45); c.lineTo(150, 20); c.lineTo(185, 45); c.fill();
      } },
      { x: 790, y: 300, rot: 0.06, place: "LONDON", paint: (c) => {
        c.fillStyle = "#cfd4d8"; c.fillRect(0, 0, 220, 140);
        c.fillStyle = "#7a6a52"; c.fillRect(95, 20, 30, 120); c.beginPath(); c.moveTo(95, 20); c.lineTo(110, 0); c.lineTo(125, 20); c.fill();
        c.fillStyle = "#f2efe4"; c.beginPath(); c.arc(110, 45, 10, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#c8312a"; c.fillRect(20, 105, 60, 30);
      } },
      { x: 760, y: 560, rot: -0.05, place: "DALLAS", paint: (c) => {
        const sky = c.createLinearGradient(0, 0, 0, 140); sky.addColorStop(0, "#f3a65f"); sky.addColorStop(1, "#f7dca0");
        c.fillStyle = sky; c.fillRect(0, 0, 220, 140);
        c.fillStyle = "#2d2a35"; [[20, 60], [50, 40], [80, 75], [130, 50], [165, 30], [195, 65]].forEach(([x, top]) => c.fillRect(x, top, 24, 140 - top));
        c.fillRect(108, 30, 5, 110); c.beginPath(); c.arc(110, 28, 12, 0, Math.PI * 2); c.fill();
      } },
    ];
    areas.push(...cards.map((c) => ({ x: c.x - 120, y: c.y - 80, w: 240, h: 180, place: c.place })));
    // The string first, so the cards and pins sit on top of it.
    g.strokeStyle = "#b3241c";
    g.lineWidth = 3;
    g.beginPath();
    cards.forEach((c, i) => (i ? g.lineTo(c.x, c.y - 70) : g.moveTo(c.x, c.y - 70)));
    g.stroke();
    for (const c of cards) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(-116, -76, 240, 180);
      g.fillStyle = "#f6f1e4";
      g.fillRect(-120, -80, 240, 180);
      g.save();
      g.translate(-110, -70);
      g.beginPath();
      g.rect(0, 0, 220, 140);
      g.clip();
      c.paint(g);
      g.restore();
      g.fillStyle = "#2c2a30";
      g.font = "bold 20px Georgia, serif";
      g.textAlign = "center";
      g.fillText(c.place, 0, 92);
      g.restore();
      g.fillStyle = "#d8342a";
      g.beginPath();
      g.arc(c.x, c.y - 70, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.beginPath();
      g.arc(c.x - 3, c.y - 73, 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  const board = framed(art, 0.6, 0.42, "#8a6440", 0);
  // Hovering a postcard names the place: interact.ts maps the hit's uv into these canvas rects.
  board.userData.hotspot = { kind: "places", label: "every place home has been", areas, size: [W, H] };
  return board;
}

/**
 * Puts `light` where the lamp's bulb is, shining out of the shade, and keeps it there when the lamp
 * is moved (`light.userData.sync`, called on every relight). The bulb is the lamp's "light"
 * material; the shade is the lamp body around it, so the opening is away from the shade's middle.
 */
function fitBulb(lamp: Object3D, light: SpotLight): boolean {
  lamp.updateMatrixWorld(true);
  let bulb: Mesh | undefined;
  let body: Mesh | undefined;
  lamp.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m.material as MeshStandardMaterial).transparent) return;
    if ((m.material as MeshStandardMaterial).name.endsWith("_light")) bulb = m;
    else body ??= m;
  });
  if (!bulb || !body) return false;
  // The bulb is screwed in along the shade's axis, so its long axis is the way the light goes;
  // of the two ends, the one away from the shade's middle is the opening.
  const world = (mesh: Mesh) => {
    const pos = mesh.geometry.getAttribute("position");
    return Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  };
  const glassPts = world(bulb);
  const center = glassPts.reduce((sum, v) => sum.add(v), new Vector3()).divideScalar(glassPts.length);
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const v of glassPts) {
    const d = v.clone().sub(center).toArray();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += d[i] * d[j];
  }
  let axis = new Vector3(0.3, 0.5, 0.8);
  for (let i = 0; i < 60; i++) {
    const [x, y, z] = axis.toArray();
    axis = new Vector3(cov[0] * x + cov[1] * y + cov[2] * z, cov[3] * x + cov[4] * y + cov[5] * z, cov[6] * x + cov[7] * y + cov[8] * z).normalize();
  }
  const near = world(body).filter((v) => v.distanceTo(center) < 0.08);
  const shadeMiddle = near.reduce((sum, v) => sum.add(v), new Vector3()).divideScalar(Math.max(1, near.length));
  if (axis.dot(shadeMiddle.sub(center)) > 0) axis.negate();
  const at = lamp.worldToLocal(center.clone());
  const aim = lamp.worldToLocal(center.clone().addScaledVector(axis, 0.5));
  const glass = bulb.material as MeshStandardMaterial;
  glass.emissive.set("#ffd9a0");
  glass.emissiveIntensity = 2.5;
  // The cone lights the desk; the spill light (made in desk.ts, so the light count never changes)
  // sits just inside the shade and lights it and the wall around it, the way a real bulb does.
  const inShade = lamp.worldToLocal(center.clone().addScaledVector(axis, -0.03));
  light.userData.bulb = glass;
  const sync = () => {
    lamp.updateMatrixWorld(true);
    light.position.copy(lamp.localToWorld(at.clone()));
    light.target.position.copy(lamp.localToWorld(aim.clone()));
    light.target.updateMatrixWorld();
    (light.userData.spill as PointLight | undefined)?.position.copy(lamp.localToWorld(inShade.clone()));
  };
  light.userData.sync = sync; // starts once the lamp is in the scene (see addProps)
  return true;
}

/**
 * Loads and arranges the desk props around the computer. `bounds` is the computer's world box;
 * the lamp's light is moved onto the lamp's bulb. Every prop is registered in `props` by name and
 * then posed from the layout. The loaded models are built off-scene and handed to `prepare`
 * (shaders compiled, textures uploaded, after any camera move) before they appear, so they never
 * stall a frame. Calls `onChange` whenever the scene needs a frame.
 */
export async function addProps(
  scene: Scene,
  loader: GLTFLoader,
  bounds: Box3,
  room: Room,
  light: SpotLight,
  props: Map<string, Object3D>,
  prepare: (arrivals: Object3D) => Promise<void>,
  onChange: () => void,
  disks: Disk[],
) {
  const { min, max } = bounds;
  const back = room.desk.backZ;
  const front = room.desk.frontZ;
  const floor = room.floorY;
  const wall = room.wallZ;
  const layout = currentLayout();
  let into: Object3D = scene;
  const put = (name: string, o: Object3D) => {
    o.name = name;
    o.userData.home = poseOf(o); // where the code put it, for the editor's reset
    o.traverse((m) => {
      const mesh = m as Mesh;
      if (!mesh.isMesh) return;
      const soft = (mesh.material as MeshStandardMaterial).transparent;
      mesh.castShadow = name !== "lamp" && !soft;
      mesh.receiveShadow = !soft;
    });
    applyPose(o, layout[name]);
    props.set(name, o);
    into.add(o);
    return o;
  };
  const onWall = (o: Object3D, x: number, y: number, height: number) => hang(o, x, y, wall, height);
  // The window sill: things stand on it inside the reveal, against the glass.
  const sill = room.window;
  const onSill = (o: Object3D, x: number, opts: PlaceOpts) => place(o, x, wall - 0.07, { ...opts, y: sill.y0 + 0.01, shadow: true });
  const mid = (min.x + max.x) / 2;

  // The code-made props first: they cost nothing to load.
  put("mug", place(mug(), max.x + 0.06, max.z - 0.06, { height: 0.095 }));
  put("floppies", place(diskBox(disks), min.x - 0.14, max.z - 0.02, { width: Math.max(0.152, 0.06 + disks.length * 0.016), rotY: 0.25 }));
  put("notebook", place(notebook(), min.x + 0.02, max.z + 0.17, { width: 0.31, rotY: 0.12 }));
  put("card", place(card(), max.x + 0.42, max.z - 0.14, { width: 0.11, rotY: -0.55 }));
  // The racquet leans against the wall on the floor by the desk; the ball stays on the desk.
  const bat = racquet();
  bat.rotation.x = -1.2;
  put("racquet", place(bat, room.desk.maxX + 0.14, wall + 0.1, { height: 0.66, rotY: -0.35, y: floor, shadow: true }));
  put("ball", place(tennisBall(), room.desk.maxX - 0.3, back + 0.12, { height: 0.067 }));
  // The cutting mat under the computer, and the big world map behind it, like the one in my room.
  scene.add(cuttingMat(min.x - 0.12, max.x + 0.16, back + 0.03, max.z + 0.05));
  put("worldmap", hang(wallMap(onChange), (min.x + max.x) / 2 - 0.02, 0.58, wall, 0.56));
  put("cube", place(rubik(), min.x - 0.25, max.z + 0.2, { height: 0.057, rotY: 0.5 }));
  put("bitcoin", place(bitcoin(), max.x + 0.16, max.z + 0.03, { width: 0.04 }));
  // The right wall: a floating shelf (books, the framed things leaning on it, the grad cap), the cork
  // board of places under it and the pennant beside.
  const shelfY = 0.6;
  const shelfX = 0.88;
  put("shelf", shelf(shelfX, shelfY, wall, 0.76, 0.17));
  const onShelf = (o: Object3D, x: number, opts: PlaceOpts) => place(o, shelfX + x, wall + 0.085, { ...opts, y: shelfY, shadow: true });
  put("books", onShelf(books(9), -0.22, { width: 0.24 }));
  put("pennant", hang(pennant(), 1.3, 0.42, wall, 0.14));
  const diplomaFrame = diploma();
  diplomaFrame.rotation.x = -0.1; // leaning on the wall
  put("diploma", onShelf(diplomaFrame, 0.08, { height: 0.15, rotY: -0.05 }));
  const portrait = pixelPortrait();
  portrait.rotation.x = -0.12; // leaning back against the glass
  put("pixelart", onSill(portrait, sill.x0 + 0.42, { height: 0.15 }));
  put("corkboard", onWall(corkboard(), shelfX, 0.32, 0.3));
  put("mortarboard", onShelf(mortarboard(), 0.28, { width: 0.17, rotY: 0.3 }));
  onChange();

  let gltf: GLTF;
  try {
    gltf = await loader.loadAsync(PROPS_URL);
  } catch {
    return; // the scene is complete without them
  }
  const byName = Object.fromEntries(ORDER.map((name, i) => [name, gltf.scenes[i]])) as Record<(typeof ORDER)[number], Group | undefined>;
  const arrivals = new Group(); // off-scene until `prepare` is done
  into = arrivals;
  const add = (name: (typeof ORDER)[number], fn: (o: Group) => Object3D) => {
    const o = byName[name];
    if (o) put(name, fn(o));
  };

  if (byName.lamp) {
    // A clamp lamp, clamped to the back edge, reaching over the keyboard.
    const lamp = put("lamp", place(byName.lamp, min.x - 0.16, back + 0.025, { height: 0.5, rotY: 0.85, y: -0.045 }));
    if (fitBulb(lamp, light)) {
      light.angle = 0.62;
      light.penumbra = 0.55;
      light.distance = 3;
      light.userData.on = 2.6; // a 60 W bulb a hand's width from the desk
    }
  }
  add("globe", (o) => place(o, min.x - 0.42, back + 0.2, { height: 0.32, rotY: 2.4 }));
  add("super8", (o) => place(o, min.x - 0.42, max.z + 0.06, { height: 0.17, rotY: 0.9 }));
  add("spectacles", (o) => place(o, min.x + 0.1, max.z + 0.14, { width: 0.13, rotY: 0.35, y: 0.0115 }));
  add("duck", (o) => place(o, min.x - 0.08, max.z - 0.17, { height: 0.065, rotY: 0.6 }));
  if (byName.cassette) {
    // The Walkman on its back, lid up, with its tape out on the desk beside it.
    const kit = byName.cassette;
    // Where the tape sits inside the player, in the player's own space, so it can go back in.
    kit.updateMatrixWorld(true);
    const inside = kit.getObjectByName("portable_cassette_player_casette");
    const bay = inside ? new Box3().setFromObject(inside).getCenter(new Vector3()) : null;
    const tape = piece(kit, "portable_cassette_player_casette", true);
    const body = new Group();
    for (const name of ["portable_cassette_player", "portable_cassette_player_lid"]) {
      const p = piece(kit, name);
      if (p) body.add(p);
    }
    const player = tape && body.children.length ? body : kit;
    player.rotation.x = -Math.PI / 2;
    put("cassette", place(player, max.x + 0.3, front - 0.14, { width: 0.13, rotY: -0.5 }));
    if (tape && player === body) {
      body.userData.bay = bay;
      body.userData.hotspot = { kind: "walkman", label: "Walkman" };
      tape.userData.hotspot = { kind: "tape", label: "a mixtape", hint: "put it in the Walkman" };
      tape.rotation.x = -Math.PI / 2;
      put("tape", place(tape, max.x + 0.43, front - 0.2, { width: 0.1, rotY: 0.35 }));
    }
  }
  if (byName.phone) {
    // The handset is its own part, so a click can lift it out of the cradle.
    const kit = byName.phone;
    const handset = piece(kit, "sellphone_low.002_phone.001_0");
    const phone = new Group();
    for (const o of [...kit.children]) if (o.name !== "sellphone_low.002_phone.001_0") phone.add(o);
    if (handset) {
      handset.name = "handset";
      phone.add(handset);
    }
    put("phone", place(phone, max.x + 0.36, back + 0.22, { height: 0.12, rotY: -0.45 })); // by height: the coiled cord is long
  }
  add("answering", (o) => place(o, max.x + 0.14, back + 0.08, { width: 0.14, rotY: -0.2 })); // behind the drives, with the phone
  if (byName.pens) {
    const kit = byName.pens;
    const cup = penCup(kit);
    put("pens", cup ? place(cup, max.x + 0.24, back + 0.08, { height: 0.17, rotY: 0.9 }) : place(kit, max.x + 0.08, back + 0.36, { width: 0.15, rotY: 0.9 }));
    const eraser = piece(kit, "stationery_supplies_eraser", true);
    if (eraser) put("eraser", place(eraser, max.x + 0.32, back + 0.2, { width: 0.044, rotY: 0.4 }));
    const pencil = piece(kit, "stationery_supplies_pencil_old", true);
    if (pencil) put("pencil", place(pencil, min.x - 0.08, max.z + 0.33, { width: 0.094, rotY: -0.3 }));
  }
  add("camera", (o) => place(o, max.x + 0.2, max.z + 0.1, { width: 0.15, rotY: -0.7 }));
  add("plant", (o) => onSill(o, sill.x1 - 0.42, { height: 0.2 }));
  add("clock", (o) => hang(o, shelfX + 0.1, 0.88, wall, 0.17));
  add("clapper", (o) => place(o, min.x - 0.14, back + 0.1, { width: 0.22, rotY: 1.35 })); // imagination side, by the globe
  add("longhorn", (o) => { // above the map
    o.rotation.set(Math.PI / 2, 0, -Math.PI / 2, "ZYX"); // face out from the wall, nose down
    return hang(o, mid, 1.02, wall, 0.2); // a steer skull over the map, DFW style
  });
  add("biplane", (o) => onSill(o, sill.x0 + 0.18, { width: 0.24, rotY: 0.5 }));
  add("rugby", (o) => place(o, room.desk.minX - 0.45, wall + 0.75, { width: 0.28, rotY: -0.4, y: floor, shadow: true }));
  add("chair", (o) => place(o, min.x - 0.62, front + 0.32, { height: 0.85, rotY: 0.9, y: floor, shadow: true }));
  add("studiolight", (o) => place(o, room.desk.maxX + 0.45, wall + 0.55, { height: 1.75, rotY: -0.6, y: floor, shadow: true }));
  add("suitcase", (o) => place(o, room.desk.minX - 0.3, wall + 0.3, { width: 0.6, rotY: 0.15, y: floor, shadow: true }));
  add("skateboard", (o) => place(o, room.desk.minX - 0.12, wall + 0.2, { height: 0.7, y: floor, shadow: true }));
  // The implementation side: a breadboard mid-build, the meter on it, the joystick by the keys.
  add("breadboard", (o) => place(o, max.x + 0.58, back + 0.36, { width: 0.15, rotY: -0.3 }));
  add("multimeter", (o) => place(o, max.x + 0.64, back + 0.56, { height: 0.12, rotY: -0.6 }));
  add("joystick", (o) => place(o, max.x + 0.12, max.z + 0.18, { height: 0.11, rotY: -0.3 }));
  if (byName.headphones) {
    // Only the headphones from the Walkman kit, lying on the desk by the player.
    const cans = piece(byName.headphones, "headset_Material_0", true);
    if (cans) {
      cans.rotation.x = -Math.PI / 2;
      put("headphones", place(cans, max.x + 0.62, front - 0.28, { width: 0.14, rotY: 0.4 }));
    }
  }
  if (byName.frame) {
    byName.frame.traverse((o) => {
      const mesh = o as Mesh;
      const mat = mesh.material as MeshStandardMaterial | undefined;
      if (!mesh.isMesh || !mat) return;
      if (mat.name.includes("artwork")) {
        mat.map = reunionPrint();
        mat.color.set("#ffffff");
        mat.needsUpdate = true;
      }
      if (mat.name.includes("glass")) mesh.visible = false; // its tint hid the print
    });
    byName.frame.rotation.x = -0.1; // leaning on the shelf, against the wall
    put("frame", place(byName.frame, shelfX - 0.05, wall + 0.06, { height: 0.24, y: shelfY, shadow: true }));
  }
  await prepare(arrivals);
  for (const o of [...arrivals.children]) scene.add(o);
  // The lamp switches on once it's on the desk, at its bulb (desk.ts keeps it off until then).
  (light.userData.sync as (() => void) | undefined)?.();
  if (light.userData.on) {
    light.intensity = light.userData.on as number;
    const spill = light.userData.spill as PointLight | undefined;
    if (spill) spill.intensity = 0.35;
  }
  onChange();
}
