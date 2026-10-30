// Web Audio DSP graph, procedural foley synthesiser, loops and Walkman player.
// Loaded as its own chunk by src/audio.ts; never creates an AudioContext or fetches media on its own.
//
// Ambient distance low-pass & volume-ducking curve (`setInside`) adapted from
// henryjeff/portfolio-website (src/Application/Audio/AudioSources.ts),
// Copyright (c) 2022–2024 Henry Heffernan (MIT License).

import type { Cue } from "./audio";

type LoopName = "room" | "hum";

const MASTER_GAIN = 0.42;

const URLS = {
  room: "/audio/room.mp3",
  music: "/audio/music.mp3",
  tapeIn: "/audio/tape-insert.mp3",
  tapeBtn1: "/audio/tape-button.mp3",
  tapeBtn2: "/audio/tape-button-2.mp3",
  phoneUp: "/audio/phone-up.mp3",
  phoneDn: "/audio/phone-down.mp3",
  paper: "/audio/paper.mp3",
  shutter: "/audio/shutter.mp3",
} as const;

let ctx: AudioContext | null = null;
let muted = false;
let inside = 0;

let masterBus: GainNode | null = null;
let cueBus: GainNode | null = null;
let ambFilter: BiquadFilterNode | null = null;
let ambDuck: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
let musicBus: GainNode | null = null;

let whiteBuf: AudioBuffer | null = null;
let pinkBuf: AudioBuffer | null = null;
let brownBuf: AudioBuffer | null = null;

const lastVar: Partial<Record<Cue, number>> = {};
const decoded = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();
let deskWarmed = false;

const wantLoop: Record<LoopName, boolean> = { room: false, hum: false };
let stopRoom: (() => void) | null = null;
let roomTok = 0;
let stopHum: (() => void) | null = null;

let wantMusic = false;
let musicActive: { src: AudioBufferSourceNode; gain: GainNode; t0: number; off: number } | null = null;
let musicOffset = 0;
let musicTok = 0;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const jitter = (cents: number) => 2 ** (((Math.random() * 2 - 1) * cents) / 1200);

function pick(cue: Cue, n: number): number {
  if (n <= 1) return 0;
  let v = (Math.random() * n) | 0;
  if (v === lastVar[cue]) v = (v + 1 + ((Math.random() * (n - 1)) | 0)) % n;
  lastVar[cue] = v;
  return v;
}

function buildNoise(c: AudioContext) {
  const sr = c.sampleRate;
  const len = Math.floor(sr * 1.6);
  whiteBuf = c.createBuffer(1, len, sr);
  pinkBuf = c.createBuffer(1, len, sr);
  brownBuf = c.createBuffer(1, len, sr);
  const w = whiteBuf.getChannelData(0);
  const p = pinkBuf.getChannelData(0);
  const b = brownBuf.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    br = (br + 0.02 * x) / 1.02;
    b[i] = br * 3.2;
  }
  const fade = Math.min(2048, len >> 3);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    p[len - fade + i] = p[len - fade + i] * (1 - a) + p[i] * a;
    b[len - fade + i] = b[len - fade + i] * (1 - a) + b[i] * a;
  }
}

function applyInside(snap: boolean) {
  if (!ctx || !ambFilter || !ambDuck || !musicFilter || !musicBus) return;
  const now = ctx.currentTime;
  const af = 14000 * (1150 / 14000) ** inside;
  const ag = 1 - 0.64 * inside;
  const mf = 13500 * (4800 / 13500) ** inside;
  const mg = 0.32 * (1 - 0.32 * inside);
  if (snap) {
    ambFilter.frequency.setValueAtTime(af, now);
    ambDuck.gain.setValueAtTime(ag, now);
    musicFilter.frequency.setValueAtTime(mf, now);
    musicBus.gain.setValueAtTime(mg, now);
  } else {
    ambFilter.frequency.setTargetAtTime(af, now, 0.11);
    ambDuck.gain.setTargetAtTime(ag, now, 0.11);
    musicFilter.frequency.setTargetAtTime(mf, now, 0.11);
    musicBus.gain.setTargetAtTime(mg, now, 0.11);
  }
}

