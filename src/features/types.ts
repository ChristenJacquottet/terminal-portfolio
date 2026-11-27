// A feature is one self-contained piece of the desk: what it adds to the room, what happens when
// its things are clicked, what it says on hover, what it does on the heartbeat. Each lives in its
// own file under src/features/ and is picked up automatically (index.ts); nothing else needs
// editing to add one. Terminal commands live apart, in src/commands/<name>.ts (they must not
// import three.js: the terminal bundle stays small), and talk to the desk through src/bus.ts.
import type { Box3, Camera, Intersection, Object3D, Scene, SpotLight, Vector3 } from "three";
import type { Hotspot } from "../interact";
import type { Room, Time } from "../room";
import type { Cue } from "../audio";

export type PlaceOpts = { height?: number; width?: number; rotY?: number; y?: number; shadow?: boolean };

/** What a feature gets to put things in the room (props.ts, after the built-in props). */
export type PropCtx = {
  scene: Scene;
  room: Room;
  /** The computer's world box: props are arranged around it. */
  bounds: Box3;
  floor: number;
  wall: number;
  /** Desk back and front edges (z). The desk top is y = 0. */
  back: number;
  front: number;
  /** Registers a prop by name (layout.json can then move it) and adds it to the scene. */
  put: (name: string, o: Object3D) => Object3D;
  /** Sits `o` on the desk at (x, z), scaled to `height` or `width` metres, base at y (default 0). */
  place: (o: Object3D, x: number, z: number, opts?: PlaceOpts) => Object3D;
  /** Hangs `o` flat on the wall, centred at (x, y), `height` metres tall. */
  hang: (o: Object3D, x: number, y: number, wallZ: number, height: number, turn?: number) => Object3D;
  /** The loaded models by name (props.glb), for a feature that re-dresses one. */
  byName: Record<string, Object3D | undefined>;
  /** Every registered prop so far. */
  props: Map<string, Object3D>;
  /** The home-lab rack, if it loaded: where its shelves are. */
  rack: {
    x: number;
    z: number;
    turn: number;
    /** Unit vector along the shelves, in the room. */
    along: Vector3;
    /** Shelf tops, lowest first. */
    tops: number[];
    /** Half the rack's width. */
    half: number;
    /** Puts `o` on shelf `level` (0 = top), `dx` along it, clamped to the rack. */
    onLevel: (name: string, o: Object3D, level: number, dx: number, width: number, opts: PlaceOpts, hotspot: Hotspot) => Object3D | null;
  } | null;
  /** The lamp's light. */
  lamp: SpotLight;
  /** Something changed: redraw. */
  onChange: () => void;
};

/** The motions interact.ts already knows; a feature can reuse them. */
export type Motions = {
  hop: (x: Object3D, height?: number, ms?: number) => Promise<void>;
  bounce: (x: Object3D) => Promise<void>;
  spin: (x: Object3D) => Promise<void>;
  wiggle: (x: Object3D, amount?: number) => Promise<void>;
  swing: (x: Object3D) => Promise<void>;
  flip: (x: Object3D) => Promise<void>;
};

/** What a click handler gets. */
export type ActionCtx = {
  object: Object3D;
  spot: Hotspot;
  hit: Intersection;
  scene: Scene;
  camera: Camera;
  /** Runs `step(t)` (0 → 1) each frame for `ms`, redrawing as it goes. */
  animate: (ms: number, step: (t: number) => void) => Promise<void>;
  /** Shadows must be redrawn (a light changed). */
  relight: () => void;
  /** A sound, panned to `at` (an object on screen) if given. */
  sfx: (cue: Cue | string, at?: Object3D, volume?: number) => void;
  music: (on: boolean) => void;
  /** Frame the Apple II and type a command on its screen. */
  sitDownAndRun: (command: string) => Promise<void>;
  motions: Motions;
  /** Runs `fn` for `object` unless it's already moving. */
  once: (object: Object3D, fn: () => Promise<void>) => Promise<void>;
  lamp: { on: () => boolean; set: (on: boolean) => void };
  time: () => Time;
  setTime: (t: Time) => void;
  /** The desk's API, once the desk exists (always, from a click). */
  desk: () => DeskApi | null;
  /** Hide the hover label. */
  leave: () => void;
};

