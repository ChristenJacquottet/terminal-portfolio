// Metres, with the radio bench top at y=0. +x runs along the vehicle, +z into the aisle.
import {
  BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Path, PlaneGeometry, PointLight,
  RepeatWrapping, RingGeometry, Shape, ShapeGeometry, SRGBColorSpace, TorusGeometry,
  type Scene, type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const length = 8.5, width = 3.5, height = 2.1;
const ports = [-1.69, -0.76, 2.38];
const portY = 0.52, radius = 0.235;
const metal = (color: string, roughness = 0.65) => new MeshStandardMaterial({ color, roughness, metalness: 0.24 });

/** Repeatable enamel panel with folded edges, rivet heads and rubbed paint. */
function skin() {
  const c = document.createElement("canvas");
  c.width = 384; c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#819086"; g.fillRect(0, 0, 384, 512);
  let seed = 21;
  const rand = () => (seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 4294967296;
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = i % 2 ? "rgba(28,40,32,.09)" : "rgba(224,222,197,.12)";
    g.fillRect(rand() * 384, rand() * 512, rand() * 3 + 1, 1);
  }
  g.fillStyle = "#45564e"; g.fillRect(0, 0, 3, 512);
  g.fillStyle = "#9fa99b"; g.fillRect(3, 0, 2, 512);
  for (const x of [11, 372]) for (let y = 16; y < 512; y += 80) {
    g.fillStyle = "#5e6c61"; g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#b2b9aa"; g.fillRect(x - 1, y - 2, 2, 1);
  }
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / 0.62, 1 / 0.83);
  texture.anisotropy = 4;
  return texture;
}

/** Bolted sheets of salvaged anti-slip rubber in the aisle. */
function deckMat() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#555b50"; g.fillRect(0, 0, 128, 256);
  g.lineWidth = 2;
  for (let row = -1; row < 32; row++) {
    for (let col = -1; col < 16; col++) {
      const x = col * 10 + (row % 2) * 5, y = row * 9;
      const tilt = col % 2 ? -2 : 2;
      g.strokeStyle = "#41483f";
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + tilt); g.stroke();
      g.strokeStyle = "#64695c";
      g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 4, y + tilt + 1); g.stroke();
    }
  }
  for (const x of [5,123]) for (const y of [6,250]) {
    g.fillStyle="#878778"; g.beginPath(); g.arc(x,y,2,0,Math.PI*2); g.fill();
  }
  const map = new CanvasTexture(c); map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
  return new MeshStandardMaterial({ map, roughness: .94 });
}

