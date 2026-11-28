// The visitor steps onto the ice. The cabin keeps its camera and shares its WebGL renderer.
import {
  Box3, CanvasTexture, Color, DirectionalLight, EquirectangularReflectionMapping, Float32BufferAttribute, Fog, Group,
  HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  PlaneGeometry, RepeatWrapping, Scene, SRGBColorSpace, Texture, Vector3,
  type Material, type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const hullLength = 8.5;
const viewpoint = new Vector3(-.77, .32, 1).normalize();

function canvasMap(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// Stretch the sky and foreground to the poles and mirror the distant ridge at the rear seam.
function polarSky(image: HTMLImageElement) {
  const sky = canvasMap(1536, 512, g => {
    const band = 136, top = 256 - band/2;
    const w = image.naturalWidth, h = image.naturalHeight;
    for (let side = 0; side < 2; side++) {
      g.save();
      if (side) { g.translate(1536,0); g.scale(-1,1); }
      g.drawImage(image, 0,0,w,2, 0,0,768,top);
      g.drawImage(image, 0,top,768,band);
      g.drawImage(image, 0,h-2,w,2, 0,top+band,768,512-top-band);
      // There is one relay hut on the traverse. Use the adjacent snow for the reverse view.
      if (side) g.drawImage(image,w*.44,h*.56,w*.06,h*.11,768*.38,top+band*.56,768*.06,band*.11);
      g.restore();
    }
  });
  sky.mapping = EquirectangularReflectionMapping;
  return sky;
}

function snowfield(scene: Scene, night: boolean) {
  const snow = canvasMap(256, 256, g => {
    g.fillStyle = "#e1e7ec";
    g.fillRect(0, 0, 256, 256);
    let seed = 23;
    const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
    for (let i = 0; i < 3400; i++) {
      const x = random()*256, y = random()*256;
      g.fillStyle = i % 2 ? "rgba(114,138,160,.14)" : "rgba(255,255,255,.55)";
      g.fillRect(x, y, 1 + 12*random(), .6 + random());
    }
  });
  snow.wrapS = snow.wrapT = RepeatWrapping;
  snow.repeat.set(24, 24);
  const field = new PlaneGeometry(72, 72, 32, 32);
  const pos = field.attributes.position;
  const rgba: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const distance = Math.hypot(pos.getX(i), pos.getY(i));
    const t = Math.min(1, Math.max(0, (distance-9)/25));
    rgba.push(1, 1, 1, 1 - t*t*(3-2*t));
  }
  field.setAttribute("color", new Float32BufferAttribute(rgba,4));
  const ground = new Mesh(field, new MeshStandardMaterial({
    map: snow, color: night ? "#8295ac" : "#cad8e7", roughness: .94, vertexColors:true, transparent:true, depthWrite:false,
  }));
  ground.renderOrder = -2;
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);

  // A shallow, wind-softened tread trail fades out behind the stationary crawler.
  const trail = canvasMap(768, 64, g => {
    const fade = g.createLinearGradient(0,0,768,0);
    fade.addColorStop(0,"rgba(57,74,92,.34)");
    fade.addColorStop(1,"rgba(86,107,124,0)");
    g.fillStyle = fade; g.fillRect(0,4,768,56);
    g.globalCompositeOperation = "destination-out";
    for (let x = -16; x < 768; x += 9) {
      g.fillStyle = "rgba(0,0,0,.46)";
      g.beginPath(); g.moveTo(x,4); g.lineTo(x+7,32); g.lineTo(x,60);
      g.lineTo(x+3,60); g.lineTo(x+10,32); g.lineTo(x+3,4); g.fill();
    }
  });
  const trailMat = new MeshBasicMaterial({ map: trail, transparent: true, depthWrite: false });
  for (const side of [-1,1]) {
    const rut = new Mesh(new PlaneGeometry(17, .69), trailMat);
    rut.rotation.x = -Math.PI/2;
    rut.position.set(10.65,.009,side*1.54);
    scene.add(rut);
  }
  const shade = canvasMap(128,128,g => {
    const fade = g.createRadialGradient(64,64,10,64,64,64);
    fade.addColorStop(0,"rgba(31,42,55,.85)"); fade.addColorStop(.70,"rgba(40,53,64,.57)");
    fade.addColorStop(1,"rgba(40,53,64,0)"); g.fillStyle=fade; g.fillRect(0,0,128,128);
  });
  const contact = new Mesh(new PlaneGeometry(11,5.1), new MeshBasicMaterial({map:shade, transparent:true, depthWrite:false}));
  contact.rotation.x = -Math.PI/2; contact.position.y = .017;
  scene.add(contact);
  return ground.material;
}

