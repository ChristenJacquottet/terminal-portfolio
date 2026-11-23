// Reading glasses: click them and you put them on. They lift off the desk towards you and are
// gone; the room swims out of focus for a moment, then comes back sharp, with the faint dark rim
// of a lens around the edge for as long as you wear them. Click empty desk space, or press Escape,
// to take them off: they're back on the desk.
import { Raycaster, Vector2, Vector3, type Object3D } from "three";
import type { DeskApi, Feature } from "./types";
import { deskCanvas, easeInOut } from "./story-kit";
import { photoOpen } from "./story-camera";

let wearing = false;
let busy = false;
let desk: DeskApi | null = null;
let glasses: Object3D | null = null;
let home: { position: Vector3; scale: Vector3 } | null = null;
let rim: HTMLDivElement | null = null;
let since = 0;

/** Only the canvas: a filter on the CSS3D layer would flatten the screen's 3D transform. */
function layers(): HTMLElement[] {
  const canvas = deskCanvas();
  return canvas ? [canvas] : [];
}

function lens(): HTMLDivElement | null {
  if (rim) return rim;
  const canvas = deskCanvas();
  if (!canvas) return null;
  rim = document.createElement("div");
  rim.className = "story-lens";
  rim.setAttribute("aria-hidden", "true");
  Object.assign(rim.style, {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 600ms ease",
    // a lens's rim: darker at the corners, a faint warm edge, the middle untouched
    background:
      "radial-gradient(ellipse 74% 80% at 50% 50%, rgba(0,0,0,0) 55%, rgba(24,14,6,0.32) 80%, rgba(8,5,2,0.72) 100%)",
  } satisfies Partial<CSSStyleDeclaration>);
  canvas.after(rim);
  return rim;
}

/** The room out of focus, then sharp again (CSS on the desk's layers: cheap, and undone in full). */
function focusPull(on: boolean) {
  const els = layers();
  const blur = on ? 7 : 5;
  for (const el of els) {
    el.style.transition = "none";
    el.style.filter = `blur(${blur}px)${on ? " brightness(1.04)" : ""}`;
  }
  // next frame: settle back to sharp (with a hint of extra contrast while they're on)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const el of els) {
        el.style.transition = `filter ${on ? 900 : 650}ms cubic-bezier(.3,.7,.2,1)`;
        el.style.filter = on ? "blur(0px) contrast(1.04) saturate(1.05)" : "blur(0px)";
      }
      window.setTimeout(() => {
        if (!on) for (const el of els) el.style.filter = el.style.transition = "";
      }, 700);
    }),
  );
  const r = lens();
  if (r) r.style.opacity = on ? "1" : "0";
}

async function putOn(object: Object3D, camera: DeskApi["camera"], animate: DeskApi["animate"]) {
  if (wearing || busy) return;
  busy = true;
  glasses = object;
  home = { position: object.position.clone(), scale: object.scale.clone() };
  // up off the desk and towards your face
  const parent = object.parent!;
  const to = parent.worldToLocal(camera.getWorldPosition(new Vector3()).add(camera.getWorldDirection(new Vector3()).multiplyScalar(0.12)).add(new Vector3(0, -0.04, 0)));
  const from = object.position.clone();
  const s0 = object.scale.clone();
  const r0 = object.rotation.x;
  desk?.sound?.play("glasses", { volume: 0.8 });
  await animate(520, (t) => {
    const e = easeInOut(t);
    object.position.lerpVectors(from, to, e);
    object.position.y += 0.05 * Math.sin(t * Math.PI);
    object.rotation.x = r0 - 0.5 * e;
    object.scale.copy(s0).multiplyScalar(1 + 0.4 * e);
  });
  object.visible = false;
  object.position.copy(from);
  object.scale.copy(s0);
  object.rotation.x = r0;
  wearing = true;
  since = performance.now();
  focusPull(true);
  desk?.relight();
  busy = false;
}

async function takeOff() {
  const d = desk;
  if (!wearing || busy || !glasses || !home || !d) return;
  busy = true;
  wearing = false;
  focusPull(false);
  d.sound?.play("glasses", { volume: 0.6 });
  const g = glasses;
  const h = home;
  // back down onto the desk where they were, from a little above
  g.visible = true;
  await d.animate(420, (t) => {
    const e = easeInOut(t);
    g.position.copy(h.position);
    g.position.y += 0.06 * (1 - e);
    g.rotation.z = 0.08 * (1 - e);
  });
  g.position.copy(h.position);
  g.rotation.z = 0;
  d.relight();
  busy = false;
}

/** A click on nothing (no prop under it) takes them off; so does Escape. */
function listen(d: DeskApi) {
  const canvas = deskCanvas();
  if (!canvas) return;
  const ray = new Raycaster();
  const p = new Vector2();
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    const was = down;
    down = null;
    if (!wearing || busy || !was || Math.hypot(e.clientX - was.x, e.clientY - was.y) > 6 || performance.now() - since < 400) return;
    if (d.seated() || photoOpen()) return;
    const r = canvas.getBoundingClientRect();
    p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, d.camera);
    const hit = ray.intersectObjects([...d.props.values()], true).find((h) => {
      for (let o: Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
    if (!hit) void takeOff();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wearing && !photoOpen()) void takeOff();
  });
}

const spectacles: Feature = {
  name: "story-spectacles",
  hotspots: { spectacles: { kind: "spectacles", label: "reading glasses", hint: "put them on" } },
  onDesk(d) {
    desk = d;
    listen(d);
  },
  actions: {
    async spectacles({ object, camera, animate, once, leave }) {
      leave();
      await once(object, () => putOn(object, camera, animate));
    },
  },
};

export default spectacles;
