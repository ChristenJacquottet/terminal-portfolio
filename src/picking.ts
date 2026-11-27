// Raycast the room as drawn. A surface with no action still hides whatever is behind it.
import { Vector2, Vector3, type PerspectiveCamera, type Intersection, type Mesh, type MeshStandardMaterial, type Object3D, type Raycaster, type Scene, type Texture } from "three";

const masks = new WeakMap<Texture, ImageData>();
const uv = new Vector2();
const inCamera = new Vector3();

function alphaAt(texture: Texture, point: Vector2) {
  let mask = masks.get(texture);
  if (!mask) {
    const image = texture.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement | undefined;
    if (!image?.width || !image.height) return 1;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    mask = context.getImageData(0, 0, canvas.width, canvas.height);
    masks.set(texture, mask);
  }
  texture.transformUv(uv.copy(point));
  const x = Math.min(mask.width - 1, Math.floor(uv.x * mask.width));
  const y = Math.min(mask.height - 1, Math.floor(uv.y * mask.height));
  return mask.data[(y * mask.width + x) * 4 + 3] / 255;
}

function visible(hit: Intersection) {
  for (let p: Object3D | null = hit.object; p; p = p.parent) {
    if (!p.visible || p.userData.ignorePick) return false;
  }
  const mesh = hit.object as Mesh;
  if (!mesh.isMesh) return Boolean(hit.object.userData.hotspot); // the window glass has a custom raycast
  const material = (Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material) as MeshStandardMaterial;
  if (!material?.visible || material.opacity === 0) return false;
  if (material.map && hit.uv && (material.transparent || material.alphaTest > 0)) {
    const alpha = material.opacity * alphaAt(material.map, hit.uv);
    return alpha > 0 && alpha >= material.alphaTest;
  }
  return true;
}

export function firstSurface(ray: Raycaster, scene: Scene) {
  const camera = ray.camera as PerspectiveCamera | null;
  return ray.intersectObjects(scene.children, true).find((hit) => {
    if (camera) {
      const depth = -inCamera.copy(hit.point).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth < camera.near || depth > camera.far) return false;
    }
    return visible(hit);
  });
}
