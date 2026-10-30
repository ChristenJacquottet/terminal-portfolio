// Where each desk prop sits. The code places everything sensibly; src/layout.json overrides that
// per prop (position, rotation, uniform scale, hidden), and is written by the layout editor
// (`?edit`, see editor.ts). Visitors only ever get the committed file; the editor's unsaved
// changes live in this browser's localStorage until they're saved.
import type { Object3D } from "three";
import lockedJson from "./layout.json";

export type Pose = { p: [number, number, number]; r: [number, number, number]; s: number; hidden?: boolean };
export type Layout = Record<string, Pose>;

/** The committed layout (JSON infers number[] for the tuples). */
export const locked = lockedJson as unknown as Layout;

const KEY = "desk-layout-draft";
export const editing = new URLSearchParams(location.search).has("edit");

export function draft(): Layout {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Layout;
  } catch {
    return {};
  }
}

export function saveDraft(layout: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // private mode: the editor still works, it just won't survive a reload
  }
}

/** The committed layout, plus the editor's draft when editing. */
export function currentLayout(): Layout {
  return editing ? { ...locked, ...draft() } : locked;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function poseOf(o: Object3D): Pose {
  const pose: Pose = {
    p: [round(o.position.x), round(o.position.y), round(o.position.z)],
    r: [round(o.rotation.x), round(o.rotation.y), round(o.rotation.z)],
    s: round(o.scale.x),
  };
  if (!o.visible) pose.hidden = true;
  return pose;
}

export function applyPose(o: Object3D, pose: Pose | undefined) {
  if (!pose) return;
  o.position.set(...pose.p);
  o.rotation.set(...pose.r);
  o.scale.setScalar(pose.s);
  o.visible = !pose.hidden;
}