export function attach(
  c: AudioContext,
  init: { muted: boolean; inside: number; room: boolean; hum: boolean; music: boolean },
) {
  muted = init.muted;
  inside = init.inside;
  wantLoop.room = init.room;
  wantLoop.hum = init.hum;
  wantMusic = init.music;

  if (!ctx) {
    ctx = c;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -10;
    lim.knee.value = 12;
    lim.ratio.value = 6;
    lim.attack.value = 0.003;
    lim.release.value = 0.12;
    lim.connect(c.destination);

    masterBus = c.createGain();
    masterBus.gain.value = muted ? 0 : MASTER_GAIN;
    masterBus.connect(lim);

    cueBus = c.createGain();
    cueBus.connect(masterBus);

    ambFilter = c.createBiquadFilter();
    ambFilter.type = "lowpass";
    ambFilter.Q.value = 0.55;
    ambDuck = c.createGain();
    ambFilter.connect(ambDuck);
    ambDuck.connect(masterBus);

    musicFilter = c.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.Q.value = 0.5;
    musicBus = c.createGain();
    musicFilter.connect(musicBus);
    musicBus.connect(masterBus);

    buildNoise(c);
    applyInside(true);
  }
  if (!muted) {
    syncLoops();
    if (wantMusic) void startMusic();
  }
}

function loadBuf(url: string): Promise<AudioBuffer | null> {
  const hit = decoded.get(url);
  if (hit) return Promise.resolve(hit);
  const p = inflight.get(url);
  if (p) return p;
  if (!ctx) return Promise.resolve(null);
  const c = ctx;
  const task = fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      decoded.set(url, buf);
      inflight.delete(url);
      return buf;
    })
    .catch(() => {
      inflight.delete(url);
      return null;
    });
  inflight.set(url, task);
  return task;
}

function warmDesk() {
  if (deskWarmed || muted || !ctx) return;
  deskWarmed = true;
  for (const u of [URLS.tapeIn, URLS.tapeBtn1, URLS.tapeBtn2, URLS.phoneUp, URLS.phoneDn, URLS.paper, URLS.shutter]) {
    void loadBuf(u);
  }
}

function nb(
  c: AudioContext,
  out: AudioNode,
  buf: AudioBuffer | null,
  dur: number,
  gain: number,
  freq: number,
  q = 2,
  dt = 0,
  freqEnd = 0,
  atk = 0.0015,
) {
  if (!buf) return;
  const t0 = c.currentTime + dt;
  const d = Math.max(0.004, dur);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(d * 0.45, atk));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.setValueAtTime(q, t0);
  f.frequency.setValueAtTime(clamp(freq, 30, 18000), t0);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(clamp(freqEnd, 30, 18000), t0 + d);

  src.connect(f);
  f.connect(env);
  env.connect(out);
  src.start(t0, Math.random() * Math.max(0.01, buf.duration - 0.05));
  src.stop(t0 + d + 0.01);
  src.onended = () => env.disconnect();
}

function td(
  c: AudioContext,
  out: AudioNode,
  dur: number,
  f0: number,
  f1: number,
  gain: number,
  type: OscillatorType = "triangle",
  dt = 0,
  lp = 0,
  atk = 0.0012,
) {
  const t0 = c.currentTime + dt;
  const d = Math.max(0.006, dur);
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(clamp(f0, 20, 16000), t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(clamp(f1, 20, 16000), t0 + d);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(d * 0.4, atk));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

  if (lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(lp, t0);
    osc.connect(f);
    f.connect(env);
  } else {
    osc.connect(env);
  }
  env.connect(out);
  osc.start(t0);
  osc.stop(t0 + d + 0.008);
  osc.onended = () => env.disconnect();
}

function playSample(url: string, gain: number, rate: number, offset = 0) {
  if (!ctx || !cueBus) return;
  const fire = (buf: AudioBuffer) => {
    if (muted || !ctx || !cueBus) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clamp(rate, 0.35, 3);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(cueBus);
    src.start(ctx.currentTime, offset);
    src.onended = () => g.disconnect();
  };
  const hit = decoded.get(url);
  if (hit) fire(hit);
  else void loadBuf(url).then((b) => b && fire(b));
}

