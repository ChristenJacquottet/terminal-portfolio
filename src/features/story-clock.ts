// The wall clock keeps the visitor's own time: its hands are set from the local clock and move
// on the desk's heartbeat (about once a second, while the desk is in view). The label says the time.
import { Box3, Group, Vector3, type BufferGeometry, type Mesh, type Object3D } from "three";
import type { DeskApi, Feature } from "./types";

type Hand = { pivot: Group; rest: number };
let hands: { hour: Hand; minute: Hand; second: Hand | null } | null = null;
let shown = "";

/**
 * Puts a hand on a pivot at the dial's centre (in the hand's parent), and works out which way it
 * points as modelled (the vertex farthest from the centre is its tip): clockwise from 12, radians.
 */
function pivotHand(hand: Mesh, centre: Vector3): Hand {
  const parent = hand.parent!;
  const pivot = new Group();
  pivot.name = `${hand.name}:pivot`;
  parent.add(pivot);
  pivot.position.set(centre.x, centre.y, hand.position.z);
  pivot.updateMatrix();
  pivot.attach(hand);
  hand.updateMatrix();
  // Its shadow catches up with the next redraw of the shadow maps (something moving, a click): a
  // second hand stepping on the heartbeat doesn't earn redrawing the whole room's every second.
  hand.userData.lazyShadow = true;
  const pos = (hand.geometry as BufferGeometry).getAttribute("position");
  const v = new Vector3();
  let far = 0;
  let rest = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(hand.matrix);
    const d = v.x * v.x + v.y * v.y;
    if (d > far) {
      far = d;
      rest = Math.atan2(v.x, v.y);
    }
  }
  return { pivot, rest };
}

function rig(clock: Object3D) {
  const find = (re: RegExp) => {
    let m: Mesh | null = null;
    clock.traverse((o) => {
      if (!m && (o as Mesh).isMesh && re.test(o.name)) m = o as Mesh;
    });
    return m as Mesh | null;
  };
  const hour = find(/hours?_hand/i);
  const minute = find(/minute_hand/i);
  const second = find(/second_hand/i);
  const face = find(/frame.*_1$/i) ?? find(/frame/i);
  if (!hour || !minute || !hour.parent || hour.parent !== minute.parent) return null;
  // The dial's centre, from the face's box, in the hands' parent's space.
  clock.updateMatrixWorld(true);
  const box = new Box3().setFromObject(face ?? clock);
  const centre = hour.parent.worldToLocal(box.getCenter(new Vector3()));
  const withSecond = second?.parent === hour.parent;
  return {
    hour: pivotHand(hour, centre),
    minute: pivotHand(minute, centre),
    second: second && withSecond ? pivotHand(second, centre) : null,
  };
}

/** Sets the hands to now; true if anything moved. */
function tick(): boolean {
  if (!hands) return false;
  const now = new Date();
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  const key = `${h.toFixed(3)}:${s}`;
  if (key === shown) return false;
  shown = key;
  const set = (hand: Hand | null, turns: number) => {
    if (hand) hand.pivot.rotation.z = -(turns * Math.PI * 2 - hand.rest);
  };
  set(hands.hour, h / 12);
  set(hands.minute, m / 60);
  set(hands.second, s / 60);
  return true;
}

let desk: DeskApi | null = null;

const clock: Feature = {
  name: "story-clock",
  label(object) {
    if (object.name !== "clock") return null;
    const t = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return ["the clock", `${t} · your time`];
  },
  onDesk(d) {
    desk = d;
    const c = d.props.get("clock");
    if (!c) return;
    hands = rig(c);
    tick();
    d.request();
    d.pulses.add(() => {
      tick();
    });
    // back from the screen, or the tab: catch up at once
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && tick()) desk?.request();
    });
  },
};

export default clock;
