// The rubber duck: click it and it hops and quacks, and you sit down to explain your bug to it
// (`duck` in the terminal: mostly quacks, now and then the question you needed).
import type { Feature } from "./types";

const duck: Feature = {
  name: "consequences-duck",
  hotspots: { duck: { kind: "duck", label: "rubber duck", hint: "explain your bug to it" } },
  actions: {
    async duck({ object, sfx, motions, once, sitDownAndRun, leave }) {
      leave();
      await once(object, async () => {
        sfx("quack", object);
        await motions.hop(object, 0.035, 620);
      });
      await sitDownAndRun("duck");
    },
  },
};
export default duck;
