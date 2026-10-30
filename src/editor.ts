// The layout editor, for arranging the desk by hand: open the site with `?edit`.
// Click a prop (or pick it from the list), then move / rotate / scale it with the gizmo.
// Every change is kept as a draft in this browser; "save" writes src/layout.json through the dev
// server (vite.config.ts), and "copy" puts the same JSON on the clipboard to paste anywhere.
// Loaded only in edit mode, so visitors never download it.
import { Box3Helper, Box3, Raycaster, Vector2, Vector3, type Object3D, type PerspectiveCamera, type Scene } from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { applyPose, draft, locked, poseOf, saveDraft, type Layout, type Pose } from "./layout";

type Mode = "translate" | "rotate" | "scale";

export function startEditor(opts: {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  controls: OrbitControls;
  props: Map<string, Object3D>;
  request: () => void;
  sitDown: () => void;
  /** How far back the default wide shot is for this window, so a saved view scales to others. */
  wideDistance: () => number;
}) {
  const { scene, camera, canvas, controls, props, request } = opts;
  const host = canvas.parentElement!;
  const changes: Layout = draft();
  const home = new Map<string, Pose>([...props].map(([name, o]) => [name, o.userData.home as Pose]));

  // A free camera while arranging: orbit all the way round, pan, get close.
  const freeCamera = () => {
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = 1.65;
    controls.minDistance = 0.12;
    controls.maxDistance = 6;
    controls.enablePan = true;
  };
  freeCamera();
  window.addEventListener("resize", freeCamera);

  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(0.8);
  scene.add(gizmo.getHelper());
  const box = new Box3();
  const outline = new Box3Helper(box, "#7ee787");
  outline.visible = false;
  scene.add(outline);

  let selected: string | null = null;
  let lastScale = 1;

  // ── the panel ─────────────────────────────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.className = "editor";
  panel.innerHTML = `
    <p class="editor-title">layout editor <span data-count></span></p>
    <select data-pick><option value="">click a prop, or pick one…</option></select>
    <div class="editor-row" data-tools>
      <button data-mode="translate" title="G">move</button>
      <button data-mode="rotate" title="R">rotate</button>
      <button data-mode="scale" title="S">scale</button>
      <button data-act="hide" title="H">hide</button>
      <button data-act="reset" title="where the code puts it">reset</button>
      <button data-act="focus" title="F">focus</button>
    </div>
    <div class="editor-row editor-fields" data-fields>
      <label>x <input data-f="x" type="number" step="0.01"></label>
      <label>y <input data-f="y" type="number" step="0.01"></label>
      <label>z <input data-f="z" type="number" step="0.01"></label>
      <label>turn <input data-f="ry" type="number" step="5"></label>
      <label>size <input data-f="s" type="number" step="0.05" min="0.05"></label>
    </div>
    <div class="editor-row">
      <button data-act="save" class="editor-primary">save to layout.json</button>
      <button data-act="copy">copy json</button>
      <button data-act="discard">discard draft</button>
      <button data-act="view" title="the wide shot visitors land on">use this view</button>
      <button data-act="sit">sit down</button>
    </div>
    <p class="editor-status" data-status>G move · R rotate · S scale · H hide · F focus · shift snaps · esc deselects · right-drag pans</p>`;
  host.append(panel);
  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector(sel) as T;
  const pick = $<HTMLSelectElement>("[data-pick]");
  const status = $<HTMLParagraphElement>("[data-status]");
  for (const name of [...props.keys()].sort()) pick.add(new Option(name, name));
  const field = (f: string) => $<HTMLInputElement>(`[data-f="${f}"]`);

  const say = (text: string) => (status.textContent = text);
  const count = () => ($("[data-count]").textContent = Object.keys(changes).length ? `· ${Object.keys(changes).length} changed` : "");
  count();

  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  function refresh() {
    const o = selected ? props.get(selected) : null;
    pick.value = selected ?? "";
    panel.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => (b.dataset.on = String(b.dataset.mode === gizmo.mode)));
    $<HTMLButtonElement>('[data-act="hide"]').textContent = o && !o.visible ? "show" : "hide";
    $("[data-fields]").toggleAttribute("hidden", !o);
    if (o) {
      field("x").value = o.position.x.toFixed(3);
      field("y").value = o.position.y.toFixed(3);
      field("z").value = o.position.z.toFixed(3);
      field("ry").value = String(deg(o.rotation.y));
      field("s").value = o.scale.x.toFixed(2);
      box.setFromObject(o);
    }
    outline.visible = Boolean(o);
    request();
  }

  function select(name: string | null) {
    selected = name && props.has(name) ? name : null;
    const o = selected ? props.get(selected)! : null;
    if (o) gizmo.attach(o);
    else gizmo.detach();
    lastScale = o?.scale.x ?? 1;
    refresh();
  }

  function changed() {
    if (!selected) return;
    changes[selected] = poseOf(props.get(selected)!);
    saveDraft(changes);
    count();
    refresh();
  }

  function setMode(mode: Mode) {
    gizmo.setMode(mode);
    refresh();
  }

  // The wide shot, if you've picked one: direction, target, and distance relative to the default.
  let view = (locked as unknown as { view?: unknown }).view;
  function merged(): Layout {
    return { ...locked, ...changes, ...(view ? { view } : {}) } as Layout;
  }

  // ── gizmo ─────────────────────────────────────────────────────────────────────────────
  gizmo.addEventListener("change", () => {
    if (selected) box.setFromObject(props.get(selected)!);
    request();
  });
  gizmo.addEventListener("dragging-changed", (e) => {
    controls.enabled = !e.value;
    if (!e.value) changed();
  });
  gizmo.addEventListener("objectChange", () => {
    const o = selected ? props.get(selected) : null;
    if (!o || gizmo.mode !== "scale") return;
    // Scale stays uniform: follow whichever axis is being dragged.
    const axes = [o.scale.x, o.scale.y, o.scale.z];
    const next = axes.reduce((a, b) => (Math.abs(b - lastScale) > Math.abs(a - lastScale) ? b : a));
    o.scale.setScalar(Math.max(0.05, next));
  });
  gizmo.addEventListener("mouseUp", () => {
    const o = selected ? props.get(selected) : null;
    if (o) lastScale = o.scale.x;
  });

  // ── picking ───────────────────────────────────────────────────────────────────────────
  const ray = new Raycaster();
  const pointer = new Vector2();
  const owner = (o: Object3D | null): string | null => {
    for (let p = o; p; p = p.parent) if (p.name && props.get(p.name) === p) return p.name;
    return null;
  };
  const shown = (o: Object3D) => {
    for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    const click = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
    down = null;
    if (!click || gizmo.dragging || gizmo.axis) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...props.values()], true).find((h) => shown(h.object));
    select(owner(hit?.object ?? null));
  });

  // ── panel actions ─────────────────────────────────────────────────────────────────────
  pick.addEventListener("change", () => select(pick.value || null));
  panel.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as Mode)));
  panel.querySelectorAll<HTMLInputElement>("[data-f]").forEach((input) =>
    input.addEventListener("change", () => {
      const o = selected ? props.get(selected) : null;
      const v = Number(input.value);
      if (!o || !Number.isFinite(v)) return;
      const f = input.dataset.f;
      if (f === "x" || f === "y" || f === "z") o.position[f] = v;
      if (f === "ry") o.rotation.y = (v * Math.PI) / 180;
      if (f === "s") o.scale.setScalar(Math.max(0.05, v));
      lastScale = o.scale.x;
      changed();
    }),
  );

  const act: Record<string, () => void | Promise<void>> = {
    hide() {
      const o = selected ? props.get(selected) : null;
      if (!o) return;
      o.visible = !o.visible;
      changed();
    },
    focus() {
      // Look straight at the selection from close by, keeping the current viewing direction.
      const o = selected ? props.get(selected) : null;
      if (!o) return;
      const b = new Box3().setFromObject(o);
      const center = b.getCenter(new Vector3());
      const size = b.getSize(new Vector3()).length();
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, Math.max(0.25, size * 2.2));
      controls.update();
      request();
    },
    reset() {
      const o = selected ? props.get(selected) : null;
      if (!o || !selected) return;
      applyPose(o, home.get(selected));
      lastScale = o.scale.x;
      changed();
    },
    async save() {
      try {
        const res = await fetch("/__layout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(merged()) });
        if (!res.ok) throw new Error(await res.text());
        say(`saved ${Object.keys(merged()).length} props to src/layout.json. tell claude to lock it in.`);
      } catch {
        say("couldn't reach the dev server (save only works on `npm run dev`). use copy json instead.");
      }
    },
    async copy() {
      const json = JSON.stringify(merged(), null, 2);
      try {
        await navigator.clipboard.writeText(json);
        say("layout copied. paste it to claude to lock it in.");
      } catch {
        window.prompt("copy this layout:", json);
      }
    },
    discard() {
      if (!window.confirm("throw away every unsaved change and go back to src/layout.json?")) return;
      for (const name of Object.keys(changes)) {
        const o = props.get(name);
        if (o) applyPose(o, locked[name] ?? home.get(name));
        delete changes[name];
      }
      saveDraft(changes);
      count();
      select(selected);
      say("draft discarded.");
    },
    view() {
      const dir = camera.position.clone().sub(controls.target);
      const round = (v: number) => Math.round(v * 1000) / 1000;
      view = { dir: dir.clone().normalize().toArray().map(round), target: controls.target.toArray().map(round), k: round(dir.length() / opts.wideDistance()) };
      say("this is the wide shot now: save to layout.json (or copy json) to keep it.");
    },
    sit() {
      select(null);
      opts.sitDown();
    },
  };
  panel.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => b.addEventListener("click", () => void act[b.dataset.act!]()));

  window.addEventListener("keydown", (e) => {
    if (host.hidden || (e.target as HTMLElement).closest("input, select, textarea")) return;
    const key = e.key.toLowerCase();
    if (key === "shift") {
      gizmo.setTranslationSnap(0.01);
      gizmo.setRotationSnap(Math.PI / 12);
      gizmo.setScaleSnap(0.05);
    }
    if (key === "g" || key === "w") setMode("translate");
    if (key === "r" || key === "e") setMode("rotate");
    if (key === "s") setMode("scale");
    if (key === "h") act.hide();
    if (key === "f") act.focus();
    if (key === "escape") select(null);
  });
  window.addEventListener("keyup", (e) => {
    if (e.key !== "Shift") return;
    gizmo.setTranslationSnap(null);
    gizmo.setRotationSnap(null);
    gizmo.setScaleSnap(null);
  });

  refresh();
  say(`${props.size} props. click one to move it. G move · R rotate · S scale · H hide · shift snaps`);
}
