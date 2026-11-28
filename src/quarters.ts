// Fixed fittings in hull coordinates, measured up from the deck. Each bay batches its hardware
// into a single coloured mesh, so bolts, crops and straps don't each cost a draw call.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type XYZ = [number, number, number];
const steel = "#485353",
  brass = "#b9a271",
  primer = "#a35239",
  cream = "#cec7a7",
  ink = "#293137",
  olive = "#77816b",
  blue = "#52727c",
  rubber = "#353935",
  wood = "#b38863",
  linen = "#c8bb98";
const half = Math.PI / 2;
let surface: MeshStandardMaterial | undefined;
function wornPaint() {
  if (surface) return surface;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#eeeae2";
  ctx.fillRect(0, 0, 128, 128);
  let seed = 1958;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = i % 3 ? "rgba(80,63,49,.085)" : "rgba(250,251,236,.40)";
    ctx.fillRect(rand() * 128, rand() * 128, 0.6 + rand() * 3, 0.6 + rand());
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  return (surface = new MeshStandardMaterial({
    vertexColors: true,
    map,
    metalness: 0.16,
    roughness: 0.76,
    side: DoubleSide,
  }));
}

class Bay {
  readonly group = new Group();
  private parts: BufferGeometry[] = [];
  shape(g: BufferGeometry, colour: string, p: XYZ, rotation: XYZ = [0, 0, 0]) {
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    g.clearGroups();
    g.rotateX(rotation[0])
      .rotateY(rotation[1])
      .rotateZ(rotation[2])
      .translate(...p);
    const c = new Color(colour),
      count = g.attributes.position.count;
    const rgb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.toArray(rgb, 3 * i);
    g.setAttribute("color", new BufferAttribute(rgb, 3));
    this.parts.push(g);
  }
  box(p: XYZ, size: XYZ, colour: string, radius = 0, tilt: XYZ = [0, 0, 0]) {
    this.shape(radius ? new RoundedBoxGeometry(...size, 1, radius) : new BoxGeometry(...size), colour, p, tilt);
  }
  can(p: XYZ, r: number, h: number, colour: string, tilt: XYZ = [0, 0, 0], rTop = r) {
    this.shape(new CylinderGeometry(rTop, r, h, 18), colour, p, tilt);
  }
  loop(p: XYZ, r: number, thickness: number, colour: string, rot: XYZ = [0, 0, 0]) {
    this.shape(new TorusGeometry(r, thickness, 6, 26), colour, p, rot);
  }
  pipe(points: XYZ[], r: number, colour: string) {
    const path = new CatmullRomCurve3(points.map((a) => new Vector3(...a)));
    this.shape(new TubeGeometry(path, Math.max(8, points.length * 3), r, 6, false), colour, [0, 0, 0]);
  }
  soft(p: XYZ, size: XYZ, colour: string, tilt: XYZ = [0, 0, 0]) {
    this.shape(new SphereGeometry(1, 12, 8).scale(...size), colour, p, tilt);
  }
  finish() {
    this.group.add(new Mesh(mergeGeometries(this.parts), wornPaint()));
    this.parts.forEach((p) => p.dispose());
    return this.group;
  }
  panel(p: XYZ, w: number, h: number, yaw: number, draw: (g: CanvasRenderingContext2D) => void) {
    const c = document.createElement("canvas");
    c.width = 768;
    c.height = 320;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    const map = new CanvasTexture(c);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    const plate = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map, roughness: 0.76 }));
    plate.position.set(...p);
    plate.rotation.y = yaw;
    this.group.add(plate);
    return plate;
  }
  plate(p: XYZ, w: number, h: number, yaw: number, header: string, lines: string[], bg = cream, fg = ink) {
    this.panel(p, w, h, yaw, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 768, 320);
      g.strokeStyle = fg;
      g.lineWidth = 3;
      g.strokeRect(12, 12, 744, 296);
      g.fillStyle = fg;
      g.font = "bold 53px monospace";
      g.fillText(header, 33, 80, 700);
      g.fillRect(32, 101, 704, 3);
      g.font = "40px monospace";
      lines.forEach((line, i) => g.fillText(line, 33, 161 + i * 58, 700));
      for (const x of [18, 750])
        for (const y of [18, 302]) {
          g.beginPath();
          g.arc(x, y, 5, 0, 2 * Math.PI);
          g.fill();
        }
    });
  }
}

