// Small helpers shared by the story features (globe, cameras, slate, breadboard, glasses, clock,
// coin). Not a feature itself (no default export), so features/index.ts skips it.
import type { Scene, WebGLRenderer } from "three";

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** A damped wobble: starts at 0, rings `freq` times over the run, dies away. */
export const wobble = (t: number, freq: number, decay: number) => Math.sin(t * Math.PI * 2 * freq) * Math.exp(-decay * t);
/** Where a spring settles after a kick: overshoots once, then rests (0 → 1). */
export const settle = (t: number) => 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 2 * 1.4);

/** The desk's canvas (the renderer's), found next to the CSS3D layer desk.ts puts in its host. */
export function deskCanvas(): HTMLCanvasElement | null {
  return document.querySelector(".desk-css")?.parentElement?.querySelector("canvas") ?? null;
}

// Where the pointer last was over the desk, so a label can be refreshed after a click changes it.
let lastPointer: { x: number; y: number } | null = null;
let tracking = false;
function track() {
  if (tracking) return;
  const canvas = deskCanvas();
  if (!canvas) return;
  tracking = true;
  canvas.addEventListener("pointermove", (e) => {
    if (e.isTrusted && e.pointerType !== "touch") lastPointer = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerleave", () => (lastPointer = null));
}

/** Re-asks the hover chip what's under the pointer (a click changed what it should say). */
export function refreshChip() {
  track();
  const canvas = deskCanvas();
  if (!canvas || !lastPointer) return;
  canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: lastPointer.x, clientY: lastPointer.y, pointerType: "mouse", bubbles: true }));
}

/**
 * The renderer, caught on the scene's next draw (features get the scene, not the renderer). Used
 * to take a photo: one extra render into an offscreen target.
 */
let caught: WebGLRenderer | null = null;
export function rendererOf(scene: Scene, request: () => void): Promise<WebGLRenderer> {
  track();
  if (caught) return Promise.resolve(caught);
  return new Promise((resolve) => {
    const before = scene.onBeforeRender;
    scene.onBeforeRender = function (renderer, ...rest) {
      caught = renderer;
      scene.onBeforeRender = before;
      before.call(this, renderer, ...rest);
      resolve(renderer);
    };
    request();
  });
}

/** Starts listening for the pointer as soon as the desk exists. */
export const watchPointer = track;
