# Sounds from features

A file here exports `default` as `Record<string, (k: CueKit) => void>` (see `CueKit` in
`src/audio-engine.ts`) and is merged into the sound engine at build time. Play it from anywhere
with `audio.play("yourCue")`, or from a feature's action with `sfx("yourCue", object)` (panned
to the object). Synthesise with `k.noise` and `k.tone` (see the built-in cues in
`audio-engine.ts` for the house style: short, quiet, mechanical, a little variation per play
with `k.pick` and `k.jitter`), or play a CC0 recording from `public/audio` with `k.sample`
(credit it in `public/audio/CREDITS.md`). Scale every gain by `k.vol`. Never create your own
AudioContext.

```ts
import type { CueKit } from "../audio-engine";
export default {
  quack(k: CueKit) {
    const r = k.rate * k.jitter(40);
    k.tone(0.12, 520 * r, 380 * r, 0.06 * k.vol, "sawtooth", 0, 1400);
    k.noise(k.pink, 0.1, 0.05 * k.vol, 900 * r, 1.2);
  },
};
```