/** The desk, for features (desk.ts builds it). */
export type DeskApi = {
  scene: Scene;
  camera: Camera;
  props: Map<string, Object3D>;
  request: () => void;
  relight: () => void;
  animate: (ms: number, step: (t: number) => void) => Promise<void>;
  /** The lights, by role. */
  lights: { lamp: SpotLight; glow: import("three").PointLight; fill: import("three").HemisphereLight; lab: import("three").PointLight };
  time: () => Time;
  setTime: (t: Time) => void;
  /** The rack strip latches until the visitor restores it. */
  setStripPower: (on: boolean) => void;
  stripOff: () => boolean;
  /**
   * Everything electrical off for `ms`: lights, LEDs, screens, the hum, the terminal under the
   * glass. `keep` stays lit (the UPS's LCD); `terminal: true` keeps the terminal under the glass
   * up (the UPS feeds the desk). Resolves once the room is back.
   */
  blackout: (ms: number, keep?: Object3D[], opts?: { terminal?: boolean }) => Promise<void>;
  /** The caption strip under the scene (c-na.dev's "Floppy holder · 7 disks"); null hides it. */
  caption: (text: string | null) => void;
  /**
   * A caption that wins over the ambient one (which chrome-caption rewrites a few times a
   * second) until it's released with null: a game being played, a take on the slate.
   */
  holdCaption: (text: string | null) => void;
  /** The interactive object visible at the center of the view. */
  lookingAt: () => Object3D | null;
  /** The heartbeat (about 1 Hz while the desk is in view): add a function to run on it. */
  pulses: Set<() => void>;
  sound: {
    play: (cue: Cue | string, opts?: { pan?: number; volume?: number }) => void;
    music: (on: boolean) => Promise<void>;
    loop: (name: "room" | "hum", on: boolean) => void;
    muted: () => boolean;
  } | null;
  terminal: {
    /** Types and runs a command (the visitor stays where they are). */
    run: (command: string) => void;
    /** Clears the terminal and boots it again, banner and all. */
    reboot: () => Promise<void>;
  };
  /** Bring the physical monitor into view. */
  sitDown: () => Promise<void>;
  /** The Sony PVM's screen, if the lab loaded (see alive.ts `PvmScreen`). */
  pvm: () => PvmScreen | null;
  /**
   * Clicks a prop (or anything with a hotspot) as if the visitor had: the terminal driving the desk.
   * `stay`: the prop answers (a disk goes into the drive, the handset lifts) but the visitor isn't
   * sat down and nothing is typed (the terminal already ran it).
   */
  activate: (object: Object3D, opts?: { stay?: boolean }) => boolean;
  /** Whether the visitor is at the screen (true) or stepped back looking at the desk. */
  seated: () => boolean;
  /** Steps back from the screen to the desk (loads nothing new: the desk is already here). */
  stepBack: () => Promise<void>;
  /**
   * Flies the camera to frame `target` (a prop or a box) up close, the way c-na.dev re-frames its
   * scene per section. `dir` is the direction from the target to the camera (default: from where
   * the camera is now); `fill` is how much of the view's height the target takes (default 0.6).
   * Head-turning is off while framed; Escape, a click on nothing, or `unframe` comes back.
   */
  frame: (target: Object3D | Box3, opts?: { dir?: Vector3; fill?: number; ms?: number }) => Promise<void>;
  /** Back to the seat after `frame`. */
  unframe: (ms?: number) => Promise<void>;
  /** Whether the camera is framing something. */
  framed: () => boolean;
};

/** The PVM's phosphor canvas. Status lines come from `state`; `override` takes the whole tube. */
export type PvmScreen = {
  ctx: CanvasRenderingContext2D;
  /** Redraws now (status page, or the override) and asks for a frame. */
  repaint: () => void;
  state: PvmState;
  /** When set, draws instead of the status page; set null to hand the tube back. */
  override: ((g: CanvasRenderingContext2D, now: number) => void) | null;
};

export type PvmState = {
  /** name, state, ok */
  services: [string, string, boolean][];
  meters: [string, number][];
  /** One extra line under the meters, if any (a rally count, a backup running). */
  footer: string | null;
};

export type Feature = {
  name: string;
  /** Labels by prop name, merged over interact.ts's defaults (change a prop's `kind` here). */
  hotspots?: Record<string, Hotspot>;
  /** Click handlers by hotspot kind. A kind the built-ins also know is overridden. */
  actions?: Record<string, (ctx: ActionCtx) => void | Promise<void>>;
  /** A dynamic hover label for a prop: return [label, hint], or null for the default. */
  label?: (object: Object3D, spot: Hotspot) => [string, string | undefined] | null;
  /** Adds or re-dresses props. Runs after the built-in props, before they're prepared. */
  props?: (ctx: PropCtx) => void | Promise<void>;
  /** The desk exists: wire up the bus, the caption, the pulses. */
  onDesk?: (desk: DeskApi) => void;
};
