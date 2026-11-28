import type { Object3D } from "three";
import type { DeskApi, Feature } from "./types";
import { easeOut, refreshChip } from "./story-kit";

/** The clapstick's hinge angle (about its x) shut, and how far it lifts before it snaps (checked by eye). */
const SHUT = 0;
const LIFT = 0.62;
let rolling = false;
let take = 0;
let desk: DeskApi | null = null;
/** The clapstick's hinge (built with keepHierarchy: the arm is under an empty named Empty.001_4). */
function armOf(slate: Object3D): Object3D | null {
  let arm: Object3D | null = null;
  slate.traverse((o) => {
    if (!arm && /^Empty\.?001_4$/.test(o.name)) arm = o;
  });
  return arm;
}

const slate: Feature = {
  name: "story-slate",
  hotspots: {
    clapper: { kind: "slate", label: "the slate", hint: "directing · roll it" },
  },
  label(_object, spot) {
    if (spot.kind === "slate") return ["the slate", rolling ? `take ${take} · rolling · cut` : "directing · action"];
    return null;
  },
  onDesk(d) {
    desk = d;
  },
  actions: {
    async slate({ object, sfx, once, animate, leave }) {
      await once(object, async () => {
        leave();
        const arm = armOf(object);
        if (arm) {
          const shut = SHUT;
          const open = SHUT + LIFT;
          const from = arm.rotation.x;
          // up, a beat, and down hard
          await animate(260, (t) => (arm.rotation.x = from + (open - from) * easeOut(t)));
          await animate(90, () => {});
          await animate(70, (t) => (arm.rotation.x = open + (shut - open) * t * t));
          sfx("clapper", object);
          await animate(160, (t) => (arm.rotation.x = shut + 0.035 * Math.sin(t * Math.PI) * (1 - t)));
          arm.rotation.x = shut;
        } else {
          sfx("clapper", object);
          await animate(200, () => {});
        }
        rolling = !rolling;
        if (rolling) take++;
        desk?.holdCaption(rolling ? `take ${take} · recording field notes` : "cut");
        if (!rolling) window.setTimeout(() => { if (!rolling) desk?.holdCaption(null); }, 1400);
      });
      refreshChip();
    },
  },
};

export default slate;