function wheelhouse(b: Bay) {
  // Narrow side-by-side seats, steering clutches, engine cover and a paper route kept at eye level.
  for (const z of [1.45, 2.48]) {
    b.box([-3.01, 0.31, z], [0.45, 0.38, 0.48], olive, 0.045);
    b.box([-3.08, 0.56, z], [0.55, 0.15, 0.52], "#725240", 0.065);
    b.box([-2.8, 0.88, z], [0.13, 0.63, 0.51], "#795a43", 0.057, [0, 0, 0.1]);
    for (let k = 0; k < 5; k++)
      b.box([-2.887, 0.68 + k * 0.09, z], [0.022, 0.02, 0.44], "#aa8761", 0.009, [0, 0, 0.1]);
    for (const dz of [-0.2, 0.2]) b.box([-3.09, 0.12, z + dz], [0.66, 0.07, 0.055], steel);
    for (const dz of [-0.12, 0.12]) {
      b.pipe(
        [
          [-3.56, 0.42, z + dz],
          [-3.53, 0.66, z + dz],
          [-3.46, 0.85, z + dz],
        ],
        0.017,
        steel,
      );
      b.can([-3.46, 0.87, z + dz], 0.028, 0.105, rubber, [0, 0, -0.25]);
    }
  }
  b.box([-3.98, 0.73, 1.91], [0.43, 0.47, 2.31], olive, 0.035);
  b.box([-3.91, 1.01, 1.9], [0.56, 0.1, 2.39], steel, 0.025);
  b.plate([-3.748, 0.73, 2.5], 0.53, 0.2, half, "ROUTE / 06", ["FLAGS TO RIDGE", "LAST FIX  04:10"]);
  b.panel([-3.749, 0.8, 1.49], 0.9, 0.28, half, (g) => {
    g.fillStyle = "#48534a";
    g.fillRect(0, 0, 768, 320);
    for (const [x, y, r] of [
      [140, 150, 117],
      [375, 132, 85],
      [600, 132, 85],
    ]) {
      g.fillStyle = "#a4a48d";
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
      g.fillStyle = "#242927";
      g.beginPath();
      g.arc(x, y, r - 8, 0, 7);
      g.fill();
      g.save();
      g.translate(x, y);
      for (let i = 0; i < 27; i++) {
        let a = -2.4 + i * 0.184;
        g.save();
        g.rotate(a);
        g.fillStyle = "#e4d9b6";
        g.fillRect(-2, -r + 16, 4, i % 3 ? 10 : 18);
        g.restore();
      }
      g.rotate(x / 280 - 1.6);
      g.fillStyle = "#f4ac6c";
      g.fillRect(-3, -r + 31, 6, r - 16);
      g.restore();
    }
  });
  for (let i = 0; i < 6; i++)
    b.can([-3.73, 0.59, 1.21 + i * 0.13], 0.018, 0.038, i === 2 ? primer : brass, [0, 0, half]);
  // Windshield mullions, seals, two parked wiper arms.
  for (const z of [0.15, 0.95, 1.75, 2.55, 3.35]) b.box([-4.17, 1.53, z], [0.075, 0.84, 0.043], steel);
  for (const y of [1.12, 1.95]) b.box([-4.17, y, 1.75], [0.075, 0.045, 3.24], rubber);
  for (const z of [1.03, 2.6])
    b.pipe(
      [
        [-4.12, 1.17, z],
        [-4.125, 1.32, z + 0.21],
        [-4.12, 1.47, z + 0.53],
      ],
      0.012,
      ink,
    );
  b.box([-3.56, 0.37, 0.45], [0.96, 0.57, 0.58], primer, 0.035);
  for (let i = 0; i < 9; i++) b.box([-3.94 + i * 0.085, 0.66, 0.43], [0.035, 0.018, 0.4], rubber);
  for (const z of [1.45, 2.48]) {
    for (const off of [-0.19, 0.19]) b.box([-2.721, 0.87, z + off], [0.013, 0.54, 0.011], wood, 0, [0, 0, 0.1]);
    b.box([-2.71, 0.87, z], [0.026, 0.21, 0.29], olive, 0.018, [0, 0, 0.1]);
    b.box([-2.69, 0.96, z], [0.012, 0.014, 0.28], brass);
  }
  // The route survives a dead dispatch terminal as a grease-pencil line on a folded chart.
  const chart = b.panel([-3.92, 1.065, 2.57], 0.65, 0.36, 0, (g) => {
    g.fillStyle = "#cabd95";
    g.fillRect(0, 0, 768, 320);
    g.strokeStyle = "#a89873";
    g.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      for (let x = 0; x <= 768; x += 6) {
        const y = 10 * i + 43 * Math.sin(x / 116 + i * 0.11) + 16 * Math.cos(x / 43 + i * 0.15);
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = "#49565b";
    g.setLineDash([7, 7]);
    g.strokeRect(26, 18, 715, 278);
    g.setLineDash([]);
    g.strokeStyle = "#934b37";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(40, 238);
    g.lineTo(189, 214);
    g.lineTo(344, 126);
    g.lineTo(528, 143);
    g.lineTo(666, 63);
    g.stroke();
    g.fillStyle = "#444e4c";
    g.font = "bold 27px monospace";
    g.fillText("06    /    RIDGE TRAVERSE", 38, 54);
    g.fillText("x SIX", 636, 93);
    g.fillStyle = "#eee2bf";
    g.fillRect(373, 0, 3, 320);
  });
  chart.rotation.set(-half, 0, -half + 0.08);
  b.box([-4.03, 1.075, 1.12], [0.21, 0.09, 0.23], ink, 0.014);
  b.soft([-4.03, 1.126, 1.12], [0.077, 0.045, 0.077], brass);
  b.pipe(
    [
      [-3.75, 0.69, 0.95],
      [-3.62, 0.44, 0.92],
      [-3.7, 0.25, 1.01],
      [-3.89, 0.26, 1.15],
    ],
    0.013,
    rubber,
  );
}

function berths(b: Bay) {
  for (const [i, deck] of [0.7, 1.42].entries()) {
    const plaid = i ? "#7a7352" : "#84665b";
    b.box([-2.66, deck, 0.38], [1.19, 0.076, 0.61], plaid, 0.03);
    for (let j = 0; j < 11; j++) {
      const x = -3.21 + j * 0.107;
      b.box([x, deck + 0.039, 0.38], [0.012, 0.006, 0.6], i ? "#a89c73" : "#be9278");
    }
    for (const z of [0.19, 0.31, 0.56])
      b.box([-2.66, deck + 0.043, z], [1.16, 0.004, 0.013], i ? "#515f52" : "#5d4951");
    b.can([-2.17, deck + 0.105, 0.38], 0.096, 0.55, i ? blue : olive, [half, 0, 0]);
    for (const z of [0.21, 0.53]) b.loop([-2.17, deck + 0.105, z], 0.098, 0.011, brass);
  }
  for (const x of [-2.18, -1.98]) b.can([x, 0.69, 0.8], 0.018, 1.36, steel);
  for (const y of [0.26, 0.51, 0.76, 1.01, 1.26]) b.can([-2.08, y, 0.8], 0.016, 0.21, brass, [0, 0, half]);
  for (const x of [-3.37, -2.75]) {
    b.box([x, 0.245, 0.39], [0.54, 0.35, 0.55], olive, 0.028);
    for (const dx of [-0.17, 0.17]) b.box([x + dx, 0.245, 0.67], [0.037, 0.34, 0.016], brass);
    b.box([x, 0.29, 0.69], [0.14, 0.027, 0.03], rubber);
  }
  b.plate([-2.8, 1.05, 0.045], 0.58, 0.2, 0, "WATCH HANDOVER", ["01—07   NIKA / HF", "07—13   OLEG / ENGINE"]);
  b.pipe(
    [
      [-3.59, 1.82, 0.1],
      [-3.02, 1.73, 0.11],
      [-2.54, 1.75, 0.1],
      [-1.96, 1.82, 0.1],
    ],
    0.008,
    ink,
  );
  // A jacket on the end hook, and wet boots left toe-out under the ladder.
  const coat = "#a87444";
  b.pipe(
    [
      [-3.55, 1.65, 0.1],
      [-3.55, 1.63, 0.22],
      [-3.55, 1.68, 0.24],
    ],
    0.012,
    brass,
  );
  b.box([-3.55, 1.43, 0.22], [0.24, 0.37, 0.085], coat, 0.035);
  for (const side of [-1, 1])
    b.soft([-3.55 + side * 0.144, 1.42, 0.22], [0.05, 0.19, 0.044], coat, [0, 0, side * 0.17]);
  b.box([-3.55, 1.44, 0.269], [0.009, 0.31, 0.008], ink);
  for (const x of [-2.14, -1.97]) {
    b.soft([x, 0.085, 0.87], [0.063, 0.067, 0.124], rubber);
    b.can([x, 0.155, 0.83], 0.058, 0.18, "#635544");
    b.can([x, 0.246, 0.83], 0.051, 0.004, ink);
  }
  // A cloth edge hangs over the bunk frame and breaks the silhouette of the folded bedding.
  for (const [i, y] of [0.7, 1.42].entries()) {
    b.box([-2.67, y - 0.057, 0.685], [0.79, 0.15, 0.028], i ? "#74805c" : "#95695b", 0.012);
    for (let j = 0; j < 7; j++)
      b.box([-3.01 + j * 0.109, y - 0.055, 0.702], [0.012, 0.14, 0.008], i ? "#b1aa81" : "#c3a78d");
  }
}

function galley(b: Bay) {
  b.box([-0.93, 0.52, 3.17], [1.91, 0.88, 0.55], olive, 0.025);
  b.box([-0.93, 1.0, 3.13], [2.0, 0.075, 0.67], wood, 0.022);
  for (const x of [-1.58, -0.95, -0.32]) {
    b.box([x, 0.54, 2.88], [0.58, 0.73, 0.035], cream, 0.016);
    b.box([x, 0.81, 2.847], [0.16, 0.024, 0.035], steel, 0.008);
    for (const y of [0.27, 0.32, 0.37]) b.box([x, y, 2.856], [0.26, 0.012, 0.008], olive);
  }
  // Recessed enamel washing bowl, deck-mounted swan-neck tap and two mismatched cups.
  b.shape(
    new LatheGeometry(
      [
        [0.06, 0],
        [0.11, 0.02],
        [0.19, 0.1],
        [0.2, 0.115],
        [0.18, 0.115],
        [0.1, 0.026],
        [0.06, 0.02],
      ].map((a) => new Vector2(...(a as [number, number]))),
      24,
    ),
    cream,
    [-1.49, 1.04, 3.13],
  );
  b.pipe(
    [
      [-1.65, 1.04, 3.36],
      [-1.65, 1.28, 3.36],
      [-1.54, 1.31, 3.27],
      [-1.52, 1.23, 3.19],
    ],
    0.016,
    steel,
  );
  b.box([-0.37, 1.08, 3.16], [0.53, 0.11, 0.44], ink, 0.018);
  b.can([-0.37, 1.24, 3.17], 0.145, 0.215, blue);
  b.can([-0.37, 1.36, 3.17], 0.15, 0.025, steel);
  b.soft([-0.37, 1.39, 3.17], [0.035, 0.025, 0.035], rubber);
  for (const x of [-0.56, -0.18]) b.box([x, 1.29, 3.17], [0.1, 0.031, 0.04], rubber, 0.012);
  for (const [i, x] of [-1.01, -0.81].entries()) {
    b.can([x, 1.1, 2.99], 0.047, 0.105, i ? primer : cream);
    b.can([x, 1.154, 2.99], 0.041, 0.004, ink);
    b.loop([x + 0.051, 1.105, 2.99], 0.032, 0.008, i ? primer : cream);
  }
  b.box([-0.91, 1.62, 3.31], [1.88, 0.036, 0.31], wood);
  for (let i = 0; i < 11; i++) {
    const x = -1.72 + i * 0.15;
    b.can([x, 1.736, 3.3], 0.061, 0.18, i % 3 === 0 ? primer : i % 3 === 1 ? cream : blue);
    b.can([x, 1.735, 3.3], 0.062, 0.055, i % 2 ? olive : brass);
    b.can([x, 1.829, 3.3], 0.063, 0.01, steel);
  }
  b.pipe(
    [
      [-1.86, 1.62, 3.13],
      [-1.86, 1.74, 3.13],
      [-0.02, 1.74, 3.13],
      [-0.02, 1.62, 3.13],
    ],
    0.011,
    steel,
  );
  b.plate([-0.92, 1.33, 3.475], 0.55, 0.21, Math.PI, "PANTRY / 2 CREW", ["OATS  18 KG", "BEANS  11 KG"]);
  // A narrow drop-leaf eating surface and its folding leg, beside the stove.
  b.box([-2.26, 0.77, 3.03], [0.61, 0.045, 0.86], wood, 0.018);
  b.pipe(
    [
      [-2.51, 0.74, 2.73],
      [-2.51, 0.16, 2.73],
      [-2.08, 0.16, 2.73],
      [-2.08, 0.74, 2.73],
    ],
    0.017,
    steel,
  );
  b.box([-2.24, 0.48, 2.47], [0.38, 0.07, 0.31], blue, 0.027);
  for (const x of [-2.38, -2.1]) b.box([x, 0.24, 2.47], [0.035, 0.45, 0.24], steel);
  const towel = "#b9a493";
  b.can([-0.85, 0.82, 2.8], 0.012, 0.32, steel, [0, 0, half]);
  for (let i = 0; i < 6; i++)
    b.box(
      [-0.96 + i * 0.039, 0.69, 2.79 + (i % 2) * 0.009],
      [0.045, 0.28, 0.023],
      i % 3 === 0 ? blue : towel,
      0.008,
    );
  b.plate(
    [-1.5, 1.4, 3.439],
    0.34,
    0.17,
    Math.PI,
    "NIKA'S BREAD",
    ["2 CUPS  /  1 TIN", "SAVE THE HEEL"],
    "#cca776",
  );
  for (let i = 0; i < 4; i++) {
    const x = -1.7 + i * 0.39;
    b.pipe(
      [
        [x, 1.78, 3.45],
        [x, 1.83, 3.43],
        [x + 0.08, 1.84, 3.39],
      ],
      0.006,
      brass,
    );
  }
  b.pipe(
    [
      [-1.82, 1.43, 3.45],
      [-1.82, 1.56, 3.45],
      [-0.23, 1.55, 3.45],
      [-0.16, 1.47, 3.44],
    ],
    0.011,
    steel,
  );
  for (const [i, x] of [-0.81, -0.72, -0.62].entries()) {
    b.can([x, 1.45, 3.42], 0.009, 0.15, steel);
    b.soft([x, 1.35, 3.42], [0.031, i === 2 ? 0.033 : 0.046, 0.012], brass);
  }
}

function garden(b: Bay) {
  // The first grow light drained the battery. Salvaged foil now returns its light into the trays.
  b.panel([1.07, 1.2, 3.434], 1.72, 1.4, Math.PI, (g) => {
    const foil = g.createLinearGradient(0, 0, 768, 260);
    foil.addColorStop(0, "#707b78");
    foil.addColorStop(0.28, "#c0c8b9");
    foil.addColorStop(0.55, "#929993");
    foil.addColorStop(1, "#d5cbbd");
    g.fillStyle = foil;
    g.fillRect(0, 0, 768, 320);
    let seed = 23;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 180; i++) {
      const x = rand() * 768,
        y = rand() * 320;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rand() * 53, y + rand() * 24 - 12);
      g.lineTo(x + rand() * 30, y + rand() * 42);
      g.closePath();
      g.fillStyle = i % 2 ? "rgba(50,52,63,.075)" : "rgba(250,230,241,.14)";
      g.fill();
    }
    for (let x = 0; x < 768; x += 191) {
      g.fillStyle = "#888e88";
      g.fillRect(x, 0, 6, 320);
      g.fillStyle = "#c9cbbd";
      g.fillRect(x + 6, 0, 2, 320);
    }
  });
  for (const x of [0.21, 1.92])
    for (const z of [2.87, 3.38]) {
      b.box([x, 0.98, z], [0.035, 1.89, 0.035], steel);
      b.box([x, 0.055, z], [0.12, 0.05, 0.12], brass);
    }
  b.box([1.1, 0.25, 3.13], [1.5, 0.34, 0.43], blue, 0.045);
  b.plate([1.08, 0.25, 2.902], 0.46, 0.16, Math.PI, "RETURN / 18 L", ["TOP UP AT DUSK"]);
  const leafy = ["#4b764e", "#6d975c", "#819f52", "#a4b86a", "#608e68"];
  // One tapered, veined blade shared by every plant. Instance colours and rotations vary by tray.
  const vertex = [
    -0.01, 0, 0, 0, 0, 0.012, 0.01, 0, 0, -0.035, 0.48, 0.05, 0, 0.53, 0.074, 0.035, 0.44, 0.05, 0, 1, 0.19,
  ];
  const leaf = new BufferGeometry();
  leaf.setAttribute("position", new BufferAttribute(new Float32Array(vertex), 3));
  leaf.setIndex([0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4, 3, 4, 6, 4, 5, 6]);
  leaf.computeVertexNormals();
  const crop = new InstancedMesh(leaf, new MeshStandardMaterial({ side: DoubleSide, roughness: 0.88 }), 216);
  const stem = new Object3D();
  let leafIndex = 0;
  for (const [tier, y] of [0.57, 1.22].entries()) {
    b.box([1.065, y, 3.12], [1.78, 0.067, 0.59], steel, 0.012);
    for (let tray = 0; tray < 3; tray++) {
      const x = 0.52 + tray * 0.54;
      b.box([x, y + 0.075, 3.13], [0.5, 0.12, 0.44], tray === 1 ? primer : olive, 0.018);
      b.box([x, y + 0.138, 3.13], [0.47, 0.012, 0.405], "#423c2d");
      for (let k = 0; k < 6; k++) {
        const cx = x + ((k % 3) - 1) * 0.145,
          cz = 3.13 + (k < 3 ? -0.088 : 0.088);
        const h = 0.1 + 0.028 * ((k + tray + tier) % 4);
        b.can([cx, y + 0.145 + h * 0.42, cz], 0.006, h, olive);
        for (let n = 0; n < 6; n++) {
          const angle = n * 2.4 + k * 0.9 + tray;
          const tall = h * (0.7 + 0.09 * (n % 3));
          stem.position.set(cx, y + 0.151, cz);
          stem.rotation.set(0.44 + n * 0.15, angle, 0.08 * Math.sin(angle), "YXZ");
          stem.scale.set(1.02 + (n % 2) * 0.16, tall, 0.29);
          stem.updateMatrix();
          crop.setMatrixAt(leafIndex, stem.matrix);
          crop.setColorAt(leafIndex++, new Color(leafy[(n + k + tier) % leafy.length]));
        }
      }
    }
    b.box([1.065, y + 0.59, 3.13], [1.72, 0.065, 0.26], cream, 0.012);
    for (const z of [3.065, 3.19]) b.can([1.065, y + 0.545, z], 0.014, 1.63, "#fae1bc", [0, 0, half]);
  }
  crop.computeBoundingSphere();
  b.group.add(crop);
  for (const y of [0.57, 1.22]) {
    b.pipe(
      [
        [0.27, y + 0.54, 3.22],
        [0.18, y + 0.54, 3.25],
        [0.14, y + 0.29, 3.19],
        [0.2, y + 0.1, 3.03],
      ],
      0.009,
      ink,
    );
    b.box([0.25, y + 0.46, 2.87], [0.08, 0.13, 0.036], blue, 0.007);
    b.box([0.25, y + 0.48, 2.845], [0.039, 0.019, 0.008], "#d5ac65");
  }
  b.box([1.69, 0.27, 2.88], [0.22, 0.21, 0.09], cream, 0.015);
  b.can([1.71, 0.29, 2.823], 0.049, 0.032, steel, [half, 0, 0]);
  b.box([1.65, 0.25, 2.814], [0.02, 0.02, 0.015], primer);
  for (const [i, x] of [0.51, 1.06, 1.59].entries()) {
    b.plate([x, 0.65, 2.902], 0.21, 0.065, Math.PI, ["CHARD", "CRESS", "CHARD"][i], []);
  }
  b.pipe(
    [
      [1.84, 0.24, 3.1],
      [1.97, 0.25, 3.13],
      [1.97, 0.79, 3.15],
      [1.97, 1.46, 3.15],
      [1.84, 1.46, 3.15],
    ],
    0.017,
    blue,
  );
  b.plate(
    [1.07, 1.91, 2.86],
    0.69,
    0.19,
    Math.PI,
    "NURSERY / 03",
    ["CHARD   ·   CRESS", "SAVE SEED FOR RELAY 6"],
    "#dbce9c",
  );
}