/** A painted maker's plate. The radio log can also be read from the terminal. */
function radioPlate() {
  const c = document.createElement("canvas"); c.width = 896; c.height = 196;
  const g = c.getContext("2d")!;
  g.fillStyle = "#873d2a"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#e6d8af"; g.fillRect(22, 20, 6, 156);
  g.font = "bold 66px sans-serif"; g.fillText("ХАРЬКОВЧАНКА", 50, 89);
  g.font = "bold 39px monospace"; g.fillText("23  /  RADIO WATCH LOG", 52, 156);
  for (const x of [12, 882]) for (const y of [12, 183]) {
    g.fillStyle = "#a99881"; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  const map = new CanvasTexture(c); map.colorSpace = SRGBColorSpace; map.anisotropy = 8;
  const plate = new Group();
  plate.add(new Mesh(new PlaneGeometry(0.58, 0.127), new MeshStandardMaterial({ map, roughness: 0.61 })));
  plate.name = "watch-log";
  plate.userData.hotspot = { kind: "radioLog", nav: true, label: "No. 23 · radio watch", hint: "read the log" };
  return plate;
}

/** The salvage receiver on the porthole ledge. Its dial is legible in a close view. */
function receiver() {
  const set = new Group();
  const caseMat = metal("#424a44"), bakelite = metal("#292b27");
  set.add(new Mesh(new BoxGeometry(0.315, 0.137, 0.14), caseMat));
  const face = document.createElement("canvas"); face.width = 640; face.height = 232;
  const g = face.getContext("2d")!;
  g.fillStyle = "#52594d"; g.fillRect(0, 0, 640, 232);
  g.fillStyle = "#282e2a"; g.fillRect(20, 16, 352, 103);
  g.fillStyle = "#c4a775"; g.fillRect(26, 23, 340, 88);
  g.fillStyle = "#4c4738"; g.font = "19px monospace";
  for (let i = 0; i <= 40; i++) {
    const x = 35 + i * 8; g.fillRect(x, 32, 2, i % 5 ? 10 : 22);
    if (i % 5 === 0) g.fillText(String(4 + i / 5), x - 7, 84);
  }
  g.fillStyle = "#ad3b25"; g.fillRect(176, 24, 3, 83);
  g.fillStyle = "#242b27";
  for (let i = 0; i < 12; i++) g.fillRect(405, 22 + 9 * i, 215, 4);
  g.font = "bold 22px monospace"; g.fillStyle = "#d8d0b9"; g.fillText("КВ   /   RX–23", 228, 194);
  const map = new CanvasTexture(face); map.colorSpace = SRGBColorSpace; map.anisotropy = 8;
  const panel = new Mesh(new PlaneGeometry(.308,.127), new MeshStandardMaterial({ map, roughness: .69 }));
  panel.position.z = .071; set.add(panel);
  for (const x of [-.124, -.081, .12]) {
    const knob = new Mesh(new CylinderGeometry(.015,.016,.019,16), bakelite);
    knob.rotation.x = Math.PI / 2; knob.position.set(x, -.037, .076); set.add(knob);
  }
  set.name = "shortwave-receiver";
  set.userData.hotspot = { kind: "radioLog", nav: true, label: "shortwave receiver", hint: "read the last transmission" };
  return set;
}

export function buildCabin(scene: Scene, floorY: number, wallZ: number, polarView: Texture | null) {
  const shell = new Group();
  shell.name = "Kharkivchanka No. 23";
  shell.position.z = wallZ;
  scene.add(shell);
  const enamel = new MeshStandardMaterial({ map: skin(), roughness: 0.65, metalness: 0.18, shadowSide: DoubleSide });
  const steel = metal("#414e4c"), alloy = metal("#a9afa5", 0.42), vermilion = metal("#984d36"), canvas = metal("#6d634b");
  const panels = new Map<MeshStandardMaterial, BoxGeometry[]>();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: MeshStandardMaterial) => {
    const parts = panels.get(mat) ?? [];
    parts.push(new BoxGeometry(w, h, d).translate(x, y, z));
    panels.set(mat, parts);
  };
  const roof = floorY + height;
  const bulkhead = new Shape().moveTo(-length / 2, floorY).lineTo(length / 2, floorY)
    .lineTo(length / 2, roof).lineTo(-length / 2, roof).closePath();
  for (const x of ports) {
    const hole = new Path(); hole.absarc(x, portY, radius, 0, 2 * Math.PI, true);
    bulkhead.holes.push(hole);
  }
  shell.add(new Mesh(new ShapeGeometry(bulkhead, 48), enamel));
  const deck = metal("#48504b");
  box(length, 0.035, width, 0, floorY - 0.018, width / 2, deck);
  box(length, 0.04, width, 0, roof, width / 2, metal("#a9ac97"));
  box(0.06, height, width, length / 2, floorY + height / 2, width / 2, steel);
  // The original forward glazing spans the cab. Solid kick and header panels frame it.
  box(.06, 1.12, width, -length/2, floorY+.56, width/2, steel);
  box(.06, .16, width, -length/2, roof-.08, width/2, steel);
  for (const z of [.06, width-.06]) box(.06,.82,.12,-length/2,floorY+1.53,z,steel);

  box(length, height, 0.04, 0, floorY + height / 2, width, steel);
  box(length, 0.15, 0.014, 0, 0.035, 0.009, vermilion);
  box(length, 0.012, 0.016, 0, 0.13, 0.010, alloy);
  for (let x = -4; x <= 4; x += 0.8) {
    box(0.036, 0.056, width, x, roof - 0.045, width / 2, steel);
  }
  // Heating pipes along the shoulder of the hull, clear of the operator's shelf.
  for (const y of [1.07, 1.12]) {
    const pipe = new Mesh(new CylinderGeometry(0.014, 0.014, length, 12), alloy);
    pipe.rotation.z = Math.PI / 2; pipe.position.set(0, y, 0.045); shell.add(pipe);
  }
  for (let x = -3.8; x < 4.2; x += 0.64) box(0.024, 0.11, 0.067, x, 1.096, 0.025, steel);

  // A pair of canvas berths and rails at the end of the bench.
  const pillow = metal("#b1ad8a");
  for (const y of [-0.22, 0.50]) {
    box(1.73, 0.055, 0.66, -2.78, y, 0.38, steel);
    box(1.68, 0.092, 0.63, -2.78, y + 0.074, 0.38, canvas);
    box(0.37, 0.085, 0.44, -3.36, y + 0.148, 0.38, pillow);
    box(0.54, 0.027, 0.64, -2.29, y + 0.134, 0.38, vermilion);
  }
  for (const x of [-3.62,-1.94]) box(0.025, 1.42, 0.025, x, -0.05, 0.70, steel);
  const frame = new Group(); frame.name = "window";
  frame.userData.hotspot = { kind: "time", label: "the porthole" };
  shell.add(frame);
  const gasket = metal("#242b2b");
  const studs = new InstancedMesh(new CylinderGeometry(0.007, 0.007, 0.009, 6), alloy, ports.length * 12);
  const pose = new Object3D(); pose.rotation.x = Math.PI / 2;
  for (const [index, x] of ports.entries()) {
    const flange = new Mesh(new RingGeometry(radius - 0.007, radius + 0.035, 64), alloy);
    flange.position.set(x, portY, 0.011); frame.add(flange);
    const seal = new Mesh(new TorusGeometry(radius - 0.008, 0.014, 8, 64), gasket);
    seal.position.set(x, portY, 0.017); frame.add(seal);
    const glass = new Mesh(new CircleGeometry(radius, 64), new MeshBasicMaterial({ color: "#bae2e2", transparent: true, opacity: 0.07, depthWrite: false }));
    glass.position.set(x, portY, -0.006); frame.add(glass);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      pose.position.set(x + (radius + 0.019) * Math.cos(a), portY + (radius + 0.019) * Math.sin(a), 0.014);
      pose.updateMatrix(); studs.setMatrixAt(index * 12 + i, pose.matrix);
    }
  }
  frame.add(studs);
  const plate = radioPlate(); plate.position.set(-0.81, 0.88, 0.027); shell.add(plate);
  // A bolted ledge for the operator's keepsakes below the main porthole.
  box(0.86, 0.025, 0.19, -0.99, 0.188, 0.09, steel);
  const radio = receiver(); radio.position.set(-0.73, 0.269, 0.086); shell.add(radio);
  const shade = metal("#b9ad89");
  shade.emissive.set("#ffe4ae"); shade.emissiveIntensity = 0.9;
  box(0.28, 0.067, 0.056, -0.81, 0.998, 0.045, steel);
  box(0.255, 0.042, 0.049, -0.81, 0.998, 0.083, shade);
  for (let i = -2; i <= 2; i++) box(0.006, 0.056, 0.052, -0.81 + i * 0.051, 0.998, 0.084, steel);
  const watchLight = new PointLight("#ffe3ae", 0.56, 1.9, 1.45);
  watchLight.position.set(-0.81, 0.94, 0.23); shell.add(watchLight);
  // Ribbed deck plates down the passage, kick panels, cable trunk and guarded overhead lamps.
  const casePaint = metal("#78816c"), tread = deckMat(), lining = metal("#b6b39d");
  for (let i=0;i<13;i++) {
    const x=-3.9+i*.65;
    box(.633,.014,1.22,x,floorY+.008,1.78,tread);
    for (const z of [1.225,2.335]) box(.59,.003,.012,x,floorY+.017,z,alloy);
    box(.633,.89,.026,x,floorY+.46,3.466,casePaint);
    box(.633,.96,.022,x,floorY+1.48,3.468,lining);
    for (const y of [.16,1.84]) box(.051,.03,.038,x+.27,floorY+y,3.45,alloy);
  }
  box(8.43,.061,.064,0,floorY+1.96,3.40,steel);
  for (const x of [-3.1,-.9,1.1,3.3]) {
    box(.48,.065,.16,x,roof-.06,2.29,steel);
    box(.43,.036,.12,x,roof-.103,2.29,shade);
    for (const dx of [-.16,0,.16]) box(.012,.043,.134,x+dx,roof-.105,2.29,steel);
  }
  for (const [x, hue] of [[-2.35,"#ffdab1"],[2.14,"#eef1d1"]] as const) {
    const light = new PointLight(hue, 4.1, 5.5, 1.65);
    light.position.set(x,roof-.16,2.29); shell.add(light);
  }
  // Structural members share materials and stay fixed. Batch them without merging the hotspots.
  for (const [material, parts] of panels) {
    const mesh = new Mesh(mergeGeometries(parts), material);
    mesh.userData.deck = material === deck || material === tread;
    shell.add(mesh);
    for (const part of parts) part.dispose();
  }
  const landscape = new MeshBasicMaterial({ map: polarView, color: polarView ? "#ffffff" : "#a9c4d1", toneMapped: false });
  const view = new Mesh(new PlaneGeometry(7.2, 4.05), landscape);
  view.position.set(-0.46, 0.91, -1.2); shell.add(view);
  const windscreen = new Mesh(new PlaneGeometry(3.6,1.24),landscape);
  windscreen.rotation.y = Math.PI/2;
  windscreen.position.set(-4.32,floorY+1.55,1.75);
  shell.add(windscreen);
  const dusk = new Color(polarView ? "#ffffff" : "#a9c4d1"), night = new Color("#536e98");
  return {
    frame, view, x: ports[1], y: portY, radius,
    blend(k: number) { landscape.color.copy(dusk).lerp(night, k); },
  };
}
