// Fixed equipment footprints in metres from the port wall. They apply before a bay streams in.
import type { Vector3 } from "three";

type Footprint = readonly [number, number, number, number]; // minX, maxX, minZ, maxZ
const equipment: Footprint[] = [
  [-4.25, -3.61, 0, 3.5],       // dashboard and engine cover
  [-3.65, -1.92, 0, .90],       // bunks and ladder
  [-3.48, -2.69, 1.16, 1.75],   // driver's seat and levers
  [-3.48, -2.69, 2.18, 2.78],   // navigator's seat
  [-1.92, -1.07, 0, 1.05],      // chair, cases and plant
  [-.92, 1.18, 0, 1.00],        // radio bench
  [1.15, 2.10, 0, .67],         // equipment rack
  [-2.59, -1.92, 2.28, 3.50],   // folding table and stool
  [-1.94, .08, 2.78, 3.50],     // galley
  [.14, 2.02, 2.82, 3.50],      // grow rack
  [2.54, 3.28, 0, .58],         // heater and batteries
  [3.46, 4.25, 0, 1.18],        // water tanks
  [3.83, 4.25, 2.13, 2.59],     // outbound supplies strapped beside the hatch
  [3.00, 4.25, 2.42, 3.50],     // wash closet
];
const radius = .18;
export function clearToStand(x: number, z: number) {
  if (Math.abs(x) > 4.12 - radius || z < radius || z > 3.47 - radius) return false;
  return !equipment.some(([left, right, near, far]) => {
    const dx = Math.max(left - x, 0, x - right);
    const dz = Math.max(near - z, 0, z - far);
    return dx * dx + dz * dz < radius * radius;
  });
}

type Motion = "forward" | "back" | "left" | "right" | "turnLeft" | "turnRight";
const keys: Record<string, Motion> = {
  KeyW: "forward", KeyS: "back", KeyA: "left", KeyD: "right",
  ArrowUp: "forward", ArrowDown: "back", ArrowLeft: "turnLeft", ArrowRight: "turnRight",
};

export function cabinWalk(enabled: () => boolean, request: () => void) {
  const held = new Map<string, Motion>();
  let previous = 0;
  const clear = () => { held.clear(); previous = 0; };
  const hold = (id: string, motion: Motion) => {
    if (!held.size) previous = performance.now();
    held.set(id, motion);
    request();
  };
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", clear);
  window.addEventListener("keydown", e => {
    if (!enabled() || !keys[e.code] || e.altKey || e.ctrlKey || e.metaKey ||
        (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=true], [role=dialog]"))) return;
    e.preventDefault();
    e.stopPropagation(); // the terminal also handles printable keys
    hold(e.code, keys[e.code]);
  }, true);
  window.addEventListener("keyup", e => held.delete(e.code), true);

  const pad = document.createElement("div");
  pad.className = "walk-pad";
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", "Movement controls");
  pad.hidden = true;
  for (const [motion, icon] of [["forward", "↑"], ["left", "←"], ["back", "↓"], ["right", "→"]] as const) {
    const button = document.createElement("button");
    button.textContent = icon;
    button.setAttribute("aria-label", "Move " + motion);
    button.addEventListener("pointerdown", e => {
      if (!enabled()) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      hold("pointer" + e.pointerId, motion);
    });
    const release = (e: PointerEvent) => held.delete("pointer" + e.pointerId);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerup", release);
    pad.append(button);
  }
  return {
    pad, clear,
    step(now: number, head: Vector3, wall: number, yaw: number, turn: (angle: number) => void) {
      if (!enabled()) { if (held.size) clear(); return false; }
      if (!held.size) return false;
      const dt = Math.max(0, Math.min(.08, (now - previous) / 1000));
      previous = now;
      const active = new Set(held.values());
      turn((Number(active.has("turnLeft")) - Number(active.has("turnRight"))) * 1.65 * dt);
      const forward = Number(active.has("forward")) - Number(active.has("back"));
      const side = Number(active.has("right")) - Number(active.has("left"));
      const stride = dt * 1.35 / Math.max(1, Math.hypot(forward, side));
      const dx = (side * Math.cos(yaw) - forward * Math.sin(yaw)) * stride;
      const dz = (-forward * Math.cos(yaw) - side * Math.sin(yaw)) * stride;
      // Resolve each axis independently to slide along a bulkhead when moving diagonally.
      if (clearToStand(head.x + dx, head.z - wall)) head.x += dx;
      if (clearToStand(head.x, head.z + dz - wall)) head.z += dz;
      return true;
    },
  };
}
