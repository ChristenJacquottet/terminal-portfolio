// Sounds for the props that do something to the room (src/features/consequences-*.ts): the power
// strip's rocker and the lab winding down, the CRTs' degauss, the UPS's relay and beep, the
// coffee (a sip, a pour), the duck, the soldering iron's sizzle, the NAS's disks seeking.
import type { CueKit } from "../audio-engine";

/**
 * A sustained sound (not a hit): `src` through a filter, swelling in over `atk` and out over the
 * last `rel` seconds. Returns the filter so a cue can sweep it.
 */
function held(k: CueKit, src: AudioScheduledSourceNode, dur: number, gain: number, filter: BiquadFilterType, freq: number, q: number, dt = 0, atk = 0.04, rel = 0.3) {
  const { c } = k;
  const t0 = c.currentTime + dt;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t0);
  f.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + atk);
  env.gain.setValueAtTime(Math.max(0.0002, gain), t0 + Math.max(atk, dur - rel));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(env);
  env.connect(k.out);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  src.onended = () => env.disconnect();
  return { f, env, t0 };
}

const noiseSrc = (k: CueKit, buf: AudioBuffer | null) => {
  if (!buf) return null;
  const s = k.c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.loopStart = Math.random() * Math.max(0, buf.duration - 0.5);
  return s;
};

