// Short contact sounds from Kenney's Impact Sounds. Each pair alternates takes before pitch variation.
import type { CueKit } from "../audio-engine";

export function contact(k: CueKit, material: string, gain: number, rate = 1) {
  const take = k.pick(2) === 0 ? "000" : "001";
  k.sample(`/audio/foley/impact${material}_${take}.mp3`, gain * k.vol, rate * k.rate * k.jitter(45));
}

export default {
  woodKnock(k: CueKit) { contact(k, "Wood_light", 0.36); },
  frameKnock(k: CueKit) {
    contact(k, "Wood_light", 0.25, 1.14);
    k.noise(k.white, 0.014, 0.045 * k.vol, 3200, 2, 0.047); // the hook against the wall
  },
  glassTick(k: CueKit) { contact(k, "Glass_light", 0.18, 1.13); },
  ceramicSet(k: CueKit) { contact(k, "Plate_light", 0.26, 0.91); },
  fabric(k: CueKit) {
    contact(k, "Soft_medium", 0.23, 1.15);
    k.noise(k.pink, 0.12, 0.085 * k.vol, 1400, 0.7, 0.016, 650, 0.045);
  },
  foliage(k: CueKit) {
    const r = k.rate * k.jitter(100);
    for (const [dt, level] of [[0, 0.16], [0.058, 0.11], [0.14, 0.06]]) {
      k.noise(k.pink, 0.082, level * k.vol, 3900 * r, 1.1, dt, 1600 * r, 0.029);
    }
  },
  cardFlick(k: CueKit) {
    const r = k.rate * k.jitter(70);
    k.noise(k.white, 0.024, 0.18 * k.vol, 4400 * r, 0.9, 0, 1800 * r);
    k.tone(0.052, 320 * r, 125 * r, 0.038 * k.vol, "triangle");
    k.noise(k.pink, 0.085, 0.09 * k.vol, 2100 * r, 0.7, 0.018, 850 * r, 0.022);
  },
  spoolRoll(k: CueKit) {
    contact(k, "Wood_light", 0.23, 1.24);
    k.noise(k.brown, 0.18, 0.20 * k.vol, 390, 0.9, 0.02, 220, 0.025);
    k.noise(k.pink, 0.029, 0.09 * k.vol, 1200, 1.4, 0.17); // loose cable taps the rim
  },
  partsRattle(k: CueKit) {
    contact(k, "Tin_medium", 0.19, 1.29);
    for (const [dt, level] of [[0.047, 0.08], [0.09, 0.055], [0.124, 0.03]]) {
      k.noise(k.white, 0.015, level * k.vol, 2900 * k.jitter(95), 2, dt);
    }
  },
  cableBrush(k: CueKit) {
    contact(k, "Soft_medium", 0.21, 1.21);
    k.noise(k.brown, 0.11, 0.16 * k.vol, 540, 0.85, 0.025, 290, 0.025);
    k.tone(0.034, 1450, 920, 0.037 * k.vol, "triangle", 0.115, 2100);
  },
};
