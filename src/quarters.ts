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
  DataTexture,
  Group,
  InstancedMesh,
  LatheGeometry,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Texture,
  TextureLoader,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { mapSurface, type Surface } from "./cabin-surfaces";
type Finish = string | { tint: string; surface: Surface };
const cloth = (tint: string): Finish => ({ tint, surface: "canvas" });
const leather = (tint: string): Finish => ({ tint, surface: "leather" });

type XYZ = [number, number, number];
const steel = "#485353",
  brass = "#b9a271",
  primer = "#a35239",
  cream = "#cec7a7",
  ink = "#293137",
  olive = "#77816b",
  blue = "#52727c",
  rubber = "#353935",
  wood: Finish = { tint: "#d4b498", surface: "birch" },
  linen = "#c8bb98";
const half = Math.PI / 2;
// Four scanned finishes in one atlas. Wrap labels address one strip of the lower-left tile.
type Trim = "foil" | "wool" | "panel" | 0 | 1 | 2 | 3;
function mapTrim(g: BufferGeometry, tile: Trim) {
  const uv = g.attributes.uv;
  const label = typeof tile === "number";
  const left = tile === "wool" || tile === "panel" ? .5 : 0;
  const bottom = tile === "foil" || tile === "wool" ? .5 : 0;
  for (let i = 0; i < uv.count; i++) {
    const v = label ? (3 - tile + .025 + uv.getY(i) * .95) / 4 : uv.getY(i);
    uv.setXY(i, left + (8 + uv.getX(i) * 496) / 1024, bottom + (8 + v * 496) / 1024);
  }
}

