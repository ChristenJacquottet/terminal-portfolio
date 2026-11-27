// Dimensions in metres, with the tape and player lying label-side up.
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  SRGBColorSpace,
} from "three";

export type Volume = 1 | 2;
export const mixTitle = (volume: Volume) => `Awesome Mix Vol. ${volume}`;
export const BAY_Y = 0.006;
const REEL_X = 0.021;
const enamel = new MeshStandardMaterial({ color: "#356394", metalness: 0.42, roughness: 0.36 });
const silver = new MeshStandardMaterial({ color: "#c0c3c2", metalness: 0.68, roughness: 0.4 });
const rubber = new MeshStandardMaterial({ color: "#202023", roughness: 0.65 });
const ivory = new MeshStandardMaterial({ color: "#d1c8ad", roughness: 0.55 });

function box(parent: Group, mat: MeshStandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

function pin(parent: Group, mat: MeshStandardMaterial, r: number, h: number, x: number, y: number, z: number) {
  const mesh = new Mesh(new CylinderGeometry(r, r, h, 16), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

function decal(parent: Group, w: number, d: number, x: number, y: number, z: number, paint: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const g = canvas.getContext("2d")!;
  paint(g);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  const face = new Mesh(new PlaneGeometry(w, d), new MeshStandardMaterial({ map, roughness: 0.82 }));
  face.rotation.x = -Math.PI / 2;
  face.position.set(x, y, z);
  parent.add(face);
}

function plate(shape: Shape, height: number, mat: MeshStandardMaterial) {
  const mesh = new Mesh(new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 }), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function cassette(volume: Volume) {
  const tape = new Group();
  const shape = new Shape();
  const w = 0.05,
    d = 0.0315,
    r = 0.003;
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  for (const x of [-REEL_X, REEL_X]) {
    const hole = new Path();
    hole.absarc(x, 0, 0.008, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const hub = new Shape();
    hub.absarc(x, 0, 0.0079, 0, Math.PI * 2, false);
    const bore = new Path();
    bore.absarc(x, 0, 0.0043, 0, Math.PI * 2, true);
    hub.holes.push(bore);
    tape.add(plate(hub, 0.0085, ivory));
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      box(tape, rubber, 0.0017, 0.0005, 0.0017, x + Math.cos(a) * 0.006, 0.0086, Math.sin(a) * 0.006);
    }
  }
  tape.add(plate(shape, 0.009, rubber));
  for (const x of [-0.045, 0.045]) for (const z of [-0.026, 0.026]) pin(tape, silver, 0.0013, 0.0006, x, 0.0092, z);
  decal(tape, 0.086, 0.019, 0, 0.00915, -0.019, (g) => {
    g.fillStyle = "#ede4c5";
    g.fillRect(0, 0, 768, 160);
    g.fillStyle = volume === 1 ? "#ad392e" : "#246c85";
    for (let i = 0; i < 3; i++) g.fillRect(0, 127 + i * 11, 768, 6);
    g.save();
    g.transform(1, -0.014, -0.085, 1, 18, 0);
    g.fillStyle = "#232333";
    g.font = "italic bold 70px Georgia, serif";
    g.fillText(mixTitle(volume).toUpperCase(), 12, 93, 718);
    g.restore();
  });
  decal(tape, 0.077, 0.007, 0, 0.00915, 0.018, (g) => {
    g.fillStyle = "#d9cfae";
    g.fillRect(0, 0, 768, 160);
    g.fillStyle = "#342f2c";
    g.font = "bold 89px monospace";
    g.fillText("A   STEREO    C-60", 20, 115, 720);
  });
  tape.userData.volume = volume;
  tape.userData.hotspot = { kind: "mixtape", label: mixTitle(volume), hint: "load the Walkman" };
  return tape;
}

export function walkman() {
  const deck = new Group();
  box(deck, enamel, 0.132, 0.005, 0.085, 0, BAY_Y - 0.0025, 0);
  box(deck, rubber, 0.106, 0.001, 0.068, 0, BAY_Y - 0.0005, 0);
  for (const x of [-REEL_X, REEL_X]) pin(deck, silver, 0.0034, 0.007, x, BAY_Y + 0.0035, 0);
  for (const z of [-0.039, 0.039]) box(deck, z > 0 ? silver : enamel, 0.132, 0.014, 0.007, 0, 0.013, z);
  box(deck, enamel, 0.011, 0.014, 0.072, -0.06, 0.013, 0);
  box(deck, enamel, 0.012, 0.014, 0.072, 0.06, 0.013, 0);
  // Paired headphone sockets and the orange talk-through key share the end panel.
  const hotline = new MeshStandardMaterial({ color: "#ec9026", roughness: 0.48 });
  box(deck, hotline, 0.009, 0.004, 0.014, -0.06, 0.021, -0.02);
  for (const z of [0.003, 0.019]) {
    pin(deck, silver, 0.0041, 0.001, -0.06, 0.0205, z);
    pin(deck, rubber, 0.0026, 0.0006, -0.06, 0.021, z);
  }
  for (let i = 0; i < 4; i++) {
    const z = -0.025 + i * 0.015;
    box(deck, rubber, 0.006, 0.007, 0.013, 0.065, 0.012, z);
    box(deck, silver, 0.005, 0.006, 0.01, 0.068, 0.012, z);
  }
  const lid = new Group();
  lid.name = "walkman-lid";
  lid.position.set(0, 0.02, -0.035);
  // Solid enamel around a narrow window, wide enough to see both cassette hubs.
  for (const x of [-0.0435, 0.0435]) box(lid, enamel, 0.019, 0.003, 0.07, x, 0.0015, 0.035);
  box(lid, enamel, 0.068, 0.003, 0.016, 0, 0.0015, 0.008);
  box(lid, enamel, 0.068, 0.003, 0.026, 0, 0.0015, 0.057);
  box(lid, silver, 0.106, 0.0012, 0.013, 0, 0.0036, 0.0635);
  const glass = new MeshStandardMaterial({ color: "#a9b7bf", transparent: true, opacity: 0.23, depthWrite: false, roughness: 0.17 });
  box(lid, glass, 0.068, 0.001, 0.028, 0, 0.001, 0.030);
  for (const z of [0.016, 0.044]) box(lid, silver, 0.069, 0.0006, 0.0012, 0, 0.0031, z);
  for (const x of [-0.034, 0.034]) box(lid, silver, 0.0012, 0.0006, 0.028, x, 0.0031, 0.030);
  decal(lid, 0.102, 0.012, 0, 0.0043, 0.0635, (g) => {
    g.fillStyle = "#bcc0c4";
    g.fillRect(0, 0, 768, 160);
    g.fillStyle = "#243245";
    g.font = "bold 102px Georgia, serif";
    g.fillText("SONY", 22, 116);
    g.font = "bold 60px sans-serif";
    g.fillText("WALKMAN  TPS-L2", 338, 106, 410);
  });
  deck.add(lid);
  deck.userData.hotspot = { kind: "walkman", label: "Walkman", hint: "choose a mixtape" };
  return deck;
}