export function playCue(cue: Cue, vol: number, rate: number) {
  if (muted || !ctx || !cueBus) return;
  const c = ctx;
  const out = cueBus;

  switch (cue) {
    case "key": {
      const v = pick(cue, 6);
      const r = rate * jitter(42);
      nb(c, out, pinkBuf, 0.0065, 0.105 * vol, [2050, 2280, 1920, 2460, 2150, 2360][v] * r, 2.1);
      nb(c, out, pinkBuf, 0.015, 0.065 * vol, 720 * r, 1.4, 0.002);
      td(c, out, [0.026, 0.024, 0.03, 0.022, 0.028, 0.025][v], [235, 255, 215, 270, 225, 248][v] * r, 102 * r, 0.11 * vol, "triangle", 0, 1100);
      break;
    }
    case "keySpace": {
      const v = pick(cue, 4);
      const r = rate * jitter(35);
      nb(c, out, pinkBuf, 0.006, 0.085 * vol, 2250 * r, 2.4);
      nb(c, out, pinkBuf, 0.024, 0.1 * vol, 440 * r, 1.5, 0.002);
      td(c, out, 0.044, [152, 164, 145, 158][v] * r, 74 * r, 0.145 * vol, "triangle", 0, 800);
      break;
    }
    case "keyReturn": {
      const v = pick(cue, 4);
      const r = rate * jitter(35);
      nb(c, out, pinkBuf, 0.0055, 0.11 * vol, 2150 * r, 2.2);
      nb(c, out, pinkBuf, 0.022, 0.095 * vol, 580 * r, 1.5, 0.008);
      td(c, out, 0.048, [188, 202, 178, 195][v] * r, 82 * r, 0.15 * vol, "triangle", 0.006, 950);
      break;
    }
    case "click": {
      const v = pick(cue, 4);
      const r = rate * jitter(45);
      nb(c, out, pinkBuf, 0.005, 0.095 * vol, [2350, 2600, 2180, 2480][v] * r, 2.4);
      td(c, out, 0.015, 320 * r, 135 * r, 0.08 * vol, "sine");
      break;
    }
    case "switch": {
      const v = pick(cue, 3);
      const r = rate * jitter(38);
      const g = [0.018, 0.022, 0.015][v] / clamp(rate, 0.5, 2);
      nb(c, out, whiteBuf, 0.006, 0.12 * vol, 2900 * r, 2.6);
      td(c, out, 0.014, 540 * r, 240 * r, 0.08 * vol);
      nb(c, out, pinkBuf, 0.014, 0.15 * vol, 1420 * r, 1.9, g);
      td(c, out, 0.032, 240 * r, 98 * r, 0.13 * vol, "triangle", g, 1200);
      break;
    }
    case "diskInsert": {
      const v = pick(cue, 3);
      const r = rate * jitter(35);
      const d = [0.16, 0.18, 0.15][v];
      nb(c, out, pinkBuf, d, 0.13 * vol, 720 * r, 1.7, 0, 1380 * r, 0.035);
      td(c, out, 0.032, 195 * r, 88 * r, 0.12 * vol, "triangle", d - 0.01);
      nb(c, out, whiteBuf, 0.009, 0.14 * vol, 2050 * r, 2.3, d + 0.042);
      td(c, out, 0.026, 360 * r, 140 * r, 0.11 * vol, "triangle", d + 0.042);
      break;
    }
    case "diskRead": {
      const v = pick(cue, 4);
      const r = rate * jitter(30);
      const steps = [
        [0.02, 0.048, 0.076, 0.104, 0.185, 0.215, 0.245],
        [0.015, 0.042, 0.069, 0.145, 0.175, 0.205, 0.295, 0.325],
        [0.025, 0.055, 0.085, 0.115, 0.145, 0.235, 0.265],
        [0.018, 0.046, 0.125, 0.153, 0.181, 0.209, 0.29],
      ][v];
      const d = steps[steps.length - 1] + 0.11;
      nb(c, out, brownBuf, d, 0.12 * vol, 430 * r, 2, 0, 0, 0.045);
      td(c, out, d, 96 * r, 99 * r, 0.035 * vol, "sawtooth", 0, 360, 0.04);
      steps.forEach((dt, i) => {
        const s = dt / clamp(rate, 0.5, 2);
        nb(c, out, pinkBuf, 0.011, 0.13 * vol, (1040 + (i % 3) * 110) * r, 3.4, s);
        td(c, out, 0.012, 255 * r, 150 * r, 0.055 * vol, "square", s, 900);
      });
      break;
    }
    case "diskEject": {
      const v = pick(cue, 3);
      const r = rate * jitter(38);
      nb(c, out, whiteBuf, 0.008, 0.14 * vol, 2200 * r, 2.2);
      td(c, out, 0.028, 280 * r, 430 * r, 0.1 * vol);
      nb(c, out, pinkBuf, [0.15, 0.17, 0.14][v], 0.12 * vol, 1320 * r, 1.6, 0.022, 640 * r, 0.018);
      break;
    }
    case "tapeInsert": {
      const v = pick(cue, 3);
      playSample(URLS.tapeIn, 0.42 * vol, rate * [0.96, 1, 1.045][v] * jitter(25));
      break;
    }
    case "tapeButton": {
      const v = pick(cue, 2);
      playSample(v ? URLS.tapeBtn2 : URLS.tapeBtn1, 0.44 * vol, rate * jitter(40));
      break;
    }
    case "lidOpen": {
      const v = pick(cue, 3);
      const r = rate * jitter(40);
      nb(c, out, whiteBuf, 0.007, 0.11 * vol, 2150 * r, 2.4);
      td(c, out, 0.022, 290 * r, 420 * r, 0.08 * vol);
      nb(c, out, pinkBuf, [0.13, 0.15, 0.12][v], 0.085 * vol, 520 * r, 2.5, 0.014, 980 * r, 0.025);
      break;
    }
    case "lidClose": {
      const v = pick(cue, 3);
      const r = rate * jitter(38);
      const h = [0.032, 0.038, 0.028][v];
      nb(c, out, pinkBuf, 0.04, 0.07 * vol, 780 * r, 1.4, 0, 340 * r, 0.015);
      td(c, out, 0.052, 175 * r, 68 * r, 0.17 * vol, "triangle", h, 700);
      nb(c, out, whiteBuf, 0.008, 0.12 * vol, 2300 * r, 2.3, h + 0.003);
      break;
    }
    case "phoneUp": {
      const v = pick(cue, 3);
      const r = rate * [0.97, 1, 1.035][v] * jitter(25);
      playSample(URLS.phoneUp, 0.52 * vol, r);
      td(c, out, 0.055, 585 * r, 610 * r, 0.022 * vol, "sine", 0.04);
      break;
    }
    case "phoneDown": {
      const v = pick(cue, 3);
      const r = rate * [0.97, 1, 1.03][v] * jitter(25);
      playSample(URLS.phoneDn, 0.5 * vol, r);
      td(c, out, 0.24, 1590 * r, 1590 * r, 0.018 * vol, "sine", 0.035, 0, 0.002);
      td(c, out, 0.17, 2410 * r, 2410 * r, 0.011 * vol, "sine", 0.035, 0, 0.002);
      break;
    }
    case "paper": {
      const v = pick(cue, 4);
      playSample(URLS.paper, 0.55 * vol, rate * [0.94, 1, 1.06, 1.11][v] * jitter(30), [0, 0.03, 0.01, 0.05][v]);
      break;
    }
    case "tap": {
      const v = pick(cue, 4);
      const r = rate * jitter(45);
      const [m1, m2] = [
        [330, 780],
        [415, 965],
        [285, 650],
        [475, 1110],
      ][v];
      nb(c, out, pinkBuf, 0.005, 0.08 * vol, 1450 * r, 1.6);
      td(c, out, 0.048, m1 * r, m1 * 0.88 * r, 0.12 * vol, "sine");
      td(c, out, 0.028, m2 * r, m2 * 0.94 * r, 0.055 * vol, "sine");
      break;
    }
    case "clapper": {
      const v = pick(cue, 3);
      const r = rate * [0.96, 1, 1.05][v] * jitter(25);
      nb(c, out, whiteBuf, 0.013, 0.26 * vol, 2450 * r, 1.5, 0, 0, 0.0006);
      nb(c, out, pinkBuf, 0.055, 0.2 * vol, 1120 * r, 2.2, 0.001, 0, 0.001);
      td(c, out, 0.028, 640 * r, 210 * r, 0.2 * vol, "triangle", 0, 0, 0.0006);
      break;
    }
    case "shutter": {
      const v = pick(cue, 3);
      playSample(URLS.shutter, 0.46 * vol, rate * [0.97, 1, 1.04][v] * jitter(22));
      break;
    }
    case "spin": {
      const v = pick(cue, 3);
      if (!pinkBuf) break;
      const r = rate * jitter(35);
      const d = [0.56, 0.64, 0.5][v];
      const t0 = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = pinkBuf;
      src.loop = true;

      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 3.2;
      bp.frequency.setValueAtTime(240 * r, t0);
      bp.frequency.exponentialRampToValueAtTime(620 * r, t0 + d * 0.24);
      bp.frequency.exponentialRampToValueAtTime(195 * r, t0 + d);

      const flut = c.createGain();
      flut.gain.value = 0.82;
      const lfo = c.createOscillator();
      lfo.frequency.setValueAtTime(9.5 * r, t0);
      lfo.frequency.linearRampToValueAtTime(3.2 * r, t0 + d);
      const dep = c.createGain();
      dep.gain.value = 0.18;
      lfo.connect(dep);
      dep.connect(flut.gain);

      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(0.14 * vol, t0 + d * 0.16);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

      src.connect(bp);
      bp.connect(flut);
      flut.connect(env);
      env.connect(out);
      src.start(t0, Math.random() * Math.max(0.01, pinkBuf.duration - 0.1));
      lfo.start(t0);
      src.stop(t0 + d + 0.01);
      lfo.stop(t0 + d + 0.01);
      src.onended = () => {
        dep.disconnect();
        env.disconnect();
      };
      break;
    }
    case "boot": {
      const v = pick(cue, 2);
      const r = rate * (v ? 1.008 : 1) * jitter(10);
      td(c, out, 0.065, 78 * r, 42 * r, 0.11 * vol, "sine");

      const t0 = c.currentTime + 0.04;
      const osc = c.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(1000 * r, t0);
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 320;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2900;
      const env = c.createGain();
      const pk = Math.max(0.0002, 0.095 * vol);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(pk, t0 + 0.004);
      env.gain.setValueAtTime(pk, t0 + 0.097);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.105);
      osc.connect(hp);
      hp.connect(lp);
      lp.connect(env);
      env.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.115);
      osc.onended = () => env.disconnect();

      nb(c, out, pinkBuf, 0.01, 0.09 * vol, 1120 * r, 3.2, 0.185);
      nb(c, out, pinkBuf, 0.01, 0.09 * vol, 1120 * r, 3.2, 0.215);
      break;
    }
  }
}