// The original export splits its paint, raw steel and tyres on one shared surface.
// A small repeatable deposit of dry snow leaves the blade edges readable on a snow floor.
function addTrackDust(hull: Group) {
  hull.traverse(part => {
    if (!(part instanceof Mesh) || !(part.material instanceof MeshStandardMaterial)) return;
    part.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
        varying vec2 vTrackRoom;`).replace("#include <project_vertex>", `#include <project_vertex>
        vTrackRoom = (modelMatrix * vec4(transformed, 1.0)).xy;`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
        varying vec2 vTrackRoom;`).replace("#include <map_fragment>", `#include <map_fragment>
        float skirt = 1.0 - smoothstep(0.29, 1.19, vTrackRoom.y);
        float dust = skirt * (0.34 + 0.035 * sin(2.3 * vTrackRoom.x) + 0.02 * cos(7.7*vTrackRoom.x));
        vec3 powderedSurface = vec3(0.139, 0.147, 0.152);
        diffuseColor.rgb = mix(diffuseColor.rgb, powderedSurface, dust);`).replace("#include <metalness_fragment>", `#include <metalness_fragment>
        metalnessFactor *= (1.0 - dust);`);
    };
  });
}

function release(root: Scene | Group, shared: Texture | null) {
  const textures = new Set<Texture>(), materials = new Set<Material>();
  root.traverse(o => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture && value !== shared) textures.add(value);
    material.dispose();
  }
  textures.forEach(t => t.dispose());
}

