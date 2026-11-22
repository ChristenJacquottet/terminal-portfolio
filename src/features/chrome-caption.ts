// The caption strip under the scene, c-na.dev style: as the head turns it names what the view is
// centred on, the thing on the left and a count or a state on the right ("Floppy box · 6 disks",
// "The window · 2 AM"). A close-up (interact.ts emits `desk:focus`) names what it framed until you
// come back. Also brings in the pixel font the desk's labels use: only now, never in the terminal's
// first paint.
import { Box3, Raycaster, Vector2, Vector3, type Object3D } from "three";
import { bus } from "../bus";
import type { Hotspot } from "../interact";
import type { DeskApi, Feature } from "./types";

type Caption = [string, string];
type Say = Caption | ((desk: DeskApi, object: Object3D) => Caption);

const PIXEL_FONT = "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&display=swap";
function loadPixelFont() {
  if (document.querySelector("link[data-pixel-font]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = PIXEL_FONT;
  link.dataset.pixelFont = "";
  // fetch the faces now, not on the first hover
  link.onload = () => void document.fonts?.load('700 16px "Pixelify Sans"').catch(() => {});
  document.head.append(link);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const spotOf = (o: Object3D) => o.userData.hotspot as Hotspot | undefined;
/** The objects under `root` (or the scene) whose hotspot is of `kind`. */
function ofKind(root: Object3D, kind: string) {
  const out: Object3D[] = [];
  root.traverse((o) => {
    if (spotOf(o)?.kind === kind) out.push(o);
  });
  return out;
}
const present = (desk: DeskApi, names: string[]) => names.filter((n) => desk.props.has(n)).length;
const LAB = ["switch", "nas", "crt", "picluster", "ups", "thinkpad", "macbook", "mac128k", "c64"];
const PEGS = ["pliers", "screwdrivers", "cutters", "tape", "cableloop", "rule"];
/** A story paper: "Printout" on the left, its project (from its hint, "RAG Crawler · read it") on the right. */
const paper = (thing: string) => (_: DeskApi, o: Object3D): Caption => [thing, (spotOf(o)?.hint ?? "").replace(/ · read it$/, "")];

/** Every prop by name (props.ts `put`, lab, the window), in c-na.dev's words. */
const CAPTIONS: Record<string, Say> = {
  computer: ["Apple II", "the terminal lives here"],
  window: (desk) => ["The window", desk.time() === "night" ? "2 AM" : "golden hour"],
  floppies: (desk) => {
    const disks = ofKind(desk.scene, "disk");
    const out = disks.filter((d) => d.parent === desk.scene).length; // one in the drive sits in the room
    return ["Floppy box", out ? `${plural(disks.length - out, "disk")} · 1 in the drive` : plural(disks.length, "disk")];
  },
  mug: ["The mug", "coffee, still warm"],
  notebook: ["Graph-paper notebook", "computer science"],
  card: ["CAN YOU HEAR ME?", "the call where the mic died"],
  racquet: ["Wooden racquet", "tennis at Taylor"],
  ball: ["Tennis ball", "Taylor tennis"],
  worldmap: (_, o) => ["The world map", `${plural(o.children.filter((c) => c.name.startsWith("postcard:")).length, "postcard")} pinned`],
  cube: ["Rubik's cube", "it solves itself"],
  bitcoin: ["My first bitcoin", "heads or tails"],
  shelf: ["The shelf", "books, a frame, a diploma"],
  books: ["Books", "nine spines"],
  pennant: ["Taylor pennant", "tennis"],
  diploma: ["The baccalauréat", "framed"],
  pixelart: ["Pixel portrait", "collecting digital art"],
  corkboard: ["The pinboard", "workbench notes"],
  mortarboard: ["Grad cap", "Taylor University"],
  crawler: paper("Printout"),
  converter: paper("Pinout"),
  avocados: paper("Ripeness sheet"),
  voicestrip: paper("Transcript strip"),
  pantrymap: paper("Map sketch"),
  lamp: (desk) => ["Desk lamp", desk.lights.lamp.intensity > 0.01 ? "on" : "off"],
  cassette: (_, o) => ["Walkman", ofKind(o, "tape").length ? "a tape in" : "no tape in it"],
  tape: (_, o) => (spotOf(o)?.kind === "tape" ? ["A mixtape", "for the Walkman"] : ["Electrical tape", "black, always black"]),
  phone: ["The phone", "get in touch"],
  answering: ["Answering machine", "leave a message"],
  pens: ["Pen cup", "within reach"],
  eraser: ["Eraser", "for the pencil"],
  pencil: ["A pencil", "for the notebook"],
  headphones: (desk) => ["Headphones", desk.sound?.muted() ? "sound off" : "sound on"],
  globe: ["The globe", "give it a spin"],
  super8: ["Super 8", "filmmaking"],
  spectacles: ["Reading glasses", "folded"],
  duck: ["Rubber duck", "for debugging"],
  camera: ["35mm camera", "photography"],
  kiev: ["Kiev rangefinder", "photography"],
  plant: ["The plant", "by the window"],
  clock: ["The clock", "it's late"],
  clapper: ["The slate", "directing"],
  longhorn: ["Steer skull", "DFW"],
  biplane: ["Toy plane", "propeller and all"],
  rugby: ["Rugby ball", "the oval one"],
  chair: (desk) => ["My chair", desk.seated() ? "taken" : "empty while you stand"],
  studiolight: ["Spotlight", "shooting"],
  suitcase: ["The suitcase", "always moving"],
  skateboard: ["Skateboard", "I built them for friends"],
  breadboard: ["Breadboard", "something half wired"],
  multimeter: ["Multimeter", "volts, ohms, amps"],
  joystick: ["Joystick", "one button"],
  rack: (desk) => ["The home lab", `${plural(present(desk, LAB), "machine")} on the shelves`],
  switch: ["8-port switch", "link lights on"],
  nas: ["The NAS", "backups"],
  crt: (desk) => {
    const services = desk.pvm()?.state.services ?? [];
    return ["Sony PVM", services.length ? `${services.filter((s) => s[2]).length} of ${services.length} services up` : "lab status"];
  },
  picluster: ["Pi cluster", "4 nodes, one of them busy"],
  drawers: ["Parts drawers", "resistors, mostly"],
  soldering: ["Soldering station", "the tip's cold"],
  spool: ["Cat6 spool", "for the next run"],
  ups: ["The UPS", "for the Dallas storms"],
  drives: ["Spare drives", "backups of the backups"],
  powerstrip: ["Power strip", "everything on one switch"],
  thinkpad: ["Laptops", "a few generations of them"],
  macbook: ["Laptops", "a few generations of them"],
  mac128k: ["Macintosh 128K", "1984 · 128 KB"],
  c64: ["Commodore 64", "1982 · 64 KB"],
  pegboard: (desk) => ["The pegboard", plural(present(desk, PEGS), "tool")],
  pliers: ["Pliers", "on the pegboard"],
  screwdrivers: ["Screwdrivers", "on the pegboard"],
  cutters: ["Wire cutters", "on the pegboard"],
  cableloop: ["A hank of cable", "coiled, for once"],
  rule: ["Steel rule", "twelve inches"],
  ivy: ["Ivy", "trailing off the shelf"],
  monstera: ["Monstera", "by the lab"],
  frame: ["Réunion's peaks", "where I was born"],
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The caption for one named thing (a prop, a disk, a postcard, the computer), or null. */
function captionOf(desk: DeskApi, o: Object3D): string | null {
  const spot = spotOf(o);
  if (o.name.startsWith("disk:") && spot) {
    const disks = ofKind(desk.scene, "disk");
    return `${spot.label} · disk ${disks.indexOf(o) + 1} of ${disks.length}`;
  }
  if (o.name.startsWith("postcard:") && spot) return `${titleCase(spot.label)} · ${spot.hint ?? "a postcard"}`;
  const say = CAPTIONS[o.name];
  const [thing, state] = typeof say === "function" ? say(desk, o) : say ?? [cap(spot?.label ?? o.name), spot?.hint ?? ""];
  return state ? `${thing} · ${state}` : thing;
}

const caption: Feature = {
  name: "chrome-caption",
  onDesk(desk) {
    loadPixelFont();
    const { scene, camera } = desk;
    const ray = new Raycaster();
    const centre = new Vector2(0, 0);
    const hitBox = new Vector3();
    let computerBox: Box3 | null = null;
    /** What's in the middle of the view: the nearest prop the centre ray hits (or a postcard on the map), else the computer. */
    function centred(): Object3D | null {
      ray.setFromCamera(centre, camera);
      const computer = scene.getObjectByName("computer");
      if (computer && !computerBox) computerBox = new Box3().setFromObject(computer);
      const toComputer = computerBox && ray.ray.intersectBox(computerBox, hitBox) ? hitBox.distanceTo(ray.ray.origin) : Infinity;
      const pane = scene.getObjectByName("window");
      const hit = ray.intersectObjects([...desk.props.values(), ...(pane ? [pane] : [])], true).find((h) => h.object.visible);
      if (hit && hit.distance < toComputer) {
        for (let p: Object3D | null = hit.object; p; p = p.parent) {
          if (p.name.startsWith("postcard:") || p === pane) return p;
          if (p.name && desk.props.get(p.name) === p) return p;
        }
      }
      if (Number.isFinite(toComputer)) return computer ?? null;
      // the middle is bare wall or floor: name the prop nearest the middle of the view
      let best: Object3D | null = null;
      let bestD = 0.45 ** 2;
      for (const [name, prop] of [...desk.props, ...(pane ? [["window", pane] as const] : [])]) {
        if (!CAPTIONS[name] && !spotOf(prop)) continue;
        let at = centres.get(prop);
        if (!at) centres.set(prop, (at = new Box3().setFromObject(prop).getCenter(new Vector3())));
        const p = onScreen.copy(at).project(camera);
        const d = p.x * p.x + p.y * p.y;
        if (p.z < 1 && d < bestD) {
          best = prop;
          bestD = d;
        }
      }
      return best;
    }
    /** Where each prop's middle is (they stay put, near enough, so it's measured once). */
    const centres = new Map<Object3D, Vector3>();
    const onScreen = new Vector3();

    // A close-up names what it framed until the camera comes back.
    let focus: string | null = null;
    bus.on("desk:focus", ({ name }) => {
      focus = typeof name === "string" ? name : null;
      update(true);
    });

    let last = "";
    const lastPose = new Vector3();
    const lastTurn = new Vector3();
    const turn = new Vector3();
    let idle = 0;
    /** Names what's centred: on a turn of the head (or a step), and every few seconds for the states (lamp, time). */
    function update(force = false) {
      if (desk.seated()) {
        // in the screen: forget it, so stepping back names the view afresh, not the last close-up
        if (last) {
          last = "";
          desk.caption(null);
        }
        return;
      }
      if (document.hidden) return;
      turn.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const moved = camera.position.distanceToSquared(lastPose) > 1e-6 || turn.distanceToSquared(lastTurn) > 1e-6;
      if (!force && !moved && ++idle < 8) {
        desk.caption(last || null); // keeps the strip shown once a flight ends
        return;
      }
      idle = 0;
      lastPose.copy(camera.position);
      lastTurn.copy(turn);
      if (focus && !desk.framed()) focus = null;
      const object = focus ? scene.getObjectByName(focus) : centred();
      const text = object ? captionOf(desk, object) : null;
      last = text ?? (desk.time() === "night" ? "The desk · 2 AM" : "The desk · golden hour");
      desk.caption(last);
    }
    // A light timer, not a render loop: it only reads the camera (one ray when the view has moved).
    window.setInterval(() => update(), 320);
  },
};

export default caption;