function fadeStop(gain: GainNode, nodes: AudioScheduledSourceNode[], ms = 340) {
  if (!ctx) return;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
  gain.gain.linearRampToValueAtTime(0.0001, t + ms / 1000);
  setTimeout(() => {
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* stopped */
      }
    }
    gain.disconnect();
  }, ms + 40);
}

function startRoom() {
  if (stopRoom || !wantLoop.room || muted || !ctx || !ambFilter) return;
  const tok = ++roomTok;
  void loadBuf(URLS.room).then((buf) => {
    if (!buf || tok !== roomTok || !wantLoop.room || muted || !ctx || !ambFilter || stopRoom) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.65);
    gain.connect(ambFilter);

    const rain = ctx.createBufferSource();
    rain.buffer = buf;
    rain.loop = true;
    rain.connect(gain);
    rain.start(now, Math.random() * Math.max(0.1, buf.duration - 1));

    const srcs: AudioScheduledSourceNode[] = [rain];
    if (brownBuf) {
      const city = ctx.createBufferSource();
      city.buffer = brownBuf;
      city.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 145;
      const cg = ctx.createGain();
      cg.gain.value = 0.16;
      city.connect(lp);
      lp.connect(cg);
      cg.connect(gain);
      city.start(now);
      srcs.push(city);
    }
    stopRoom = () => fadeStop(gain, srcs, 350);
  });
}

