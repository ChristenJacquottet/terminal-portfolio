// Lightweight TPS-L2-era open-back headphones, resting with their foam pads facing up.
import {
  BoxGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Group,
  LatheGeometry, Mesh, MeshStandardMaterial, RepeatWrapping, Shape, TubeGeometry, Vector2, Vector3,
} from "three";

export function headphones() {
  const set = new Group();
  const plastic = new MeshStandardMaterial({ color: "#242526", roughness: 0.54 });
  const chrome = new MeshStandardMaterial({ color: "#c4c7c3", metalness: 0.78, roughness: 0.32 });
  const cable = new MeshStandardMaterial({ color: "#222124", roughness: 0.85 });

  // One small repeatable bump map gives the soft foam pores without extra geometry.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const pixels = g.createImageData(64, 64);
  let seed = 7;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels.data.fill(seed >>> 24, i, i + 3);
    pixels.data[i + 3] = 255;
  }
  g.putImageData(pixels, 0, 0);
  const grain = new CanvasTexture(canvas);
  grain.wrapS = grain.wrapT = RepeatWrapping;
  grain.repeat.set(5, 2);
  const foam = new MeshStandardMaterial({ color: "#f48a26", roughness: 0.98, bumpMap: grain, bumpScale: 0.00028 });

  const band = new Shape();
  band.absarc(0, 0, 0.070, 0, Math.PI, false);
  band.absarc(0, 0, 0.0688, Math.PI, 0, true);
  band.closePath();
  const spring = new Mesh(new ExtrudeGeometry(band, { depth: 0.006, bevelEnabled: false, curveSegments: 32 }), chrome);
  spring.rotation.x = -Math.PI / 2;
  spring.position.y = 0.003;
  set.add(spring);

  const pad = new LatheGeometry([
    [0, 0.006], [0.018, 0.006], [0.021, 0.008], [0.022, 0.012],
    [0.021, 0.016], [0.018, 0.018], [0.011, 0.0185], [0.004, 0.0175], [0, 0.017],
  ].map(([x, y]) => new Vector2(x, y)), 48);
  const cord = (points: number[][], radius: number) => {
    const path = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
    set.add(new Mesh(new TubeGeometry(path, 32, radius, 6, false), cable));
  };
  for (const side of [-1, 1]) {
    const arm = new Mesh(new BoxGeometry(0.003, 0.005, 0.037), chrome);
    arm.position.set(side * 0.0694, 0.006, 0.018);
    const slider = new Mesh(new BoxGeometry(0.0065, 0.008, 0.014), plastic);
    slider.position.set(side * 0.0694, 0.0065, 0.009);
    const cup = new Group();
    cup.position.set(side * 0.060, 0.009, 0.043);
    cup.rotation.z = -side * 0.44;
    const housing = new Mesh(new CylinderGeometry(0.0205, 0.016, 0.006, 36), plastic);
    housing.position.y = 0.003;
    cup.add(housing, new Mesh(pad, foam));
    set.add(arm, slider, cup);
    cord([[side * 0.060, 0.009, 0.056], [side * 0.056, 0.0014, 0.071],
      [side * 0.038, 0.0013, 0.084], [-0.015, 0.0013, 0.083]], 0.00085);
  }
  cord([[-0.015, 0.0013, 0.083], [-0.044, 0.0014, 0.093], [-0.084, 0.0015, 0.091],
    [-0.094, 0.0015, 0.065], [-0.090, 0.0024, 0.048]], 0.0012);
  const plug = new Group();
  plug.position.set(-0.090, 0.003, 0.048);
  plug.rotation.x = -Math.PI / 2;
  const grip = new Mesh(new CylinderGeometry(0.003, 0.003, 0.013, 12), plastic);
  grip.position.y = 0.0065;
  const tip = new Mesh(new CylinderGeometry(0.00175, 0.00175, 0.012, 12), chrome);
  tip.position.y = 0.019;
  plug.add(grip, tip);
  set.add(plug);
  return set;
}