class Bay {
  constructor(private readonly material: MeshStandardMaterial, private readonly trimMaterial: MeshStandardMaterial) {}
  readonly group = new Group();
  private parts: BufferGeometry[] = [];
  private trimParts: BufferGeometry[] = [];
  shape(g: BufferGeometry, colour: Finish, p: XYZ, rotation: XYZ = [0, 0, 0], tile?: Trim) {
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    if (tile === undefined) mapSurface(g, typeof colour === "string" ? "enamel" : colour.surface);
    else mapTrim(g, tile);
    g.clearGroups();
    g.rotateX(rotation[0])
      .rotateY(rotation[1])
      .rotateZ(rotation[2])
      .translate(...p);
    const c = new Color(typeof colour === "string" ? colour : colour.tint),
      count = g.attributes.position.count;
    const rgb = new Uint8Array(count * 3);
    const tint = [Math.round(255*c.r), Math.round(255*c.g), Math.round(255*c.b)];
    for (let i = 0; i < count; i++) rgb.set(tint, 3*i);
    g.setAttribute("color", new BufferAttribute(rgb, 3, true));
    (tile === undefined ? this.parts : this.trimParts).push(g);
  }
  box(p: XYZ, size: XYZ, colour: Finish, radius = 0, tilt: XYZ = [0, 0, 0]) {
    this.shape(radius ? new RoundedBoxGeometry(...size, 1, radius) : new BoxGeometry(...size), colour, p, tilt);
  }
  can(p: XYZ, r: number, h: number, colour: Finish, tilt: XYZ = [0, 0, 0], rTop = r) {
    this.shape(new CylinderGeometry(rTop, r, h, r < .012 ? 8 : r < .035 ? 12 : 20), colour, p, tilt);
  }
  loop(p: XYZ, r: number, thickness: number, colour: Finish, rot: XYZ = [0, 0, 0]) {
    this.shape(new TorusGeometry(r, thickness, 5, r < .065 ? 16 : 24), colour, p, rot);
  }
  pipe(points: XYZ[], r: number, colour: Finish) {
    const path = new CatmullRomCurve3(points.map((a) => new Vector3(...a)));
    this.shape(new TubeGeometry(path, Math.max(8, points.length * 3), r, 6, false), colour, [0, 0, 0]);
  }
  soft(p: XYZ, size: XYZ, colour: Finish, tilt: XYZ = [0, 0, 0]) {
    this.shape(new SphereGeometry(1, 12, 8).scale(...size), colour, p, tilt);
  }
  finish() {
    for (const [parts, material] of [[this.parts, this.material], [this.trimParts, this.trimMaterial]] as const) {
      if (!parts.length) continue;
      const combined = mergeGeometries(parts);
      this.group.add(new Mesh(mergeVertices(combined), material));
      parts.forEach(p => p.dispose());
      combined.dispose();
    }
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
    const plate = this.panel(p, w, h, yaw, (g) => {
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
    plate.userData.hotspot = { kind: "cabinPlate", label: header, hint: "inspect plate" };
  }
}

function wheelhouse(b: Bay) {
  // Narrow side-by-side seats, steering clutches, engine cover and a paper route kept at eye level.
  for (const z of [1.45, 2.48]) {
    b.box([-3.01, 0.31, z], [0.45, 0.38, 0.48], olive, 0.045);
    b.box([-3.08, 0.56, z], [0.55, 0.15, 0.52], leather("#725240"), 0.065);
    b.box([-2.8, 0.88, z], [0.13, 0.63, 0.51], leather("#795a43"), 0.057, [0, 0, 0.1]);
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
      g.fillStyle = "#dfdebf";
      g.font = "bold 20px monospace"; g.textAlign = "center";
      g.fillText(x === 140 ? "ОБ/МИН" : x === 375 ? "МАСЛО" : "ТЕМП", 0, 32);
      for (let number = 0; number <= 6; number++) {
        const a = -2.4 + number * .79;
        g.fillText(String(number), (r-38)*Math.sin(a), -(r-38)*Math.cos(a)+5);
      }
      g.rotate(x / 280 - 1.6);
      g.fillStyle = "#f4ac6c";
      g.fillRect(-3, -r + 31, 6, r - 16);
      g.fillStyle = "#978e71"; g.beginPath(); g.arc(0,0,8,0,Math.PI*2); g.fill();
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
  // Lift-out engine access covers beneath the glazing, with folding handles on the aisle side.
  for (const z of [1.15, 1.75, 2.38]) {
    b.box([-3.92, 1.073, z], [.46, .021, .56], rubber, .012);
    b.shape(new PlaneGeometry(.44, .54), "#b1b8a7", [-3.92, 1.085, z], [-half, 0, 0], "panel");
    for (const dz of [-.05, .05]) b.box([-3.76, 1.094, z + dz], [.013, .02, .014], brass);
    b.box([-3.76, 1.107, z], [.015, .012, .11], steel);
  }
  // A salvaged voice repeater nests between two original hatches. Straps let it travel here.
  b.box([-3.93,1.19,1.78], [.205,.193,.39], "#65675b", .021);
  b.box([-3.82,1.19,1.78], [.027,.174,.365], ink, .009);
  b.panel([-3.803,1.207,1.754], .245,.090,half, g => {
    g.fillStyle = "#182e2d"; g.fillRect(0,0,768,320);
    g.fillStyle = "#84bbae"; g.font = "bold 87px monospace"; g.fillText("HF   /   SIX",32,111);
    for (let i=0; i<20; i++) {
      g.fillStyle = i<13 ? "#9fc7a5" : "#3d5950";
      g.fillRect(38+i*33,180-i*2,22,45+i*2);
    }
    g.fillStyle = "#d7c390"; g.font = "37px monospace"; g.fillText("VOICE WATCH",36,286);
  });
  for (const z of [1.62,1.92]) {
    b.box([-3.93,1.291,z], [.186,.012,.022], cloth("#9f8058"));
    b.can([-3.801,1.16,z],.022,.023,rubber,[0,0,half]);
    b.box([-3.786,1.171,z], [.004,.012,.004], cream);
  }
  for (const [index,z] of [1.615,1.646].entries()) {
    b.can([-3.806,1.232,z],.014,.024,brass,[0,0,half]);
    b.pipe([[-3.79,1.232,z],[-3.746,1.192,z-.012],[-3.756,1.10,z-.062],
      [-3.862,1.099,z-.107],[-3.963,1.097,z-.126]], .006, index ? rubber : primer);
  }
  // The route survives a dead dispatch terminal as a grease-pencil line on a folded chart.
  const chart = b.panel([-3.94, 1.09, 2.57], 0.65, 0.36, 0, (g) => {
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
    // The terminal plotted the dashed crossing. Oleg marked the open lead and a new flag line.
    g.setLineDash([10,6]); g.strokeStyle = "#696b61"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(189,214); g.lineTo(420,199); g.lineTo(528,143); g.stroke();
    g.setLineDash([]); g.fillStyle = "#657f86";
    g.beginPath(); g.moveTo(392,157); g.lineTo(447,217); g.lineTo(420,202); g.lineTo(390,171); g.fill();
    g.font = "italic 24px serif"; g.fillText("open lead / O.", 433,234);
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

function berths(b: Bay, blanket?: BufferGeometry) {
  for (const [i, deck] of [0.7, 1.42].entries()) {
    if (blanket) {
      b.shape(blanket.clone(), i ? "#d8ccac" : "#ffffff", [-2.76, deck + .045, .078], [0, 0, 0], "wool");
    } else {
      b.box([-2.66, deck, .38], [1.19, .076, .61], cloth(i ? "#7a7352" : "#84665b"), .03);
    }
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
  const coat = cloth("#a87444");
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
  // A reading pouch hangs from the upper rail. Two paperbacks and a pencil ride behind its lip.
  b.box([-3.38, 1.29, .715], [.29, .23, .047], cloth("#80664c"), .022);
  for (const dx of [-.10, .10]) b.box([-3.38 + dx, 1.397, .714], [.029, .13, .022], cloth("#c2a878"));
  b.box([-3.41, 1.376, .733], [.141, .14, .017], "#626f74", 0, [0,0,.09]);
  b.box([-3.30, 1.365, .735], [.072, .11, .013], "#bd935c", 0, [0,0,-.15]);
  b.box([-3.38, 1.275, .747], [.285, .137, .012], cloth("#907856"), .004);
}

function galley(b: Bay) {
  b.box([-0.93, 0.52, 3.17], [1.91, 0.88, 0.55], olive, 0.025);
  b.box([-0.93, 1.0, 3.13], [2.0, 0.075, 0.67], wood, 0.022);
  for (const x of [-1.58, -0.95, -0.32]) {
    b.box([x, 0.54, 2.88], [0.58, 0.73, 0.035], cream, 0.016);
    b.shape(new PlaneGeometry(.55, .68), "#ded6bc", [x, .54, 2.859], [0, Math.PI, 0], "panel");
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
  b.shape(new LatheGeometry([[.10,0],[.13,.008],[.146,.033],[.146,.184],[.151,.195],[.146,.207]]
    .map(([r,h]) => new Vector2(r,h)), 32), blue, [-.37,1.145,3.17]);
  b.can([-0.37, 1.36, 3.17], 0.15, 0.025, steel);
  b.soft([-0.37, 1.39, 3.17], [0.035, 0.025, 0.035], rubber);
  for (const x of [-0.56, -0.18]) b.box([x, 1.29, 3.17], [0.1, 0.031, 0.04], rubber, 0.012);
  for (const [i, x] of [-1.01, -0.81].entries()) {
    const cupWall = [[.034,0],[.042,.004],[.046,.094],[.048,.102],[.047,.106],
      [.043,.106],[.041,.099],[.037,.013],[.001,.012]];
    b.shape(new LatheGeometry(cupWall.map(([r,h]) => new Vector2(r,h)),24), i ? primer : cream, [x,1.04,2.99]);
    if (i) b.can([x,1.118,2.99],.041,.003,"#49362a");
    b.loop([x + 0.051, 1.105, 2.99], 0.032, 0.008, i ? primer : cream);
  }
  // The bread card belongs to an actual meal: a cut loaf and the heel saved for next watch.
  b.box([-1.04,1.05,3.23],[.39,.023,.23],wood,.009,[0,.075,0]);
  const loaf = new SphereGeometry(1,18,7,0,Math.PI*2,0,Math.PI/2);
  b.shape(loaf.scale(.117,.083,.079), "#a1754b", [-1.09,1.064,3.235], [0,.11,0]);
  for (const x of [-.92,-.898])
    b.soft([x,1.085,3.24],[.012,.026,.063],"#c49d71",[0,.09,-.23]);
  for (const x of [-1.46, -.91, -.36]) {
    b.box([x,1.979,3.321],[.53,.203,.256], olive,.014);
    b.shape(new PlaneGeometry(.503,.174),"#c5c3ac",[x,1.979,3.186],[0,Math.PI,0],"panel");
    for (let slot = -3; slot<=3; slot++) b.box([x+slot*.031,1.951,3.182],[.016,.048,.005], steel);
    b.box([x+.168,1.986,3.172],[.045,.014,.018], brass,.003);
  }
  b.box([-0.91, 1.62, 3.31], [1.88, 0.036, 0.31], wood);
  for (let i = 0; i < 11; i++) {
    const x = -1.72 + i * 0.15;
    b.can([x, 1.736, 3.3], .061, .182, steel);
    const label = new CylinderGeometry(.062, .062, .152, 20, 1, true);
    b.shape(label, "#ffffff", [x, 1.735, 3.3], [0, 2.7 + i * .62, 0], (i % 4) as 0 | 1 | 2 | 3);
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
  b.plate([-0.92, 1.33, 3.439], 0.55, 0.21, Math.PI, "PANTRY / 2 CREW", ["OATS  18 KG", "BEANS  11 KG"]);
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
  const towel = cloth("#b9a493");
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

/** A botanical vein pattern shared by all 216 leaves; silhouettes live in the mesh. */
function leafSkin() {
  const canvas = document.createElement("canvas");
  canvas.width = 96; canvas.height = 192;
  const g = canvas.getContext("2d")!;
  const lamina = g.createLinearGradient(0,0,96,0);
  lamina.addColorStop(0,"#a8b187"); lamina.addColorStop(.48,"#d1d5a1");
  lamina.addColorStop(.54,"#dedeb2"); lamina.addColorStop(1,"#a8ba91");
  g.fillStyle = lamina; g.fillRect(0,0,96,192);
  g.strokeStyle = "#dfe1a9"; g.lineWidth = 1.6;
  for (let y=36; y<180; y+=19) {
    for (const side of [-1,1]) {
      g.beginPath(); g.moveTo(48,y); g.quadraticCurveTo(48+side*21,y-5,48+side*42,y-22); g.stroke();
    }
  }
  g.fillStyle = "#e0d7a8"; g.beginPath(); g.moveTo(44,192);
  g.quadraticCurveTo(47,130,48,10); g.quadraticCurveTo(49,130,52,192); g.fill();
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
  return map;
}

function garden(b: Bay) {
  // The first grow light drained the battery. Salvaged foil now returns its light into the trays.
  for (const x of [.64, 1.50]) {
    b.shape(new PlaneGeometry(.855, 1.4), "#e1e1d2", [x,1.2,3.434], [0,Math.PI,0], "foil");
  }
  for (const x of [0.21, 1.92])
    for (const z of [2.87, 3.38]) {
      b.box([x, 0.98, z], [0.035, 1.89, 0.035], steel);
      b.box([x, 0.055, z], [0.12, 0.05, 0.12], brass);
    }
  b.box([1.1, 0.25, 3.13], [1.5, 0.34, 0.43], blue, 0.045);
  b.plate([1.08, 0.25, 2.902], 0.46, 0.16, Math.PI, "RETURN / 18 L", ["TOP UP AT DUSK"]);
  const leafy = ["#4b764e", "#6d975c", "#819f52", "#a4b86a", "#608e68"];
  // One tapered, veined blade shared by every plant. Instance colours and rotations vary by tray.
  const vertices: number[] = [], colours: number[] = [], indices: number[] = [], uvs: number[] = [];
  // A curved midrib and two darker edges give each instanced rosette a soft, cupped silhouette.
  for (let row = 0; row <= 7; row++) {
    const t = row / 7, width = .039 * Math.pow(Math.sin(Math.PI * t), .8) + .0008;
    for (const side of [-1, 0, 1]) {
      uvs.push((side + 1) / 2, t);
      vertices.push(side * width * (1+.07*Math.sin(row*2.3+side)), t - .035 * side * side * Math.sin(Math.PI*t), .28*t*t + (1-side*side)*.027*Math.sin(Math.PI*t));
      colours.push(...(side ? [.73,.84,.62] : [1,.99,.74]));
    }
    if (row) for (let col = 0; col < 2; col++) {
      const a = (row-1)*3 + col;
      indices.push(a,a+1,a+3,a+1,a+4,a+3);
    }
  }
  const leaf = new BufferGeometry();
  leaf.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  leaf.setAttribute("color", new BufferAttribute(new Float32Array(colours), 3));
  leaf.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  leaf.setIndex(indices);
  leaf.computeVertexNormals();
  const crop = new InstancedMesh(leaf, new MeshStandardMaterial({ map: leafSkin(), side: DoubleSide, vertexColors:true, roughness: .83 }), 216);
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
          const chard = tray !== 1;
          stem.rotation.set((chard ? .24 : .41) + n * .13, angle, .12 * Math.sin(angle), "YXZ");
          stem.scale.set((chard ? 1.18 : .75) + (n % 2) * .14, tall * (chard ? 1.4 : 1.05), .24);
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
  // One hanging fabric surface; the ring positions follow the peaks of the pleats.
  const curtain = new PlaneGeometry(1, 1, 48, 6);
  const cp = curtain.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const u = cp.getX(i)+.5, v = cp.getY(i)+.5, wave = Math.cos(u*16*Math.PI);
    cp.setXYZ(i, .034*wave + .013*Math.sin(v*5+u*8)*(1-v),
      1.41*v + .019*wave*(1-v), u*(.47 + .06*(1-v)));
  }
  curtain.computeVertexNormals();
  b.shape(curtain, cloth("#a19c77"), [3.045,.44,2.942]);
  for (let i=0; i<=8; i++) b.loop([3.071,1.869,2.942+.47*i/8],.035,.0045,steel);
  // Transit cradle for the two fuel cans recorded in watch.log. The meter rides above splash height.
  for (const z of [2.245, 2.475]) {
    b.box([3.966,.255,z], [.25,.39,.21], "#9b714a", .027);
    b.box([3.966,.46,z], [.14,.038,.14], rubber, .014);
    for (const dz of [-.05,.05]) b.box([3.836,.239,z+dz], [.012,.28,.018], brass, 0, [.23,0,0]);
    b.box([3.828,.29,z], [.014,.035,.214], cloth("#756448"));
  }
  b.box([4.034,.70,2.36], [.21,.17,.34], blue, .018);
  b.shape(new PlaneGeometry(.295,.13), "#d2b895", [3.923,.70,2.36], [0,-half,0], "panel");
  for (const z of [2.25,2.47]) b.box([3.914,.70,z],[.012,.17,.023], cloth("#91876a"));
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
  b.plate([4.075, 1.73, 1.65], .53, .155, -half, "SIX / OUTBOUND", ["2 FUEL CANS + METER"], primer, cream);
  b.box([4.05, 1.13, 2.98], [0.15, 0.26, 0.32], blue, 0.023);
  b.plate([3.969, 1.13, 2.98], 0.22, 0.13, -half, "SOAP", []);
}

export const builders = { wheelhouse, berths, galley, garden, service };
let materials: Promise<[MeshStandardMaterial, MeshStandardMaterial]> | undefined;
let cover: Promise<BufferGeometry | undefined> | undefined;
/** Four roughness/metalness pairs use the colour atlas UVs and stay in a single GPU batch. */
function surfaceMaterial(map: Texture | null, tiles: [number, number][]) {
  const data = Uint8Array.from(tiles.flatMap(([rough, metal]) => [255, rough, metal, 255]));
  const response = new DataTexture(data, 2, 2);
  response.needsUpdate = true;
  return new MeshStandardMaterial({
    map, roughness: 1, metalness: 1, roughnessMap: response, metalnessMap: response,
    vertexColors: true, side: DoubleSide,
  });
}
async function bayMaterials(atlas: Texture | null): Promise<[MeshStandardMaterial, MeshStandardMaterial]> {
  const small = matchMedia("(max-width: 640px) and (pointer: coarse)").matches;
  const map = await new TextureLoader().loadAsync(`/textures/${small ? "half/" : ""}cabin-trim.webp`).catch(() => null);
  if (map) {
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
  }
  // Bottom row first, matching the UV origin: birch/leather, enamel/canvas.
  const finish = surfaceMaterial(atlas, [[158, 0], [125, 0], [143, 40], [239, 0]]);
  // Paper/painted hardware, salvaged foil/wool.
  const trim = surfaceMaterial(map, [[213, 0], [141, 65], [117, 156], [248, 0]]);
  return [finish, trim];
}

export async function buildBay(name: keyof typeof builders, atlas: Texture | null) {
  materials ??= bayMaterials(atlas);
  if (name === "berths") {
    cover ??= new GLTFLoader().loadAsync("/models/watch-blanket.glb")
      .then(asset => (asset.scene.children[0] as Mesh<BufferGeometry>).geometry)
      .catch(() => undefined);
  }
  const bay = new Bay(...await materials);
  if (name === "berths") berths(bay, await cover);
  else builders[name](bay);
  bay.group.name = name;
  return bay.finish();
}
