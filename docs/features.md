# Adding to the desk: features

Each piece of the desk that does something is a **feature**: one file in `src/features/`, default
exporting a `Feature` (`src/features/types.ts`). It is picked up automatically. Nothing else in
the repo needs editing to add one, which is what lets several people build at once.

```ts
// src/features/duck.ts
import type { Feature } from "./types";

const duck: Feature = {
  name: "duck",
  hotspots: { duck: { kind: "duck", label: "rubber duck", hint: "explain your bug to it" } },
  actions: {
    async duck({ object, sfx, motions, once, sitDownAndRun }) {
      sfx("tap", object);
      await once(object, () => motions.hop(object));
      await sitDownAndRun("duck");
    },
  },
};
export default duck;
```

What a feature can do:

- **`hotspots`**: labels by prop name, merged over the defaults in `interact.ts`. This is how you
  change what a click does to an existing prop: give it a new `kind`, then handle that kind in
  `actions`.
- **`actions`**: click handlers by `kind`. The context (`ActionCtx`) has the object, `animate`
  (frame-by-frame for `ms`), the shared `motions` (hop, wiggle, swing, bounce, spin, flip), `sfx`
  panned to the object, `once` (no double-clicks), the lamp, the time of day, `sitDownAndRun`
  (sit at the computer and type a command), and `desk()` (the `DeskApi`).
- **`label`**: a dynamic hover label (`[label, hint]`), for state ("the mug · empty").
- **`props`**: build or re-dress props. Runs after the built-in props, before they're prepared,
  with `put`/`place`/`hang`, the room, the computer's box, the loaded models (`byName`) and the
  rack's shelves (`rack.onLevel`). Anything added with `put` can be arranged in `?edit`.
- **`onDesk`**: the desk exists. Wire up `bus` listeners, `pulses` (the ~1 Hz heartbeat),
  `caption`, `blackout`, the PVM (`desk.pvm()`).

Terminal commands go in `src/commands/<name>.ts` (default export `Record<string, Command>`), and
**must not import three.js or anything under `src/features/`**. The terminal and the desk talk
through `src/bus.ts`:

```ts
// terminal side (src/commands/coffee.ts)
bus.emit("coffee:refill");
// desk side (src/features/coffee.ts, in onDesk)
bus.on("coffee:refill", () => refill());
```

Bus names in use: `project:hover {slug|null}`, `project:open {slug}`, `contact:open`,
`desk:look {name|null}`, `coffee:refill`, `power:cut`. Add yours to this list.

Rules that still apply (docs/art-direction.md): the scene only draws while something moves (use
`animate`, never your own rAF loop); a click leads somewhere real, changes the room, or is a toy
with a rule, never a wobble; sounds are quiet and mechanical (`src/audio-engine.ts` cues, add new
ones there); labels claim only what's true.

Verifying: `npm run typecheck && npm run build`, then `npm run dev` and drive the desk. In dev,
`window.__desk` exposes `{ scene, renderer, camera, look, three }`: set `look.active = false`,
move the camera, `renderer.render(scene, camera)` for a close-up. `?edit` opens the layout editor.
A headless check with Playwright works (software GL: slow, allow long timeouts): type `exit`,
wait for "sound on" in `document.body.innerText`, then click props by projecting their world
position with `camera`.
