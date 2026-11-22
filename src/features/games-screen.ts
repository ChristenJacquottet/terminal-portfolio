// The arcade's phosphor: a 5x7 pixel font, the P1 greens of the PVM's status page (alive.ts
// `drawPvmStatus`), and the glass over it (glow, a little persistence, scanlines, vignette).
// Not a feature (no default export): games-arcade.ts and the cartridges draw with it.

export const GREEN = {
  bright: "#72f592",
  mid: "#46b965",
  dim: "#236236",
  faint: "#13361e",
  glow: "rgba(100, 245, 140, 0.55)",
};

// Each glyph is 7 rows of 5 bits, one base-32 digit per row (generated from readable art).
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ .:-!?/'><·^v";
const ROWS =
  "ehjlphe4c4444eeh1248vv2421he26aiv22vgu11he68guhhev124888ehhehheehhf12cehhvhhhuhhuhhuehgggheuhhhhhuvgguggvvggugggehgnhhfhhhvhhhe44444e72222ichikokihggggggvhrllhhhhhpljhhehhhhheuhhugggehhhliduhhukihfgge11uv444444hhhhhhehhhhha4hhhlllahha4ahhhha4444v1248gv000000000000cc0cc0cc0000e0004444404eh1240401248g044800008421248248g84200040004el44444444le4";
const GLYPHS = new Map<string, number[]>();
for (let i = 0; i < CHARS.length; i++) GLYPHS.set(CHARS[i], [...ROWS.slice(i * 7, i * 7 + 7)].map((d) => parseInt(d, 32)));

/** Width in canvas pixels of `text` at `scale` (each font pixel is scale × scale). */
export const textWidth = (text: string, scale: number) => Math.max(0, text.length * 6 * scale - scale);

/** Pixel text, top-left at (x, y); align "center" centres it on x, "right" ends it at x. */
export function pixelText(g: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string, align: "left" | "center" | "right" = "left") {
  const w = textWidth(text, scale);
  let cx = Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
  g.fillStyle = color;
  for (const ch of text) {
    const rows = GLYPHS.get(ch) ?? GLYPHS.get(ch.toUpperCase());
    if (rows) {
      for (let r = 0; r < 7; r++) {
        const bits = rows[r];
        if (!bits) continue;
        for (let c = 0; c < 5; c++) if (bits & (16 >> c)) g.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += 6 * scale;
  }
}

export const pad = (n: number, width = 6) => String(Math.max(0, Math.floor(n))).padStart(width, "0");

/**
 * The tube: draws `content` (in greens, on a transparent layer) onto `g` the way the PVM shows
 * its status page: a deep phosphor base with a soft bloom, the content with its glow, a trace
 * of the last frame (P1 persistence), then the aperture-grille scanlines, the curved glass's
 * vignette and the reflection arc.
 */
export function createTube(W: number, H: number) {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  };
  let layer = make();
  let ghost = make();
  return (g: CanvasRenderingContext2D, content: (l: CanvasRenderingContext2D) => void) => {
    [layer, ghost] = [ghost, layer];
    const l = layer.getContext("2d")!;
    l.clearRect(0, 0, W, H);
    content(l);

    g.save();
    g.fillStyle = "#040b06";
    g.fillRect(0, 0, W, H);
    const bloom = g.createRadialGradient(W * 0.5, H * 0.48, 24, W * 0.5, H * 0.5, W * 0.62);
    bloom.addColorStop(0, "#0c2413");
    bloom.addColorStop(0.7, "#06140a");
    bloom.addColorStop(1, "#020703");
    g.fillStyle = bloom;
    g.fillRect(0, 0, W, H);

    g.globalAlpha = 0.2; // what was lit a tick ago still glows faintly
    g.drawImage(ghost, 0, 0);
    g.globalAlpha = 1;
    g.shadowColor = GREEN.glow;
    g.shadowBlur = 9;
    g.drawImage(layer, 0, 0);
    g.shadowBlur = 0;
    g.restore();

    g.fillStyle = "rgba(0, 0, 0, 0.24)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

    const edge = g.createRadialGradient(W * 0.5, H * 0.5, W * 0.34, W * 0.5, H * 0.5, W * 0.68);
    edge.addColorStop(0, "rgba(0, 0, 0, 0)");
    edge.addColorStop(0.78, "rgba(0, 0, 0, 0.16)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0.72)");
    g.fillStyle = edge;
    g.fillRect(0, 0, W, H);

    g.strokeStyle = "rgba(180, 255, 205, 0.06)";
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(28, 86);
    g.quadraticCurveTo(34, 28, 128, 24);
    g.stroke();
  };
}

// ── high scores, kept in this browser ─────────────────────────────────────────────────────────
const KEY = "cjsh.arcade";

export function loadScores(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Saves `score` for `game` if it beats the best; returns whether it did. */
export function saveScore(game: string, score: number): boolean {
  const all = loadScores();
  if (!(score > (all[game] ?? 0))) return false;
  all[game] = score;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // private mode: the score lives until the page closes
  }
  return true;
}