export function crawlerExterior(renderer: WebGLRenderer, horizon: Texture | null, request: () => void, restoreFocus: () => void) {
  const dialog = document.createElement("dialog");
  dialog.className = "crawler-exterior";
  dialog.setAttribute("aria-label", "Kharkovchanka exterior");
  dialog.innerHTML = `<div class="crawler-orbit" tabindex="0" aria-label="Rotate the exterior using the arrow keys, or drag. Use plus or minus to zoom."></div>
    <p class="crawler-credit"><a href="https://sketchfab.com/3d-models/kharkovchanka-dc183abfd28048f5839d1edb43f660e3" target="_blank" rel="noreferrer">Kharkovchanka by Snupp</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
    <div class="crawler-bar"><span role="status"></span><button type="button" hidden>Retry</button><button type="button">Back inside</button></div>`;
  document.body.append(dialog);
  const surface = dialog.querySelector<HTMLElement>(".crawler-orbit")!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  const [retry, back] = dialog.querySelectorAll("button");
  const camera = new PerspectiveCamera(38, 1, .1, 240);
  let controls: OrbitControls | undefined, world: Scene | undefined;
  let snowMaterial: MeshStandardMaterial | undefined;
  let oldAspect = 0;
  let session = 0;

  function fit() {
    if (!controls) return;
    const aspect = renderer.domElement.clientWidth / Math.max(1,renderer.domElement.clientHeight);
    if (aspect === oldAspect) return;
    // Preserve orbit and zoom across rotations, adjusting for the narrower viewing dimension.
    const distanceScale = (a: number) => 1/Math.min(1,a/1.29);
    const offset = camera.position.clone().sub(controls.target);
    offset.multiplyScalar(oldAspect ? distanceScale(aspect)/distanceScale(oldAspect) : distanceScale(aspect));
    camera.position.copy(controls.target).add(offset);
    camera.aspect = oldAspect = aspect;
    camera.updateProjectionMatrix();
    controls.update();
  }

  async function load() {
    const id = ++session;
    const scene = world;
    if (!scene) return;
    status.textContent = "Loading exterior…";
    retry.hidden = true;
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const [crawler, modeledKit] = await Promise.allSettled([
        loader.loadAsync("/models/kharkovchanka.glb"),
        loader.loadAsync("/models/field-kit.glb"),
      ]);
      const obsolete = !dialog.open || id !== session;
      if (obsolete || crawler.status === 'rejected') {
        for (const part of [crawler, modeledKit]) {
          if (part.status === 'fulfilled') release(part.value.scene, null);
        }
        if (!obsolete) throw new Error("Exterior mesh unavailable");
        return;
      }
      const hull = crawler.value.scene;
      hull.rotation.y = -Math.PI/2; // Forward glazing faces the cabin's negative X end.
      const box = new Box3().setFromObject(hull, true);
      hull.scale.setScalar(hullLength/(box.max.x-box.min.x));
      box.setFromObject(hull, true);
      const center = box.getCenter(new Vector3());
      hull.position.set(-center.x,-box.min.y,-center.z);
      addTrackDust(hull);
      scene.add(hull);
      if (modeledKit.status === 'fulfilled') {
        const kit = modeledKit.value.scene;
        const packed = kit.getObjectByName("Packed_track");
        if (packed instanceof Mesh && packed.material instanceof MeshStandardMaterial && snowMaterial) {
          packed.material.color.copy(snowMaterial.color);
          packed.material.map = snowMaterial.map;
        }
        scene.add(kit);
      }
      status.textContent = "Drag to orbit · scroll or pinch to zoom";
      request();
    } catch {
      if (!dialog.open || id !== session) return;
      status.textContent = "The exterior could not load.";
      retry.hidden = false;
    }
  }

  function close() {
    if (!dialog.open) return;
    session++;
    dialog.close();
    controls?.dispose();
    controls = undefined;
    if (world) {
      release(world, horizon);
      world.environment?.dispose();
    }
    world = undefined;
    snowMaterial = undefined;
    restoreFocus();
    request();
  }
  back.onclick = close;
  retry.onclick = () => void load();
  dialog.addEventListener("cancel", e => { e.preventDefault(); close(); });
  dialog.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (!controls || e.target !== surface) return;
    const delta = camera.position.clone().sub(controls.target);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") delta.applyAxisAngle(camera.up, e.key === "ArrowLeft" ? -.15 : .15);
    else if (["+", "=", "-", "ArrowUp", "ArrowDown"].includes(e.key)) {
      delta.multiplyScalar(["+", "=", "ArrowUp"].includes(e.key) ? .88 : 1/.88);
      delta.clampLength(controls.minDistance, controls.maxDistance);
    } else return;
    e.preventDefault(); camera.position.copy(controls.target).add(delta); controls.update();
  });

  return {
    get active() { return dialog.open; },
    open(night: boolean) {
      if (dialog.open) return;
      world = new Scene();
      const air = new Color(night ? "#434f68" : "#a5b1c0");
      world.background = air;
      world.fog = new Fog(air, 14, 83);
      if (horizon?.image instanceof HTMLImageElement) {
        const sky = polarSky(horizon.image);
        world.background = sky;
        world.environment = sky;
        world.backgroundIntensity = night ? .42 : 1;
        world.environmentIntensity = night ? .55 : 1.22;
      }
      world.add(new HemisphereLight(night ? "#adc3e2" : "#e6efff", "#a5b2c3", night ? 1.1 : 1.85));
      const sun = new DirectionalLight(night ? "#c2d5ff" : "#ffe0c4", night ? 1.1 : 2.65);
      sun.position.set(-5,6,3); world.add(sun);
      snowMaterial = snowfield(world, night);
      dialog.showModal();
      surface.focus({preventScroll:true});
      controls = new OrbitControls(camera,surface);
      controls.enablePan = false;
      controls.minDistance = 6; controls.maxDistance = 46;
      controls.maxPolarAngle = Math.PI*.487;
      controls.target.set(0,1.7,0);
      camera.position.copy(viewpoint).multiplyScalar(12.3).add(controls.target);
      oldAspect = 0; fit();
      controls.addEventListener("change", request);
      void load();
      request();
    },
    draw() { if (world) { fit(); renderer.render(world,camera); } },
  };
}
