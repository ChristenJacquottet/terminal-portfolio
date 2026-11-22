// A racquet rally with the tennis ball: click it and it's batted up; it falls back under gravity
// and you have to click it again before it lands. The count goes on the PVM's status page and in
// the hover chip; the best rally is kept. A miss and it drops, bounces, rolls a little:
// "rally: 7 · best 12". The racquet by the desk hits it too.
import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type Object3D } from "three";
import { arcadeOn } from "./games-arcade";
import { loadScores, saveScore } from "./games-screen";
import type { DeskApi, Feature } from "./types";

const G = 6.2; // m/s²: a desk-sized gravity, slow enough to catch
const RADIUS = 0.0335;
const REACH = 0.16; // how far from where it lives the ball may wander (m)
const APEX = 0.26; // how high a hit sends it above the desk (m), give or take

let desk: DeskApi | null = null;
let ball: Object3D | null = null;
let blob: Object3D | null = null;
let sphere: Object3D | null = null; // the ball itself, inside the holder that sits it on the desk
let reach: Object3D | null = null; // a bigger, invisible target while it flies
const home = new Vector3();
const pos = new Vector3();
const vel = new Vector3();
let ground = 0;
let state: "rest" | "air" | "bounce" | "roll" = "rest";
let rally = 0;
let best = 0;
let footerTimer = 0;
let running = false;

const line = () => `rally: ${rally} · best ${Math.max(best, rally)}`;

function show() {
  // the chip, if it's showing the ball right now
  const chip = document.querySelector<HTMLElement>(".prop-label");
  if (chip && !chip.hidden && chip.querySelector("b")?.textContent === "tennis ball") {
    let span = chip.querySelector("span");
    if (!span) chip.append((span = document.createElement("span")));
    span.textContent = hint();
  }
  // the PVM's status page footer
  const pvm = desk?.pvm();
  if (!pvm) return;
  window.clearTimeout(footerTimer);
  pvm.state.footer = rally || best ? line() : null;
  if (!arcadeOn()) pvm.repaint();
  if (state === "rest" || state === "roll") {
    footerTimer = window.setTimeout(() => {
      if (state === "air") return;
      pvm.state.footer = null;
      if (!arcadeOn()) pvm.repaint();
    }, 15000);
  }
}

const hint = () => (rally ? line() : best ? `keep it up · best ${best}` : "keep it up");

/** A hit: up it goes, drifting a little, pulled back towards where it lives. */
function bat(volume = 1) {
  if (!desk || !ball) return;
  if (state === "air") rally++;
  else {
    rally = 1;
    pos.copy(ball.position);
  }
  state = "air";
  // up to about the same height whenever it's hit, so a rally keeps a rhythm
  const rise = Math.max(0.06, ground + APEX + Math.random() * 0.05 - pos.y);
  const back = home.clone().sub(pos).multiplyScalar(1.6);
  vel.set(back.x + (Math.random() - 0.5) * 0.12, Math.sqrt(2 * G * rise), back.z + (Math.random() - 0.5) * 0.12);
  desk.sound?.play("ballHit", { volume });
  show();
  void fly();
}

function miss() {
  if (rally > best) {
    best = rally;
    saveScore("rally", best);
  }
  show();
}