export default {
  /** The power strip's rocker: a stiff plastic clack with the body of the strip under it. */
  rocker(k: CueKit) {
    const r = k.rate * k.jitter(30);
    k.noise(k.white, 0.007, 0.13 * k.vol, 2600 * r, 2.2);
    k.tone(0.03, 620 * r, 260 * r, 0.07 * k.vol, "triangle");
    k.noise(k.pink, 0.02, 0.12 * k.vol, 1150 * r, 1.6, 0.012);
    k.tone(0.06, 150 * r, 80 * r, 0.14 * k.vol, "sine", 0.012, 600);
  },

  /** Everything on the strip winding down: the transformers' whine falls away, the fans spin out. */
  powerDown(k: CueKit) {
    const { c } = k;
    const r = k.rate * k.jitter(15);
    const whine = c.createOscillator();
    whine.type = "triangle";
    const w = held(k, whine, 1.5, 0.028 * k.vol, "lowpass", 2400, 0.7, 0, 0.01, 1.2);
    whine.frequency.setValueAtTime(1180 * r, w.t0);
    whine.frequency.exponentialRampToValueAtTime(140 * r, w.t0 + 1.45);
    const mains = c.createOscillator();
    mains.type = "sawtooth";
    const m = held(k, mains, 1.3, 0.05 * k.vol, "lowpass", 420, 0.8, 0, 0.01, 1.0);
    mains.frequency.setValueAtTime(120 * r, m.t0);
    mains.frequency.exponentialRampToValueAtTime(38 * r, m.t0 + 1.25);
    m.f.frequency.exponentialRampToValueAtTime(140, m.t0 + 1.25);
    const fan = noiseSrc(k, k.pink);
    if (fan) {
      const f = held(k, fan, 1.6, 0.06 * k.vol, "bandpass", 900 * r, 1.4, 0, 0.01, 1.3);
      f.f.frequency.exponentialRampToValueAtTime(160 * r, f.t0 + 1.5);
    }
  },

  /** A CRT's degauss coil: a hard low thunk and a buzzing swell that dies over half a second. */
  degauss(k: CueKit) {
    const { c } = k;
    const r = k.rate * k.jitter(25);
    k.tone(0.09, 110 * r, 46 * r, 0.2 * k.vol, "sine", 0, 500, 0.002);
    k.noise(k.brown, 0.05, 0.14 * k.vol, 260 * r, 1.2);
    const buzz = c.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 60 * r;
    const b = held(k, buzz, 0.75, 0.06 * k.vol, "lowpass", 700, 1.1, 0.01, 0.015, 0.6);
    b.f.frequency.exponentialRampToValueAtTime(180, b.t0 + 0.7);
    // the shadow mask ringing as the field sweeps across it
    k.tone(0.5, 312 * r, 296 * r, 0.012 * k.vol, "sine", 0.03, 0, 0.01);
  },

  /** The UPS's transfer relay. */
  relay(k: CueKit) {
    const r = k.rate * k.jitter(35);
    k.noise(k.white, 0.005, 0.09 * k.vol, 3200 * r, 2.6);
    k.tone(0.02, 420 * r, 220 * r, 0.06 * k.vol, "square", 0, 1800);
    k.noise(k.pink, 0.012, 0.06 * k.vol, 1700 * r, 2, 0.009);
  },

  /** The UPS on battery: a short piezo beep. */
  upsBeep(k: CueKit) {
    const { c } = k;
    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.value = 2050 * k.rate;
    held(k, osc, 0.16, 0.022 * k.vol, "lowpass", 3800, 0.7, 0, 0.004, 0.02);
  },

  /** A sip: the cup's rim, a slurp, a swallow. */
  sip(k: CueKit) {
    const r = k.rate * k.jitter(40);
    k.noise(k.white, 0.005, 0.05 * k.vol, 2900 * r, 2.4);
    k.noise(k.pink, 0.24, 0.06 * k.vol, 1700 * r, 2.2, 0.06, 900 * r, 0.1);
    k.noise(k.pink, 0.12, 0.05 * k.vol, 520 * r, 1.4, 0.34, 300 * r, 0.02);
    k.tone(0.09, 240 * r, 150 * r, 0.05 * k.vol, "sine", 0.4, 600, 0.01);
  },

  /** Coffee poured into the cup: a stream whose pitch climbs as the cup fills. */
  pour(k: CueKit) {
    const { c } = k;
    const r = k.rate * k.jitter(20);
    const stream = noiseSrc(k, k.pink);
    if (stream) {
      const s = held(k, stream, 1.9, 0.07 * k.vol, "bandpass", 460 * r, 3.2, 0, 0.12, 0.35);
      s.f.frequency.exponentialRampToValueAtTime(1350 * r, s.t0 + 1.8);
      // it glugs: a slow wobble on the level
      const lfo = c.createOscillator();
      lfo.frequency.value = 9 + Math.random() * 4;
      const depth = c.createGain();
      depth.gain.value = 0.025 * k.vol;
      lfo.connect(depth);
      depth.connect(s.env.gain);
      lfo.start(s.t0);
      lfo.stop(s.t0 + 1.95);
      lfo.onended = () => depth.disconnect();
    }
    const splash = noiseSrc(k, k.white);
    if (splash) held(k, splash, 1.8, 0.012 * k.vol, "highpass", 4200, 0.6, 0.05, 0.1, 0.4);
  },

  /** The rubber duck: a nasal, rubbery quack. */
  quack(k: CueKit) {
    const { c } = k;
    const r = k.rate * k.jitter(60);
    const v = k.pick(3);
    [0, 0.17].slice(0, v === 2 ? 2 : 1).forEach((dt, i) => {
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      const q = held(k, osc, 0.15 - i * 0.03, (0.07 - i * 0.02) * k.vol, "bandpass", 1150 * r, 2.6, dt, 0.012, 0.07);
      osc.frequency.setValueAtTime([560, 610, 520][v] * r, q.t0);
      osc.frequency.exponentialRampToValueAtTime([400, 450, 380][v] * r, q.t0 + 0.14);
      q.f.frequency.exponentialRampToValueAtTime(800 * r, q.t0 + 0.14);
    });
    k.noise(k.pink, 0.05, 0.03 * k.vol, 2400 * r, 2, 0.01);
  },

  /** The tip touching the damp sponge: a faint sizzle with a few crackles in it. */
  sizzle(k: CueKit) {
    const hiss = noiseSrc(k, k.white);
    if (hiss) held(k, hiss, 1.1, 0.02 * k.vol, "highpass", 5200, 0.7, 0, 0.05, 0.7);
    for (let i = 0; i < 9; i++) k.noise(k.white, 0.004, (0.02 + Math.random() * 0.03) * k.vol, 3000 + Math.random() * 4000, 3, Math.random() * 0.9);
  },

  /** The NAS writing: heads seeking in short bursts over a low spindle whirr. */
  diskChatter(k: CueKit) {
    const r = k.rate * k.jitter(20);
    k.tone(0.7, 120 * r, 120 * r, 0.012 * k.vol, "sine", 0, 0, 0.1);
    let t = 0;
    const n = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      t += 0.025 + Math.random() * 0.07;
      k.noise(k.pink, 0.006, (0.05 + Math.random() * 0.04) * k.vol, (1700 + Math.random() * 1500) * r, 3.4, t);
      k.tone(0.008, 900 * r, 500 * r, 0.02 * k.vol, "square", t, 2400);
    }
  },
};
