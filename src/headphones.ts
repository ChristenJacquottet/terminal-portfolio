// A pair of studio headphones laid cushion-side down, with swivelling cups and a sprung band.
import {
  CanvasTexture, CatmullRomCurve3, CircleGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh,
  MeshStandardMaterial, Shape, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";

export function headphones() {
  const set = new Group();
  const rubber = new MeshStandardMaterial({ color: "#282528", roughness: 0.87 });
  const shell = new MeshStandardMaterial({ color: "#353e41", roughness: 0.46 });
  const metal = new MeshStandardMaterial({ color: "#aea799", metalness: 0.72, roughness: 0.34 });
  const badge = new MeshStandardMaterial({ color: "#ae7746", metalness: 0.48, roughness: 0.45 });

  // A perforated grille at close range, baked into one mipmapped texture for both cups.
  const grille = document.createElement("canvas");
  grille.width = grille.height = 128;
  const g = grille.getContext("2d")!;
  g.fillStyle = "#393936";
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 18; row++) {
    for (let col = 0; col < 17; col++) {
      const x = col * 8 + (row % 2) * 4, y = row * 7.5;
      if (Math.hypot(x - 64, y - 64) > 57 || Math.abs(y - 64) < 9) continue;
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.fillStyle = "#161719";
      g.fill();
    }
  }
  g.font = "bold 13px sans-serif";
  g.fillStyle = "#cfb998";
  g.textAlign = "center";
  g.fillText("STEREO", 64, 69);
  const map = new CanvasTexture(grille);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  const grilleMaterial = new MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.3 });

  // A flat padded band follows the crown, with two exposed spring wires at either end.
  const arc = new Shape();
  const start = 0.38, end = Math.PI - start;
  arc.absarc(0, 0, 0.086, start, end, false);
  arc.absarc(0, 0, 0.079, end, start, true);
  arc.closePath();
  const band = new Mesh(new ExtrudeGeometry(arc, {
    depth: 0.014, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 2, curveSegments: 24,
  }), rubber);
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.009;
  set.add(band);

  for (const side of [-1, 1]) {
    const cup = new Group();
    cup.position.set(side * 0.060, 0, 0.037);
    cup.rotation.y = side * 0.14;
    const cushion = new Mesh(new TorusGeometry(0.024, 0.008, 12, 48), rubber);
    cushion.rotation.x = Math.PI / 2;
    cushion.scale.y = 1.25;
    cushion.position.y = 0.008;
    const housing = new Mesh(new LatheGeometry([
      [0, 0.014], [0.029, 0.014], [0.032, 0.017], [0.032, 0.023],
      [0.029, 0.027], [0.022, 0.0305], [0.015, 0.032], [0, 0.032],
    ].map(([x, y]) => new Vector2(x, y)), 40), shell);
    housing.scale.z = 1.22;
    const inset = new Mesh(new CircleGeometry(0.0155, 40), grilleMaterial);
    inset.rotation.x = -Math.PI / 2;
    inset.position.y = 0.0323;
    const trim = new Mesh(new TorusGeometry(0.0156, 0.0007, 6, 36), badge);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.0323;
    cup.add(cushion, housing, inset, trim);
    set.add(cup);

    for (const rail of [-1, 1]) {
      // The yoke splits at the slider and meets the cup on opposite sides.
      const path = new CatmullRomCurve3([
        new Vector3(side * 0.076, 0.016 + rail * 0.004, -0.036),
        new Vector3(side * 0.083, 0.016 + rail * 0.004, -0.011),
        new Vector3(side * (0.062 + rail * 0.028), 0.021, 0.009),
        new Vector3(side * (0.060 + rail * 0.031), 0.020, 0.035),
      ]);
      set.add(new Mesh(new TubeGeometry(path, 18, 0.0019, 8), metal));
    }
  }
  return set;
}