/** Steps the ball under gravity until it's at rest again, a frame at a time (the desk's animate). */
async function fly() {
  if (running || !desk || !ball) return;
  running = true;
  let last = performance.now();
  const b = ball;
  const step = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === "air" || state === "bounce") {
      vel.y -= G * dt;
      pos.addScaledVector(vel, dt);
      if (pos.y <= ground && vel.y < 0) {
        pos.y = ground;
        const hit = -vel.y;
        if (state === "air") {
          // it got away: a miss. It drops, bounces and rolls off a little way.
          state = "bounce";
          const away = Math.random() * Math.PI * 2;
          const toHome = home.clone().sub(pos);
          const dir = toHome.length() > REACH * 0.5 ? Math.atan2(toHome.z, toHome.x) : away;
          vel.x = Math.cos(dir) * 0.22;
          vel.z = Math.sin(dir) * 0.22;
          miss();
        }
        desk!.sound?.play("ballBounce", { volume: Math.min(1, hit / 1.8) });
        vel.y = hit * 0.42;
        if (vel.y < 0.28) {
          vel.y = 0;
          state = "roll";
        }
      }
    } else if (state === "roll") {
      vel.multiplyScalar(Math.exp(-2.6 * dt));
      pos.addScaledVector(vel, dt);
      pos.y = ground;
      if (Math.hypot(vel.x, vel.z) < 0.008) state = "rest";
    }
    // stay on the desk
    const off = pos.clone().sub(home).setY(0);
    if (off.length() > REACH) {
      pos.sub(off.setLength(off.length() - REACH));
      vel.x *= -0.4;
      vel.z *= -0.4;
    }
    b.position.copy(pos);
    if (reach) reach.visible = state === "air";
    // it rolls the way it goes, and spins a little in the air
    const speed = Math.hypot(vel.x, vel.z);
    if (sphere && speed > 1e-4) {
      sphere.rotation.z -= (vel.x / RADIUS) * dt * (state === "air" ? 0.3 : 1);
      sphere.rotation.x += (vel.z / RADIUS) * dt * (state === "air" ? 0.3 : 1);
    }
    if (blob) {
      // its shadow stays on the desk, smaller and fainter the higher it goes
      const h = pos.y - ground;
      blob.position.set(pos.x, blob.position.y, pos.z);
      blob.scale.setScalar(Math.max(0.35, 1 - h * 2.4));
    }
  };
  try {
    while (state !== "rest" && desk) await desk.animate(400, step);
  } finally {
    running = false;
  }
  show();
}

const rallyFeature: Feature = {
  name: "games-rally",
  hotspots: {
    ball: { kind: "games-rally", label: "tennis ball", hint: "keep it up" },
    racquet: { kind: "games-rally", label: "a wooden racquet", hint: "tennis at Taylor" },
  },
  label(object, spot) {
    if (spot.kind !== "games-rally") return null;
    if (object.name === "ball") return ["tennis ball", hint()];
    return ["a wooden racquet", best ? `tennis at Taylor · best rally ${best}` : "tennis at Taylor · hit the ball"];
  },
  actions: {
    async "games-rally"({ object, animate }) {
      if (!desk || !ball) return;
      if (object.name === "ball") return bat();
      // the racquet: a short swing on its lean against the wall, and the ball goes up
      bat(0.9);
      const tilt = object.rotation.z;
      await animate(520, (t) => {
        object.rotation.z = tilt + 0.09 * Math.sin(t * Math.PI) * Math.exp(-2 * t);
      });
      object.rotation.z = tilt;
    },
  },
  onDesk(d) {
    desk = d;
    ball = d.props.get("ball") ?? null;
    if (!ball) return;
    home.copy(ball.position);
    pos.copy(home);
    ground = home.y;
    best = loadScores().rally ?? 0;
    // The ball's soft contact shadow rides on the ball; give it to the desk so it stays down.
    for (const c of [...ball.children]) {
      const m = c as Mesh;
      if (m.isMesh && (m.material as MeshBasicMaterial).transparent && Math.abs(m.position.y - 0.0006) < 1e-3) {
        ball.parent?.attach(m);
        blob = m;
      } else if (m.isMesh) sphere ??= m;
    }
    // An invisible, bigger target round it: a moving ball 7 cm across is hard to click.
    reach = new Mesh(new SphereGeometry(RADIUS * 2.2, 12, 8), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    reach.name = "ball-reach";
    reach.position.copy(sphere?.position ?? new Vector3(0, RADIUS, 0));
    reach.visible = false;
    ball.add(reach);
  },
};

export default rallyFeature;
