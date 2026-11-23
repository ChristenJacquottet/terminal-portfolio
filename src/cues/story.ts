// Sounds for the story props (src/features/story-*.ts): quiet, short, mechanical.
import type { CueKit } from "../audio-engine";

export default {
  /** The globe comes to rest: the bearing's last soft knock in the meridian ring. */
  globeStop(k: CueKit) {
    const r = k.rate * k.jitter(30);
    k.noise(k.pink, 0.05, 0.07 * k.vol, 900 * r, 1.4);
    k.tone(0.09, 520 * r, 470 * r, 0.04 * k.vol, "triangle", 0, 1800, 0.002);
    k.tone(0.16, 1560 * r, 1540 * r, 0.012 * k.vol, "sine", 0.004, 0, 0.002);
  },
  /** An instant camera pushing a print out: a small motor and gears, then the print's tail. */
  polaroidOut(k: CueKit) {
    const r = k.rate * k.jitter(25);
    k.tone(0.5, 210 * r, 260 * r, 0.02 * k.vol, "sawtooth", 0, 700, 0.04);
    k.noise(k.white, 0.5, 0.035 * k.vol, 2600 * r, 3, 0, 3100 * r, 0.05);
    k.noise(k.pink, 0.06, 0.04 * k.vol, 1800 * r, 1.5, 0.5);
  },
  /** The studio light: a heavy rocker switch, the ballast's tick and the filament taking it. */
  keyLightOn(k: CueKit) {
    const r = k.rate * k.jitter(20);
    k.noise(k.white, 0.012, 0.16 * k.vol, 1900 * r, 1.4);
    k.tone(0.035, 180 * r, 120 * r, 0.12 * k.vol, "triangle", 0, 900, 0.001);
    k.tone(0.7, 100 * r, 100 * r, 0.012 * k.vol, "sawtooth", 0.05, 380, 0.25);
    k.tone(0.09, 2900 * r, 2850 * r, 0.01 * k.vol, "sine", 0.06, 0, 0.002);
  },
  keyLightOff(k: CueKit) {
    const r = k.rate * k.jitter(20);
    k.noise(k.white, 0.01, 0.13 * k.vol, 1700 * r, 1.4);
    k.tone(0.03, 160 * r, 110 * r, 0.1 * k.vol, "triangle", 0, 900, 0.001);
    k.noise(k.pink, 0.4, 0.012 * k.vol, 600 * r, 0.9, 0.02, 300 * r, 0.01);
  },
  /** A meter's probes touching, and the movement's tiny jewel tick. */
  needle(k: CueKit) {
    const r = k.rate * k.jitter(30);
    k.noise(k.white, 0.006, 0.06 * k.vol, 3800 * r, 2);
    k.tone(0.02, 2200 * r, 2000 * r, 0.02 * k.vol, "sine", 0.03, 0, 0.001);
  },
  /** Glasses: the hinges unfolding, a light plastic tick. */
  glasses(k: CueKit) {
    const r = k.rate * k.jitter(40);
    k.noise(k.white, 0.008, 0.07 * k.vol, 4200 * r, 2.4);
    k.noise(k.white, 0.006, 0.05 * k.vol, 3600 * r, 2.4, 0.09);
    k.tone(0.03, 1900 * r, 1700 * r, 0.015 * k.vol, "triangle", 0.09, 0, 0.001);
  },
  /** A thumb flicks a coin: a bright ping that rings as it spins up. */
  coinFlip(k: CueKit) {
    const r = k.rate * k.jitter(35);
    k.noise(k.white, 0.004, 0.05 * k.vol, 5200 * r, 2.5);
    k.tone(0.5, 3950 * r, 3900 * r, 0.018 * k.vol, "sine", 0.002, 0, 0.001);
    k.tone(0.35, 5600 * r, 5560 * r, 0.008 * k.vol, "sine", 0.002, 0, 0.001);
  },
  /** It lands on the wood and chatters down flat. */
  coinLand(k: CueKit) {
    const r = k.rate * k.jitter(30);
    const at = [0, 0.11, 0.19, 0.245, 0.285, 0.31];
    at.forEach((dt, i) => {
      const g = (0.06 - i * 0.008) * k.vol;
      k.noise(k.white, 0.006, g, 3100 * r, 2.2, dt);
      k.tone(0.06, 2400 * r, 2380 * r, g * 0.25, "sine", dt, 0, 0.001);
    });
    k.noise(k.pink, 0.04, 0.03 * k.vol, 700 * r, 1.2);
  },
};
