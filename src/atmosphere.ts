// The air in the room: dust drifting in the low sun through the window, a faint shaft of it, and
// a little haze in the lamp's cone.
// Cheap: one Points draw and two cards, additive, never touching the canvas alpha (the CRT glass
// hole). Nothing animates on its own: the dust moves on whatever frame is drawn anyway (a move,
// the heartbeat), so it costs nothing at rest.
import {
  AddEquation,
  BufferGeometry,
  Color,
  CustomBlending,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  OneFactor,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  type SpotLight,
  ZeroFactor,
  type Scene,
} from "three";
import type { Room } from "./room";

/** Adds colour, leaves alpha alone (the glass hole stays exactly as the glass wrote it). */
const airBlend = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendEquationAlpha: AddEquation,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
  transparent: true,
  depthWrite: false,
  toneMapped: false,
} as const;

export type Atmosphere = {
  /** 0 dusk … 1 night: the sunbeam fades to a faint cool moonbeam. */
  blend(k: number): void;
  /** Hidden (the blackout, the environment capture). */
  object: Group;
};

export function createAtmosphere(scene: Scene, room: Room, lamp: SpotLight, pixelRatio: number): Atmosphere | null {
  let sun: DirectionalLight | null = null;
  scene.traverse((o) => {
    if ((o as DirectionalLight).isDirectionalLight && (o as DirectionalLight).castShadow) sun = o as DirectionalLight;
  });
  if (!sun) return null;
  const light = sun as DirectionalLight;
  light.updateMatrixWorld();
  const dir = light.target.position.clone().sub(light.position).normalize(); // into the room
  const group = new Group();
  group.name = "atmosphere";

  // ── dust: points scattered through the beam, from the window opening along the sun ──────
  const win = room.window;
  const count = 140;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  let s = 11;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const p = new Vector3();
  for (let i = 0; i < count; i++) {
    // Under the raised blinds the sun comes straight in; most of the dust is there.
    const y0 = win.y0 + 0.03, y1 = rand() < 0.9 ? win.y0 + (win.y1 - win.y0) * 0.5 : win.y1 - 0.06;
    p.set(win.x0 + 0.04 + rand() * (win.x1 - win.x0 - 0.08), y0 + rand() * (y1 - y0), room.wallZ);
    // Along the beam until it reaches the desk top, thinning out as it goes.
    const reach = Math.max(0.1, (p.y - 0.03) / Math.max(0.05, -dir.y));
    p.addScaledVector(dir, Math.pow(rand(), 1.4) * Math.min(reach, 1.2));
    pos.set([p.x, p.y, p.z], i * 3);
    seed.set([rand() * 6.283, rand() * 6.283, 0.5 + rand(), rand()], i * 4);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("seed", new Float32BufferAttribute(seed, 4));
  const dust = new ShaderMaterial({
    ...airBlend,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color("#ffcf96") },
      uStrength: { value: 1 },
      uScale: { value: pixelRatio },
      uDir: { value: dir },
    },
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float uTime, uScale;
      uniform vec3 uDir;
      varying float vGlint;
      void main() {
        float t = uTime * 0.12 * seed.z;
        // A slow wander and a slower sink; the motes stay in the beam.
        vec3 drift = vec3(sin(t + seed.x), sin(t * 0.7 + seed.y) * 0.6 - 0.25 * fract(uTime * 0.004 * seed.z + seed.w), cos(t * 0.8 + seed.x)) * 0.018;
        vec4 mv = modelViewMatrix * vec4(position + drift, 1.0);
        gl_Position = projectionMatrix * mv;
        // Motes flash as they turn their faces to the sun.
        vGlint = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 1.3 * seed.z + seed.y * 3.0), 6.0);
        gl_PointSize = clamp(uScale * (0.8 + seed.w) * 2.4 / -mv.z, 1.0, 4.0 * uScale);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vGlint;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, r);
        gl_FragColor = vec4(uColor * a * a * vGlint * uStrength * 0.6, 0.0);
      }`,
  });
  const motes = new Points(geo, dust);
  motes.frustumCulled = false;
  motes.raycast = () => {};
  // ── the shaft through the window, and the haze in the lamp's cone: soft cards along each beam ──
  const from = new Vector3((win.x0 + win.x1) / 2, win.y0 + (win.y1 - win.y0) * 0.27, room.wallZ - 0.05);
  const shaft = beamCard("#ffc58a");
  shaft.set(from, dir, Math.min(1.7, (from.y + 0.05) / Math.max(0.05, -dir.y)), (win.x1 - win.x0) * 0.62, (win.x1 - win.x0) * 0.84);
  const haze = beamCard("#ffb36b");
  group.add(shaft.mesh, haze.mesh, motes);
  scene.add(group);

  // Only while their light is on (the blackout puts every light out, the air with them; the lamp
  // switch takes its haze). The lamp's cone follows the lamp wherever its arm points.
  let base = { dust: 1, shaft: 0.05, haze: 0.022 };
  const bulb = new Vector3(), aim = new Vector3();
  motes.onBeforeRender = () => {
    const sunIn = light.intensity > 0.01 ? 1 : 0;
    dust.uniforms.uTime.value = performance.now() / 1000;
    dust.uniforms.uStrength.value = base.dust * sunIn;
    shaft.strength(base.shaft * sunIn);
    lamp.getWorldPosition(bulb);
    lamp.target.getWorldPosition(aim);
    const length = Math.min(0.9, bulb.distanceTo(aim));
    aim.sub(bulb).normalize();
    const spread = Math.tan(lamp.angle) * 0.75;
    haze.set(bulb.addScaledVector(aim, 0.02), aim, length, 0.05, 2 * length * spread);
    haze.strength(base.haze * Math.min(1, lamp.intensity / 14));
  };

  const duskDust = new Color("#ffcf96"), nightDust = new Color("#9db6ff");
  const duskShaft = new Color("#ffc58a"), nightShaft = new Color("#7f9be0");
  return {
    object: group,
    blend(k) {
      const e = k * k * (3 - 2 * k);
      dust.uniforms.uColor.value.copy(duskDust).lerp(nightDust, e);
      shaft.color.copy(duskShaft).lerp(nightShaft, e);
      // Haze shows against the dark: barely there at dusk, more at night when the lamp is the key.
      base = { dust: 1 - 0.8 * e, shaft: 0.05 - 0.035 * e, haze: 0.016 + 0.024 * e };
    },
  };
}

/** A soft additive card from `from` along `dir`, turned to face the camera around that axis. */
function beamCard(hex: string) {
  const material = new ShaderMaterial({
    ...airBlend,
    uniforms: {
      uColor: { value: new Color(hex) },
      uStrength: { value: 0 },
      uFrom: { value: new Vector3() },
      uDir: { value: new Vector3(0, -1, 0) },
      uLength: { value: 1 },
      uWidth: { value: new Vector2(0.1, 0.2) },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uFrom, uDir;
      uniform float uLength;
      uniform vec2 uWidth;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 along = uFrom + uDir * (uv.y * uLength);
        vec3 toCam = normalize(cameraPosition - along);
        vec3 side = normalize(cross(uDir, toCam));
        vec3 world = along + side * (uv.x - 0.5) * mix(uWidth.x, uWidth.y, uv.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float across = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float along = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.6);
        gl_FragColor = vec4(uColor * across * along * uStrength, 0.0);
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1, 1, 8).translate(0.5, 0.5, 0), material);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.renderOrder = 2;
  const u = material.uniforms;
  return {
    mesh,
    color: u.uColor.value as Color,
    set(from: Vector3, dir: Vector3, length: number, width0: number, width1: number) {
      (u.uFrom.value as Vector3).copy(from);
      (u.uDir.value as Vector3).copy(dir);
      u.uLength.value = length;
      (u.uWidth.value as Vector2).set(width0, width1);
    },
    strength(v: number) {
      u.uStrength.value = v;
    },
  };
}
