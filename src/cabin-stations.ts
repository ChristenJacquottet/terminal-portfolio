// Camera and sight-line bounds in metres from the port wall and the deck.
import { Box3, Frustum, Group, Matrix4, Vector3, type PerspectiveCamera, type Scene, type Texture } from "three";
import type { builders } from "./quarters";

type Station = keyof typeof builders;
type XYZ = [number, number, number];
type View = { label: string; eye: XYZ; at: XYZ; portrait?: { eye: XYZ; at: XYZ }; min: XYZ; max: XYZ };
export const stations: Record<Station, View> = {
  wheelhouse: {
    label: "Wheelhouse",
    eye: [-1.84, 1.57, 2.15],
    at: [-3.87, 1.02, 1.78],
    portrait: { eye: [-1.52, 1.58, 2.17], at: [-4.0, 1.12, 2.28] },
    min: [-4.25, 0, 0],
    max: [-2.68, 1.98, 3.46],
  },
  berths: {
    label: "Crew bunks",
    eye: [-1.89, 1.33, 2.27],
    at: [-2.85, 0.99, 0.37],
    min: [-3.73, 0, 0],
    max: [-1.91, 1.96, 0.88],
  },
  galley: {
    label: "Galley",
    eye: [-1.64, 1.53, 1.3],
    at: [-0.98, 1.06, 3.16],
    portrait: { eye: [-1.34, 1.55, 1.15], at: [-.64, 1.16, 3.18] },
    min: [-2.65, 0, 2.22],
    max: [0.08, 1.92, 3.5],
  },
  garden: {
    label: "Grow rack",
    eye: [0.48, 1.45, 1.16],
    at: [1.08, 1.04, 3.14],
    min: [0.12, 0, 2.83],
    max: [2.02, 2.04, 3.5],
  },
  service: {
    label: "Water & heat",
    eye: [1.72, 1.47, 1.85],
    at: [3.86, 1.0, 1.72],
    min: [2.53, 0, 0],
    max: [4.21, 1.98, 3.5],
  },
};
export type CabinStation = Station;

export function cabinStations(scene: Scene, floorY: number, wallZ: number, atlas: Texture | null, request: () => void) {
  const base = new Vector3(0, floorY, wallZ);
  const group = new Group();
  group.position.copy(base);
  scene.add(group);
  const names = Object.keys(stations) as Station[];
  const bounds = new Map(
    names.map((k) => [
      k,
      new Box3(new Vector3(...stations[k].min), new Vector3(...stations[k].max)).translate(base),
    ]),
  );
  const pending = new Map<Station, Promise<void>>();
  const retryAfter = new Map<Station, number>();
  const frustum = new Frustum(),
    projection = new Matrix4();
  function load(k: Station) {
    const cached = pending.get(k);
    if (cached) return cached;
    const job = import("./quarters")
      .then(async ({ buildBay }) => {
        group.add(await buildBay(k, atlas));
        retryAfter.delete(k);
        request();
      })
      .catch((err) => {
        pending.delete(k);
        retryAfter.set(k, performance.now() + 15_000);
        throw err;
      });
    pending.set(k, job);
    return job;
  }
  return {
    pose(k: Station) {
      const view = matchMedia("(orientation: portrait)").matches ? stations[k].portrait ?? stations[k] : stations[k];
      return {
        position: new Vector3(...view.eye).add(base),
        target: new Vector3(...view.at).add(base),
      };
    },
    load,
    visible(camera: PerspectiveCamera) {
      if (pending.size === names.length) return;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      const now = performance.now();
      for (const k of names)
        if (!pending.has(k) && now >= (retryAfter.get(k) ?? 0) && frustum.intersectsBox(bounds.get(k)!)) {
          void load(k).catch((err) => console.warn("Cabin bay could not load", err));
        }
    },
  };
}