function endRoom() {
  roomTok++;
  const fn = stopRoom;
  stopRoom = null;
  fn?.();
}

function startHum() {
  if (stopHum || !wantLoop.hum || muted || !ctx || !ambFilter || !brownBuf) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(1, now + 0.45);
  gain.connect(ambFilter);

  const air = ctx.createBufferSource();
  air.buffer = brownBuf;
  air.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 320;
  bp.Q.value = 0.85;
  const ag = ctx.createGain();
  ag.gain.value = 0.048;
  air.connect(bp);
  bp.connect(ag);
  ag.connect(gain);
  air.start(now);

  const srcs: AudioScheduledSourceNode[] = [air];
  for (const [f, v] of [
    [60, 0.011],
    [120, 0.006],
    [7850, 0.0014],
  ] as const) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = v;
    o.connect(g);
    g.connect(gain);
    o.start(now);
    srcs.push(o);
  }
  stopHum = () => fadeStop(gain, srcs, 300);
}

function endHum() {
  const fn = stopHum;
  stopHum = null;
  fn?.();
}

function syncLoops() {
  if (muted || !ctx) return;
  if (wantLoop.room || wantLoop.hum) warmDesk();
  if (wantLoop.room) startRoom();
  else endRoom();
  if (wantLoop.hum) startHum();
  else endHum();
}