function service(b: Bay) {
  // Opposite ends of the wet bay keep the wash closet separate from the drinking-water circuit.
  b.box([3.59, 0.09, 2.86], [1.13, 0.11, 0.91], steel, 0.04);
  b.box([3.95, 0.73, 3.22], [0.43, 0.55, 0.19], cream, 0.035);
  b.soft([3.93, 0.46, 2.95], [0.23, 0.26, 0.3], cream);
  b.loop([3.93, 0.64, 2.9], 0.185, 0.038, linen, [half, 0, 0]);
  b.pipe(
    [
      [3.04, 1.9, 3.45],
      [3.04, 1.9, 2.48],
      [4.16, 1.9, 2.48],
    ],
    0.018,
    brass,
  );
  for (let i = 0; i < 10; i++) {
    const z = 3.39 - i * 0.043;
    b.box([3.055 + (i % 2) * 0.028, 1.13, z], [0.032, 1.39, 0.055], i % 2 ? olive : "#99a18d", 0.013);
    b.loop([3.04, 1.865, z], 0.037, 0.005, steel);
  }
  // Rear insulated hatch with a dogged wheel, kick plate and rubber perimeter.
  b.box([4.18, 1.0, 1.65], [0.08, 1.88, 0.92], rubber, 0.035);
  b.box([4.125, 1.0, 1.65], [0.072, 1.79, 0.84], olive, 0.033);
  b.box([4.081, 0.37, 1.65], [0.014, 0.4, 0.73], steel);
  b.loop([4.053, 0.98, 1.39], 0.115, 0.012, primer, [0, half, 0]);
  for (const a of [0, 1.05, 2.1]) b.box([4.054, 0.98, 1.39], [0.019, 0.014, 0.22], primer, 0, [a, 0, 0]);
  b.plate([4.08, 1.5, 1.65], 0.57, 0.21, -half, "AIRLOCK / 23", ["DOG BEFORE MOVING"]);
  for (const [i, z] of [0.41, 0.94].entries()) {
    b.can([3.72, 0.68, z], 0.22, 1.04, i ? blue : olive);
    for (const y of [0.32, 0.88]) b.can([3.72, y, z], 0.225, 0.045, steel);
    b.soft([3.72, 1.19, z], [0.215, 0.08, 0.215], i ? blue : olive);
    b.pipe(
      [
        [3.72, 1.23, z],
        [3.72, 1.47, z],
        [3.94, 1.5, z],
        [4.04, 1.5, z],
      ],
      0.025,
      brass,
    );
  }
  b.box([3.91, 1.62, 0.65], [0.28, 0.31, 0.78], cream, 0.016);
  b.plate([3.759, 1.62, 0.65], 0.66, 0.24, -half, "MELT / FILTER", ["BLUE  ·  POTABLE", "GREEN ·  WASH"]);
  for (const x of [2.75, 3.04]) {
    b.box([x, 0.23, 0.31], [0.25, 0.34, 0.43], ink, 0.025);
    for (const z of [0.18, 0.44]) b.can([x, 0.416, z], 0.023, 0.045, primer);
    b.box([x, 0.23, 0.531], [0.2, 0.11, 0.012], brass);
  }
  // Diesel-fired heater under the finned exchanger. The flue exits through a bolted roof collar.
  b.box([2.96, 0.52, 0.23], [0.54, 0.35, 0.37], primer, 0.035);
  b.pipe(
    [
      [2.77, 0.67, 0.27],
      [2.68, 0.87, 0.23],
      [2.68, 1.58, 0.23],
      [2.68, 2.06, 0.23],
    ],
    0.049,
    steel,
  );
  for (const y of [1.09, 1.61]) b.can([2.68, y, 0.23], 0.062, 0.04, brass);
  b.box([2.68, 2.055, 0.23], [0.25, 0.035, 0.26], steel);
  b.plate([2.94, 0.53, 0.423], 0.36, 0.12, 0, "HEAT / 24 V", ["PRIME BY HAND"], ink, cream);
  b.can([3.09, 0.92, 0.23], 0.12, 0.55, primer);
  b.loop([3.09, 1.27, 0.23], 0.054, 0.012, brass);
  for (let i = 0; i < 6; i++) b.box([2.92, 0.77 + i * 0.085, 0.15], [0.53, 0.035, 0.26], steel);
  for (const [i, z] of [0.41, 0.94].entries()) {
    b.plate(
      [3.495, 0.74, z],
      0.28,
      0.13,
      -half,
      i ? "DRINK / 02" : "WASH / 01",
      [i ? "BOILED  05:40" : "FILTER RETURN"],
      i ? cream : "#c6af76",
    );
    b.can([3.48, 0.38, z], 0.019, 0.13, brass, [0, 0, half]);
    b.loop([3.4, 0.38, z], 0.053, 0.009, i ? blue : primer, [0, half, 0]);
  }
  b.pipe(
    [
      [3.88, 1.75, 0.2],
      [3.88, 1.9, 0.2],
      [4.13, 1.93, 0.4],
      [4.12, 1.93, 1.43],
    ],
    0.016,
    ink,
  );
  b.plate([4.075, 1.73, 1.65], 0.51, 0.12, -half, "KEEP DOGS CLEAR", [], primer, cream);
  b.box([4.05, 1.13, 2.98], [0.15, 0.26, 0.32], blue, 0.023);
  b.plate([3.969, 1.13, 2.98], 0.22, 0.13, -half, "SOAP", []);
}

export const builders = { wheelhouse, berths, galley, garden, service };
export function buildBay(name: keyof typeof builders) {
  const bay = new Bay();
  builders[name](bay);
  bay.group.name = name;
  return bay.finish();
}
