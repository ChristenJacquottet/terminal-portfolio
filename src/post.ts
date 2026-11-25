// The desk's finishing pass: the scene drawn once into an HDR target, then ambient occlusion (things
// sit in their contact), a soft bloom on what glows, and the tone map and grade, in one composite.
// Desktop only (phones keep the plain path), and like everything else it runs only when a frame is
// drawn: the render-on-demand loop, the heartbeat, a click.
//
// The hard rule is the alpha. The canvas is a hole where the CRT glass is (the DOM terminal sits
// under it) and the glass writes premultiplied alpha with no blending. So:
//  - the scene target keeps alpha, and the composite writes it back untouched (clamped to 1);
//  - where alpha < 1 (the glass) the colour is passed through raw, the way the plain path left it:
//    no AO, no tone map, no sRGB curve;
//  - the bloom is keyed by alpha *above* 1, which only things that glow write: additive light
//    sprites (LEDs) push it there by themselves, and emissive surfaces (the bulb, the PVM) are
//    patched to (see `prepareGlow`). Every other additive material is made to leave alpha alone.
// `renderer.render(scene, camera)` to the screen is routed through here, so every existing caller
// (the frame loop, the heartbeat, close-up screenshots) gets the finished picture; renders into a
// target (the glass mask, the environment capture) stay plain.
import {
  AddEquation,
  CustomBlending,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NoBlending,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  SrcAlphaFactor,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  ZeroFactor,
  AdditiveBlending,
  CubeCamera,
  PMREMGenerator,
  WebGLCubeRenderTarget,
  type Object3D,
  type Vector3,
  type Camera,
  type TextureDataType,
  type Material,
  type PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from "three";

export type Post = {
  /** The finishing pass is on (false: unsupported, or switched off). */
  readonly enabled: boolean;
  /** The HDR scene target: bind it while compiling shaders, so they're built for where they draw. */
  readonly target: WebGLRenderTarget;
  /** Ambient-occlusion strength (0 = off), the bloom's, and the vignette's. */
  settings: { ao: number; aoRadius: number; bloom: number; vignette: number; saturation: number; warmth: number };
  setEnabled(on: boolean): void;
  /**
   * The scene's resolution as a fraction of the canvas (1 = full). desk.ts drops it while the
   * camera moves on high-DPI screens and puts it back for the frame the camera settles on, so the
   * picture at rest is unchanged; the composite upsamples into the full-size canvas.
   */
  setScale(scale: number): void;
};

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

/** A 4×4 ordered pattern: the AO's sample rotation repeats every 4 pixels, so a 4×4 blur averages it out exactly. */
const bayer = /* glsl */ `
  float bayer4(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    // 0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5
    vec4 r0 = vec4(0.0, 8.0, 2.0, 10.0), r1 = vec4(12.0, 4.0, 14.0, 6.0), r2 = vec4(3.0, 11.0, 1.0, 9.0), r3 = vec4(15.0, 7.0, 13.0, 5.0);
    vec4 row = q.y < 0.5 ? r0 : q.y < 1.5 ? r1 : q.y < 2.5 ? r2 : r3;
    float v = q.x < 0.5 ? row.x : q.x < 1.5 ? row.y : q.x < 2.5 ? row.z : row.w;
    return (v + 0.5) / 16.0;
  }`;

const AO_SAMPLES = 12;

function aoMaterial() {
  return new ShaderMaterial({
    defines: { SAMPLES: AO_SAMPLES },
    uniforms: {
      tDepth: { value: null },
      uProj: { value: null },
      uInvProj: { value: null },
      uTexel: { value: new Vector2() },
      uRadius: { value: 0.07 },
      uMaxPx: { value: 60 },
      uIntensity: { value: 2.0 },
    },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth;
      uniform mat4 uProj, uInvProj;
      uniform vec2 uTexel;
      uniform float uRadius, uMaxPx, uIntensity;
      varying vec2 vUv;
      ${bayer}
      vec3 viewPos(vec2 uv) {
        float d = texture2D(tDepth, uv).x;
        vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      void main() {
        float d = texture2D(tDepth, vUv).x;
        if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        vec3 P = viewPos(vUv);
        // The normal from the depth around it, taking the nearer side at an edge.
        vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0)), pl = viewPos(vUv - vec2(uTexel.x, 0.0));
        vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y)), pd = viewPos(vUv - vec2(0.0, uTexel.y));
        vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
        vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
        vec3 N = normalize(cross(dx, dy));
        if (dot(N, P) > 0.0) N = -N;
        // A disc of uRadius metres around the point, on screen, capped so close-ups stay cheap.
        vec2 rad = vec2(uProj[0][0], uProj[1][1]) * uRadius * 0.5 / -P.z;
        rad *= min(1.0, uMaxPx * uTexel.y / rad.y);
        float spin = bayer4(gl_FragCoord.xy) * 6.2831853;
        float occ = 0.0;
        float r2 = uRadius * uRadius;
        for (int i = 0; i < SAMPLES; i++) {
          float t = (float(i) + 0.5) / float(SAMPLES);
          float a = float(i) * 2.3999632 + spin;
          vec3 S = viewPos(vUv + vec2(cos(a), sin(a)) * t * rad);
          vec3 v = S - P;
          float vv = dot(v, v);
          float cosine = dot(v, N) * inversesqrt(vv + 1e-8);
          occ += max(0.0, cosine - 0.12) * max(0.0, 1.0 - vv / r2);
        }
        float ao = clamp(1.0 - uIntensity * occ / float(SAMPLES), 0.0, 1.0);
        gl_FragColor = vec4(ao, ao, ao, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

/** 4×4 depth-aware blur of the half-size AO (undoes the 4×4 rotation pattern, keeps edges). */
function aoBlurMaterial() {
  return new ShaderMaterial({
    uniforms: { tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new Vector2() }, uNear: { value: 0.05 }, uFar: { value: 30 } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tAO, tDepth;
      uniform vec2 uTexel;
      uniform float uNear, uFar;
      varying vec2 vUv;
      float linear(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
      void main() {
        float z = linear(texture2D(tDepth, vUv).x);
        float sum = 0.0, wsum = 0.0;
        for (int y = -2; y < 2; y++) {
          for (int x = -2; x < 2; x++) {
            vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * uTexel;
            float zs = linear(texture2D(tDepth, uv).x);
            float w = max(0.0, 1.0 - abs(zs - z) / (0.04 * z));
            sum += texture2D(tAO, uv).r * w;
            wsum += w;
          }
        }
        float ao = wsum > 0.0 ? sum / wsum : 1.0;
        gl_FragColor = vec4(ao, ao, ao, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

/** Dual-filter bloom: the first step keys the scene by alpha above 1 (what glows), then down and up. */
function bloomDownMaterial(prefilter: boolean) {
  return new ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new Vector2() } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uTexel;
      varying vec2 vUv;
      vec3 tap(vec2 uv) {
        vec4 c = texture2D(tSrc, uv);
        ${prefilter ? "return min(c.rgb, vec3(16.0)) * clamp(c.a - 1.0, 0.0, 1.0);" : "return c.rgb;"}
      }
      void main() {
        vec3 c = tap(vUv) * 4.0;
        c += tap(vUv + vec2(-1.0, -1.0) * uTexel);
        c += tap(vUv + vec2(1.0, -1.0) * uTexel);
        c += tap(vUv + vec2(-1.0, 1.0) * uTexel);
        c += tap(vUv + vec2(1.0, 1.0) * uTexel);
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

function bloomUpMaterial() {
  return new ShaderMaterial({
    uniforms: { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new Vector2() } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tLow, tHigh;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(tLow, vUv + vec2(-2.0, 0.0) * uTexel).rgb;
        c += texture2D(tLow, vUv + vec2(2.0, 0.0) * uTexel).rgb;
        c += texture2D(tLow, vUv + vec2(0.0, -2.0) * uTexel).rgb;
        c += texture2D(tLow, vUv + vec2(0.0, 2.0) * uTexel).rgb;
        c += texture2D(tLow, vUv + vec2(-1.0, -1.0) * uTexel).rgb * 2.0;
        c += texture2D(tLow, vUv + vec2(1.0, -1.0) * uTexel).rgb * 2.0;
        c += texture2D(tLow, vUv + vec2(-1.0, 1.0) * uTexel).rgb * 2.0;
        c += texture2D(tLow, vUv + vec2(1.0, 1.0) * uTexel).rgb * 2.0;
        gl_FragColor = vec4(c / 12.0 + texture2D(tHigh, vUv).rgb, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

/**
 * The composite: AO, bloom, the renderer's own tone map and exposure (so the blackout and the
 * dusk/night exposure still work), the sRGB curve, then a gentle grade and vignette. The glass
 * passes through raw, alpha untouched.
 */
function compositeMaterial() {
  return new ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tAO: { value: null },
      tBloom: { value: null },
      uAO: { value: 0.75 },
      uBloom: { value: 0.35 },
      uVignette: { value: 0.22 },
      uSaturation: { value: 1.06 },
      uWarmth: { value: 0.03 },
      uAspect: { value: 1 },
    },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene, tAO, tBloom;
      uniform float uAO, uBloom, uVignette, uSaturation, uWarmth, uAspect;
      varying vec2 vUv;
      void main() {
        vec4 scene = texture2D(tScene, vUv);
        float solid = smoothstep(0.97, 1.0, scene.a); // 0 on the glass
        float ao = texture2D(tAO, vUv).r;
        vec3 bloom = texture2D(tBloom, vUv).rgb * uBloom;
        gl_FragColor = vec4(scene.rgb * mix(1.0, ao, uAO * solid) + bloom, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        vec3 c = gl_FragColor.rgb;
        // Grade: a touch more colour, warm mids and shadows (never lifted: blacks stay rich).
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(mix(vec3(l), c, uSaturation), 0.0);
        c *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth * 1.4);
        // Vignette: the edges fall off softly, the way a lens and a lit room do.
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(p) * 1.2);
        // Dither so the dark gradients don't band.
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        c += (n - 0.5) / 255.0;
        vec3 glass = scene.rgb + bloom * 0.5;
        gl_FragColor = vec4(mix(glass, c, solid), min(scene.a, 1.0));
      }`,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

const target = (w: number, h: number, type: TextureDataType = HalfFloatType) =>
  new WebGLRenderTarget(w, h, { type, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });

/**
 * Additive materials that aren't lights (the hover rim) keep the alpha channel as it is; additive
 * light sprites (LEDs: unlit, not tone mapped) push it above 1 and so key the bloom; opaque
 * emissive surfaces add their glow to it. Run once the props are in, before the shaders compile.
 */
export function prepareGlow(scene: Scene, amount = 1) {
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patch(m, amount);
  });
}

const patched = new WeakSet<Material>();
function patch(m: Material, amount: number) {
  if (patched.has(m)) return;
  patched.add(m);
  if (m.blending === AdditiveBlending && m.toneMapped) {
    // Same colour blend as additive, but alpha stays what it was.
    m.blending = CustomBlending;
    m.blendEquation = AddEquation;
    m.blendSrc = SrcAlphaFactor;
    m.blendDst = OneFactor;
    m.blendEquationAlpha = AddEquation;
    m.blendSrcAlpha = ZeroFactor;
    m.blendDstAlpha = OneFactor;
    m.needsUpdate = true;
    return;
  }
  if (m.transparent) return;
  const std = m as MeshStandardMaterial;
  const basic = m as MeshBasicMaterial;
  const glowing = std.isMeshStandardMaterial ? std.emissive.getHex() !== 0 : basic.isMeshBasicMaterial && !basic.toneMapped && !basic.map;
  if (!glowing) return;
  const previous = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    previous.call(m, shader, renderer);
    const glow = std.isMeshStandardMaterial ? "totalEmissiveRadiance" : "diffuseColor.rgb";
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>\n gl_FragColor.a += ${amount.toFixed(3)} * dot(${glow}, vec3(0.2126, 0.7152, 0.0722));`,
    );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|glow`;
  m.needsUpdate = true;
}

/**
 * Holds every material to the art direction's bands now that the environment is the real room:
 * nothing but glass is mirror-shiny (plastics no glossier than 0.35, bare metal no glossier than
 * 0.3), and reflections tuned for the old dim studio environment (envMapIntensity of several) are
 * brought down so they don't glare. Materials driven by roughness maps, glass (transparent) and
 * light sources (emissive) are left as they are.
 */
export function settleMaterials(scene: Scene) {
  const seen = new Set<Material>();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as MeshStandardMaterial;
      if (seen.has(m) || !std.isMeshStandardMaterial) continue;
      seen.add(m);
      if (std.envMapIntensity > 2) std.envMapIntensity = 1.6;
      if (std.transparent || std.roughnessMap || std.emissive.getHex() !== 0) continue;
      const floor = std.metalness >= 0.5 ? 0.3 : 0.35;
      if (std.roughness < floor) std.roughness = floor;
    }
  });
}

/** Can this renderer draw into half-float targets (needed for the HDR scene and the bloom key)? */
export function postSupported(renderer: WebGLRenderer) {
  return renderer.capabilities.isWebGL2 !== false && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"));
}

export function createPost(renderer: WebGLRenderer, scene: Scene): Post {
  const raw = renderer.render.bind(renderer);
  const size = new Vector2();
  const dpr = renderer.getPixelRatio();
  // The scene target carries the anti-aliasing (the canvas has none of its own on this path).
  const sceneRT = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: dpr > 1.5 ? 2 : 4, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });
  sceneRT.depthTexture = new DepthTexture(1, 1);
  sceneRT.depthTexture.minFilter = sceneRT.depthTexture.magFilter = NearestFilter;
  const aoRT = target(1, 1, UnsignedByteType);
  const aoBlurRT = target(1, 1, UnsignedByteType);
  aoRT.texture.format = aoBlurRT.texture.format = RedFormat;
  const down = [target(1, 1), target(1, 1), target(1, 1), target(1, 1)]; // ½ ¼ ⅛ 1/16
  const up = [target(1, 1), target(1, 1), target(1, 1)]; // ½ ¼ ⅛

  const ao = aoMaterial();
  const aoBlur = aoBlurMaterial();
  const prefilter = bloomDownMaterial(true);
  const downMat = bloomDownMaterial(false);
  const upMat = bloomUpMaterial();
  const composite = compositeMaterial();
  const quad = new Mesh(new PlaneGeometry(2, 2), composite);
  quad.frustumCulled = false;
  const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let enabled = true;
  let scale = 1;
  const settings = { ao: 0.8, aoRadius: 0.09, bloom: 0.6, vignette: 0.22, saturation: 1.06, warmth: 0.03 };

  const pass = (material: ShaderMaterial, out: WebGLRenderTarget | null) => {
    quad.material = material;
    renderer.setRenderTarget(out);
    raw(quad as unknown as Scene, quadCam);
  };

  const resize = (w: number, h: number) => {
    sceneRT.setSize(w, h);
    const hw = Math.max(1, Math.ceil(w / 2)), hh = Math.max(1, Math.ceil(h / 2));
    aoRT.setSize(hw, hh);
    aoBlurRT.setSize(hw, hh);
    for (let i = 0; i < down.length; i++) down[i].setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
    for (let i = 0; i < up.length; i++) up[i].setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
  };

  const draw = (camera: Camera) => {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.round(size.x * scale)), h = Math.max(1, Math.round(size.y * scale));
    if (w !== sceneRT.width || h !== sceneRT.height) resize(w, h);
    renderer.setRenderTarget(sceneRT);
    raw(scene, camera);

    // Ambient occlusion, at half size, then blurred.
    const cam = camera as PerspectiveCamera;
    if (settings.ao > 0) {
      ao.uniforms.tDepth.value = sceneRT.depthTexture;
      ao.uniforms.uProj.value = cam.projectionMatrix;
      ao.uniforms.uInvProj.value = cam.projectionMatrixInverse;
      ao.uniforms.uTexel.value.set(1 / w, 1 / h);
      ao.uniforms.uRadius.value = settings.aoRadius;
      ao.uniforms.uMaxPx.value = 0.06 * w; // ~ a few percent of the window, whatever the zoom
      pass(ao, aoRT);
      aoBlur.uniforms.tAO.value = aoRT.texture;
      aoBlur.uniforms.tDepth.value = sceneRT.depthTexture;
      aoBlur.uniforms.uTexel.value.set(1 / aoRT.width, 1 / aoRT.height);
      aoBlur.uniforms.uNear.value = cam.near ?? 0.05;
      aoBlur.uniforms.uFar.value = cam.far ?? 30;
      pass(aoBlur, aoBlurRT);
    }

    // Bloom from what glows.
    if (settings.bloom > 0) {
      prefilter.uniforms.tSrc.value = sceneRT.texture;
      prefilter.uniforms.uTexel.value.set(0.5 / w, 0.5 / h);
      pass(prefilter, down[0]);
      for (let i = 1; i < down.length; i++) {
        downMat.uniforms.tSrc.value = down[i - 1].texture;
        downMat.uniforms.uTexel.value.set(0.5 / down[i - 1].width, 0.5 / down[i - 1].height);
        pass(downMat, down[i]);
      }
      let low = down[down.length - 1];
      for (let i = up.length - 1; i >= 0; i--) {
        upMat.uniforms.tLow.value = low.texture;
        upMat.uniforms.tHigh.value = down[i].texture;
        upMat.uniforms.uTexel.value.set(0.5 / low.width, 0.5 / low.height);
        pass(upMat, up[i]);
        low = up[i];
      }
    }

    const u = composite.uniforms;
    u.tScene.value = sceneRT.texture;
    u.tAO.value = aoBlurRT.texture;
    u.tBloom.value = up[0].texture;
    u.uAO.value = settings.ao;
    u.uBloom.value = settings.bloom / 4;
    u.uVignette.value = settings.vignette;
    u.uSaturation.value = settings.saturation;
    u.uWarmth.value = settings.warmth;
    u.uAspect.value = w / h;
    pass(composite, null);
  };

  renderer.render = (s, camera) => {
    if (enabled && s === scene && renderer.getRenderTarget() === null && !renderer.xr.isPresenting) draw(camera);
    else raw(s, camera);
  };

  return {
    target: sceneRT,
    get enabled() {
      return enabled;
    },
    settings,
    setEnabled(on) {
      enabled = on;
    },
    setScale(next) {
      scale = Math.min(1, Math.max(0.25, next));
    },
  };
}

/**
 * The room's own reflection and bounce light: the scene captured once from the middle of the desk
 * into a cube map and prefiltered (PMREM), instead of a generic studio environment. So the white
 * plastic, the glass and the coffee reflect this room, and the ambient light has its colours.
 * Captured after load and when the light changes (dusk/night, the lamp), never per frame.
 */
export function createRoomProbe(renderer: WebGLRenderer, scene: Scene, at: Vector3, size = 128) {
  const cubeRT = new WebGLCubeRenderTarget(size, { type: HalfFloatType, generateMipmaps: false });
  const camera = new CubeCamera(0.03, 20, cubeRT);
  camera.position.copy(at);
  camera.updateMatrixWorld(true);
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  return {
    /**
     * A black environment of the capture's exact size, so the shaders compile once with an
     * environment and never again when the real captures replace it (they reuse this target).
     */
    blank() {
      return pmrem.fromScene(new Scene(), 0, 0.1, 1, { size });
    },
    /** Captures the room as it's lit now; reuses `into` (a previous capture) when given. */
    capture(into: WebGLRenderTarget | null = null, hide: Object3D[] = []) {
      const shown = hide.map((o) => o.visible);
      for (const o of hide) o.visible = false;
      camera.update(renderer, scene);
      for (let i = 0; i < hide.length; i++) hide[i].visible = shown[i];
      return pmrem.fromCubemap(cubeRT.texture, into);
    },
  };
}