async function startMusic(): Promise<void> {
  if (musicActive || !wantMusic || muted || !ctx || !musicFilter) return;
  const tok = ++musicTok;
  const buf = await loadBuf(URLS.music);
  if (!buf || tok !== musicTok || !wantMusic || muted || !ctx || !musicFilter || musicActive) return;

  const now = ctx.currentTime;
  const off = buf.duration > 0 ? musicOffset % buf.duration : 0;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.setValueAtTime(0.93, now);
  src.playbackRate.linearRampToValueAtTime(1, now + 0.055);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(1, now + 0.14);
  src.connect(gain);
  gain.connect(musicFilter);
  src.start(now, off);
  musicActive = { src, gain, t0: now, off };
}

function endMusic() {
  musicTok++;
  if (!musicActive || !ctx) return;
  const cur = musicActive;
  musicActive = null;
  const dur = cur.src.buffer?.duration ?? 0;
  if (dur > 0) musicOffset = (cur.off + Math.max(0, ctx.currentTime - cur.t0)) % dur;
  fadeStop(cur.gain, [cur.src], 120);
}

export function setLoop(name: LoopName, on: boolean) {
  wantLoop[name] = on;
  if (!on) return name === "room" ? endRoom() : endHum();
  if (muted || !ctx) return;
  warmDesk();
  if (name === "room") startRoom();
  else startHum();
}

export async function setMusic(on: boolean): Promise<void> {
  wantMusic = on;
  if (!on) return endMusic();
  if (!muted && ctx) await startMusic();
}

export function updateInside(t: number) {
  inside = t;
  if (inside < 0.99 && !muted && ctx) warmDesk();
  applyInside(false);
}

export function updateMuted(m: boolean) {
  muted = m;
  if (!ctx || !masterBus) return;
  if (muted) {
    masterBus.gain.cancelScheduledValues(ctx.currentTime);
    masterBus.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
    endRoom();
    endHum();
    endMusic();
  } else {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    masterBus.gain.cancelScheduledValues(ctx.currentTime);
    masterBus.gain.setTargetAtTime(MASTER_GAIN, ctx.currentTime, 0.02);
    syncLoops();
    if (wantMusic) void startMusic();
  }
}
