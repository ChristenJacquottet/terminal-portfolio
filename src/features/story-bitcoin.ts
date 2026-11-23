// The first bitcoin, a brass physical coin: flip it and it really lands one way up. Heads is the ₿;
// tails is the back, with its hologram seal. The label says which.
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type Material, type Mesh, type Object3D } from "three";
import type { Feature } from "./types";
import { refreshChip, wobble } from "./story-kit";

let side: "heads" | "tails" | null = null;

/** The coin's back: "VIRES IN NUMERIS" round the rim, a hologram seal in the middle. */
function tails(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(140, 110, 10, 128, 128, 128);
  grad.addColorStop(0, "#f3d27a");
  grad.addColorStop(1, "#b3822b");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(90,60,10,0.55)";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.stroke();
  // the motto, round the rim
  g.fillStyle = "rgba(90,60,10,0.78)";
  g.font = "bold 19px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const words = "VIRES · IN · NUMERIS ·";
  const step = (Math.PI * 1.7) / words.length;
  for (let i = 0; i < words.length; i++) {
    const a = -Math.PI / 2 - (step * (words.length - 1)) / 2 + i * step;
    g.save();
    g.translate(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
    g.rotate(a + Math.PI / 2);
    g.fillText(words[i], 0, 0);
    g.restore();
  }
  // the hologram: silver, with a rainbow sheen and a small B
  const holo = g.createLinearGradient(80, 80, 176, 176);
  for (const [k, col] of [[0, "#d9dde4"], [0.25, "#bfe3e8"], [0.45, "#e6d0ef"], [0.65, "#f1e7c4"], [0.85, "#c9d6ef"], [1, "#d7dbe2"]] as const) holo.addColorStop(k, col);
  g.fillStyle = holo;
  g.beginPath();
  g.arc(128, 132, 46, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(120,120,130,0.6)";
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "rgba(90,96,110,0.55)";
  g.font = "bold 48px Georgia, serif";
  g.fillText("₿", 128, 136);
  g.font = "bold 13px Georgia, serif";
  g.fillStyle = "rgba(90,60,10,0.75)";
  g.fillText("1 BTC", 128, 204);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function coinOf(holder: Object3D): Mesh | null {
  let coin: Mesh | null = null;
  holder.traverse((o) => {
    const m = o as Mesh;
    if (!coin && m.isMesh && Array.isArray(m.material) && m.material.length === 3) coin = m;
  });
  return coin;
}

const bitcoin: Feature = {
  name: "story-bitcoin",
  hotspots: { bitcoin: { kind: "coin", label: "my first bitcoin", hint: "flip it" } },
  label(_object, spot) {
    if (spot.kind !== "coin") return null;
    return ["my first bitcoin", side ? `${side} · flip again` : "flip it · heads or tails"];
  },
  props({ props }) {
    // Re-dress the coin's underside (the cylinder's bottom cap) as its back.
    const holder = props.get("bitcoin");
    const coin = holder && coinOf(holder);
    if (!coin) return;
    const mats = coin.material as Material[];
    const front = mats[1] as MeshStandardMaterial;
    mats[2] = new MeshStandardMaterial({ map: tails(), metalness: front.metalness, roughness: front.roughness });
  },
  actions: {
    async coin({ object, sfx, once, animate, leave }) {
      const coin = coinOf(object);
      if (!coin) return;
      await once(object, async () => {
        leave();
        const lands: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
        // whole turns, plus a half if it lands the other way up from how it lies now
        const now = Math.round(coin.rotation.x / Math.PI) % 2 === 0 ? "heads" : "tails";
        const halves = 6 + (Math.random() < 0.5 ? 0 : 2) + (lands === now ? 0 : 1);
        const x0 = coin.rotation.x;
        const y0 = object.position.y;
        const spin = object.rotation.y;
        sfx("coinFlip", object);
        await animate(860, (t) => {
          object.position.y = y0 + 0.11 * Math.sin(t * Math.PI) ** 0.85;
          coin.rotation.x = x0 + (halves * Math.PI) * (1 - (1 - t) ** 1.4);
          object.rotation.y = spin + 0.6 * t;
        });
        object.position.y = y0;
        coin.rotation.x = x0 + halves * Math.PI;
        // keep the angle small, and the face it shows
        coin.rotation.x = lands === "heads" ? 0 : Math.PI;
        sfx("coinLand", object);
        // it lands on its edge and rings down flat
        const tilt = coin.rotation.z;
        const py = coin.position.y;
        await animate(620, (t) => {
          const a = 0.16 * wobble(t, 4.2, 4.2);
          coin.rotation.z = tilt + a;
          coin.position.y = py + 0.02 * Math.abs(Math.sin(a)); // on its rim, not through the desk
        });
        coin.rotation.z = tilt;
        coin.position.y = py;
        side = lands;
      });
      refreshChip();
    },
  },
};

export default bitcoin;
