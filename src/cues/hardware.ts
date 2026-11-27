// Close mechanical sounds. The quiet tails distinguish a steel rail, plastic and loose tools.
import type { CueKit } from "../audio-engine";

export default {
  rackTap(k: CueKit) {
    const r = k.rate * k.jitter(45);
    k.noise(k.brown, 0.036, 0.15 * k.vol, 460 * r, 1);
    k.tone(0.19, 224 * r, 216 * r, 0.055 * k.vol, "sine");
    k.tone(0.11, 598 * r, 581 * r, 0.018 * k.vol, "sine", 0.003);
  },
  caseTap(k: CueKit) {
    const r = k.rate * k.jitter(85);
    k.noise(k.pink, 0.016, 0.11 * k.vol, 1500 * r, 1.4);
    k.tone(0.073, 315 * r, 165 * r, 0.066 * k.vol, "triangle", 0, 1100);
    k.noise(k.brown, 0.037, 0.07 * k.vol, 390 * r, 1, 0.016);
  },
  toolClink(k: CueKit) {
    const r = k.rate * k.jitter(110);
    k.noise(k.white, 0.008, 0.08 * k.vol, 3300 * r, 1.8);
    k.tone(0.13, 1480 * r, 1450 * r, 0.033 * k.vol, "sine");
    k.tone(0.18, 2310 * r, 2300 * r, 0.014 * k.vol, "sine", 0.028);
  },
  fanTest(k: CueKit) {
    const r = k.rate * k.jitter(35);
    k.noise(k.pink, 1.18, 0.21 * k.vol, 430 * r, 0.9, 0, 1650 * r, 0.48);
    k.noise(k.brown, 0.86, 0.12 * k.vol, 1000 * r, 1, 0.52, 320 * r, 0.08);
    k.tone(0.72, 81 * r, 146 * r, 0.043 * k.vol, "triangle", 0, 520, 0.4);
    k.tone(0.67, 146 * r, 77 * r, 0.032 * k.vol, "triangle", 0.65, 480, 0.04);
  },
};
