// The arcade on the PVM and the tennis ball: small square-wave blips through the monitor's little
// speaker (low-passed, quiet), and the felt thock of a ball on strings and on the desk.
import type { CueKit } from "../audio-engine";

/** A blip from the PVM's speaker: a square wave, rounded off by a low-pass, very short. */
const blip = (k: CueKit, dur: number, f0: number, f1: number, gain: number, dt = 0) =>
  k.tone(dur, f0 * k.rate, f1 * k.rate, gain * k.vol, "square", dt, 2600, 0.002);

export default {
  /** The tube switches to the arcade: a soft degauss thump and a rising chirp. */
  arcadeOn(k: CueKit) {
    k.noise(k.brown, 0.18, 0.05 * k.vol, 120, 0.8);
    blip(k, 0.05, 440, 440, 0.03, 0.06);
    blip(k, 0.07, 660, 660, 0.03, 0.12);
  },
  /** The cursor moves on the title menu. */
  arcadeBlip(k: CueKit) {
    blip(k, 0.03, 880 * k.jitter(20), 880, 0.025);
  },
  /** A cartridge starts. */
  arcadeStart(k: CueKit) {
    [523, 659, 784, 1047].forEach((f, i) => blip(k, 0.06, f, f, 0.028, i * 0.07));
  },
  arcadeEat(k: CueKit) {
    blip(k, 0.06, 620 * k.jitter(30), 1240, 0.03);
  },
  arcadeMove(k: CueKit) {
    blip(k, 0.018, 300 * k.jitter(40), 280, 0.02);
  },
  arcadeDrop(k: CueKit) {
    blip(k, 0.05, 180, 90, 0.035);
    k.noise(k.pink, 0.03, 0.02 * k.vol, 900, 1.2);
  },
  arcadeLine(k: CueKit) {
    [784, 988, 1175].forEach((f, i) => blip(k, 0.05, f, f, 0.03, i * 0.05));
  },
  arcadePaddle(k: CueKit) {
    blip(k, 0.035, 490 * k.jitter(15), 490, 0.032);
  },
  arcadeWall(k: CueKit) {
    blip(k, 0.03, 245, 245, 0.025);
  },
  arcadePoint(k: CueKit) {
    blip(k, 0.05, 660, 660, 0.03);
    blip(k, 0.09, 990, 990, 0.03, 0.06);
  },
  arcadeMiss(k: CueKit) {
    blip(k, 0.18, 220, 110, 0.03);
  },
  /** Game over: four steps down, the last one held. */
  arcadeOver(k: CueKit) {
    [392, 330, 262, 196].forEach((f, i) => blip(k, i === 3 ? 0.32 : 0.12, f, i === 3 ? f * 0.94 : f, 0.032, i * 0.15));
  },
  /** The ball off the strings (or a palm): a felt thock with a little ring of gut. */
  ballHit(k: CueKit) {
    const r = k.rate * k.jitter(60);
    k.noise(k.pink, 0.03, 0.09 * k.vol, 1500 * r, 1.4);
    k.tone(0.06, 260 * r, 170 * r, 0.06 * k.vol, "sine");
    k.tone(0.05, 1150 * r, 1080 * r, 0.008 * k.vol, "triangle", 0.004);
  },
  /** The ball lands on the desk: duller, and quieter each bounce (pass a volume). */
  ballBounce(k: CueKit) {
    const r = k.rate * k.jitter(80);
    k.noise(k.pink, 0.025, 0.07 * k.vol, 820 * r, 1.1);
    k.tone(0.05, 150 * r, 105 * r, 0.06 * k.vol, "sine");
  },
};
