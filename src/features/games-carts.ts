// The cartridges the PVM plays: SNAKE, BLOCKS (falling blocks) and PONG. Pure game state and
// drawing on a 512 x 384 phosphor layer; games-arcade.ts runs them (ticks, keys, sound, the tube).
// Not a feature (no default export).
import { GREEN, pad, pixelText } from "./games-screen";

export type Dir = "up" | "down" | "left" | "right";
/** What a step or a key press did: a sound to blip, whether anything changed, whether it's over. */
export type Ev = { sound?: string; changed?: boolean; over?: boolean };

export type Cart = {
  id: string;
  title: string;
  /** Controls, for the title screen. */
  controls: string;
  /** Milliseconds until the next step, right now. */
  tick: () => number;
  reset: () => void;
  press: (key: Dir | "fire") => Ev;
  step: (held: ReadonlySet<Dir>) => Ev;
  draw: (l: CanvasRenderingContext2D) => void;
  score: () => number;
};

export const W = 512;
export const H = 384;
/** The playfield, inside the tube's curve and under the score line. */
const TOP = 58;
const BOTTOM = 350;
const LEFT = 32;
const RIGHT = 480;

/** The score line every cartridge shares: title left, score right, a dim rule under it. */
export function hud(l: CanvasRenderingContext2D, title: string, score: number, best: number) {
  pixelText(l, title, LEFT, 26, 2, GREEN.bright);
  pixelText(l, `HI ${pad(best)}`, 300, 26, 2, GREEN.dim, "right");
  pixelText(l, pad(score), RIGHT, 26, 2, GREEN.bright, "right");
  l.fillStyle = GREEN.dim;
  l.fillRect(LEFT, 46, RIGHT - LEFT, 2);
}

const rand = (n: number) => Math.floor(Math.random() * n);

// ── SNAKE ─────────────────────────────────────────────────────────────────────────────────────
export function snake(): Cart {
  const C = 14;
  const COLS = Math.floor((RIGHT - LEFT) / C);
  const ROWS = Math.floor((BOTTOM - TOP) / C);
  const X0 = LEFT + Math.floor((RIGHT - LEFT - COLS * C) / 2);
  const Y0 = TOP + Math.floor((BOTTOM - TOP - ROWS * C) / 2);
  type P = { x: number; y: number };
  let body: P[] = [];
  let dir: P = { x: 1, y: 0 };
  const queue: P[] = [];
  let food: P = { x: 0, y: 0 };
  let score = 0;
  let dead = false;

  const placeFood = () => {
    for (let i = 0; i < 500; i++) {
      const p = { x: rand(COLS), y: rand(ROWS) };
      if (!body.some((b) => b.x === p.x && b.y === p.y)) return void (food = p);
    }
  };
  const vec: Record<Dir, P> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

  return {
    id: "snake",
    title: "SNAKE",
    controls: "ARROWS OR WASD",
    tick: () => Math.max(68, 130 - body.length * 2),
    score: () => score,
    reset() {
      const y = Math.floor(ROWS / 2);
      body = [0, 1, 2, 3].map((i) => ({ x: 8 - i, y }));
      dir = { x: 1, y: 0 };
      queue.length = 0;
      score = 0;
      dead = false;
      placeFood();
    },
    press(key) {
      if (key === "fire") return {};
      const v = vec[key];
      const last = queue[queue.length - 1] ?? dir;
      if (queue.length < 2 && !(v.x === -last.x && v.y === -last.y) && !(v.x === last.x && v.y === last.y)) queue.push(v);
      return {};
    },
    step() {
      if (dead) return {};
      dir = queue.shift() ?? dir;
      const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      const eats = head.x === food.x && head.y === food.y;
      const hitsSelf = body.slice(0, eats ? body.length : body.length - 1).some((b) => b.x === head.x && b.y === head.y);
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || hitsSelf) {
        dead = true;
        return { changed: true, over: true };
      }
      body.unshift(head);
      if (eats) {
        score += 10;
        placeFood();
        return { changed: true, sound: "arcadeEat" };
      }
      body.pop();
      return { changed: true };
    },
    draw(l) {
      l.strokeStyle = GREEN.dim;
      l.lineWidth = 2;
      l.strokeRect(X0 - 3, Y0 - 3, COLS * C + 6, ROWS * C + 6);
      // the food: a small cross, so it reads apart from the snake
      const fx = X0 + food.x * C;
      const fy = Y0 + food.y * C;
      l.fillStyle = GREEN.bright;
      l.fillRect(fx + 5, fy + 1, 4, C - 2);
      l.fillRect(fx + 1, fy + 5, C - 2, 4);
      body.forEach((b, i) => {
        l.fillStyle = i === 0 ? GREEN.bright : i < body.length * 0.6 ? GREEN.mid : GREEN.dim;
        l.fillRect(X0 + b.x * C + 1, Y0 + b.y * C + 1, C - 2, C - 2);
      });
      if (dead) {
        l.fillStyle = "#000";
        const h = body[0];
        l.clearRect(X0 + h.x * C + 4, Y0 + h.y * C + 4, C - 8, C - 8);
      }
    },
  };
}

// ── BLOCKS ────────────────────────────────────────────────────────────────────────────────────
const SHAPES: number[][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]], // I
  [[0, 0], [1, 0], [0, 1], [1, 1]], // O
  [[1, 0], [0, 1], [1, 1], [2, 1]], // T
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  [[0, 0], [0, 1], [1, 1], [2, 1]], // J
  [[2, 0], [0, 1], [1, 1], [2, 1]], // L
];

export function blocks(): Cart {
  const C = 14;
  const COLS = 10;
  const ROWS = 20;
  const X0 = Math.round((W - COLS * C) / 2);
  const Y0 = TOP + 2;
  let well: number[][] = [];
  type Piece = { kind: number; cells: number[][]; x: number; y: number };
  let piece: Piece;
  let next = rand(7);
  let score = 0;
  let lines = 0;
  let flash: number[] = []; // rows just cleared, shown for one tick
  let dead = false;

  const level = () => Math.floor(lines / 10);
  const fits = (cells: number[][], x: number, y: number) =>
    cells.every(([cx, cy]) => {
      const gx = x + cx;
      const gy = y + cy;
      return gx >= 0 && gx < COLS && gy < ROWS && (gy < 0 || !well[gy][gx]);
    });
  const spawn = (): boolean => {
    const kind = next;
    next = rand(7);
    piece = { kind, cells: SHAPES[kind].map((c) => [...c]), x: 3, y: -1 };
    if (kind === 1) piece.x = 4;
    return fits(piece.cells, piece.x, piece.y + 1) || fits(piece.cells, piece.x, piece.y);
  };
  const rotate = (cells: number[][]) => {
    if (piece.kind === 1) return cells;
    const n = piece.kind === 0 ? 4 : 3;
    return cells.map(([x, y]) => [n - 1 - y, x]);
  };
  const lock = (): Ev => {
    for (const [cx, cy] of piece.cells) {
      const gy = piece.y + cy;
      if (gy < 0) {
        dead = true;
        return { changed: true, over: true };
      }
      well[gy][piece.x + cx] = piece.kind === 0 || piece.kind === 2 ? 2 : 1;
    }
    flash = [];
    for (let y = 0; y < ROWS; y++) if (well[y].every(Boolean)) flash.push(y);
    if (flash.length) {
      for (const y of flash) {
        well.splice(y, 1);
        well.unshift(new Array(COLS).fill(0));
      }
      score += [0, 40, 100, 300, 1200][flash.length] * (level() + 1);
      lines += flash.length;
    }
    if (!spawn()) {
      dead = true;
      return { changed: true, over: true };
    }
    return { changed: true, sound: flash.length ? "arcadeLine" : "arcadeDrop" };
  };
  const move = (dx: number, dy: number) => {
    if (!fits(piece.cells, piece.x + dx, piece.y + dy)) return false;
    piece.x += dx;
    piece.y += dy;
    return true;
  };
  const cell = (l: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    l.fillStyle = color;
    l.fillRect(x + 1, y + 1, C - 2, C - 2);
    l.clearRect(x + 4, y + 4, C - 8, C - 8); // hollow: reads as a block, not a smear
    l.fillRect(x + 6, y + 6, C - 12, C - 12);
  };

  return {
    id: "blocks",
    title: "BLOCKS",
    controls: "ARROWS · UP TURNS · SPACE DROPS",
    tick: () => Math.max(90, 560 - level() * 50),
    score: () => score,
    reset() {
      well = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
      score = 0;
      lines = 0;
      flash = [];
      dead = false;
      next = rand(7);
      spawn();
    },
    press(key) {
      if (dead) return {};
      if (key === "left" || key === "right") return move(key === "left" ? -1 : 1, 0) ? { changed: true, sound: "arcadeMove" } : {};
      if (key === "down") {
        if (move(0, 1)) {
          score += 1;
          return { changed: true };
        }
        return lock();
      }
      if (key === "up") {
        const turned = rotate(piece.cells);
        for (const kick of [0, -1, 1, -2, 2]) {
          if (fits(turned, piece.x + kick, piece.y)) {
            piece.cells = turned;
            piece.x += kick;
            return { changed: true, sound: "arcadeMove" };
          }
        }
        return {};
      }
      // fire: all the way down
      let n = 0;
      while (move(0, 1)) n++;
      score += n * 2;
      return lock();
    },
    step() {
      if (dead) return {};
      const hadFlash = flash.length > 0;
      flash = [];
      if (move(0, 1)) return { changed: true };
      const ev = lock();
      return { ...ev, changed: ev.changed || hadFlash };
    },
    draw(l) {
      l.strokeStyle = GREEN.dim;
      l.lineWidth = 2;
      l.strokeRect(X0 - 4, Y0 - 4, COLS * C + 8, ROWS * C + 8);
      // faint dots where the cells go, like the grid of a cheap LCD
      l.fillStyle = GREEN.faint;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) l.fillRect(X0 + x * C + 6, Y0 + y * C + 6, 2, 2);
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) if (well[y][x]) cell(l, X0 + x * C, Y0 + y * C, well[y][x] === 2 ? GREEN.mid : "#3a9a55");
      for (const y of flash) {
        l.fillStyle = GREEN.bright;
        l.fillRect(X0, Y0 + y * C + C / 2 - 1, COLS * C, 3);
      }
      if (!dead) for (const [cx, cy] of piece.cells) if (piece.y + cy >= 0) cell(l, X0 + (piece.x + cx) * C, Y0 + (piece.y + cy) * C, GREEN.bright);

      // left: the numbers; right: what's next
      const lx = 48;
      pixelText(l, "LINES", lx, 90, 2, GREEN.dim);
      pixelText(l, String(lines), lx, 110, 3, GREEN.bright);
      pixelText(l, "LEVEL", lx, 160, 2, GREEN.dim);
      pixelText(l, String(level() + 1), lx, 180, 3, GREEN.bright);
      const rx = X0 + COLS * C + 32;
      pixelText(l, "NEXT", rx, 90, 2, GREEN.dim);
      for (const [cx, cy] of SHAPES[next]) cell(l, rx + cx * C, 116 + cy * C, GREEN.mid);
    },
  };
}

// ── PONG ──────────────────────────────────────────────────────────────────────────────────────
export function pong(): Cart {
  const PH = 46;
  const PW = 8;
  const B = 8;
  const px = LEFT + 10;
  const cx = RIGHT - 10 - PW;
  let py = 0;
  let cy = 0;
  let bx = 0;
  let by = 0;
  let vx = 0;
  let vy = 0;
  let wait = 0; // ticks before the serve
  let score = 0;
  let lives = 3;
  let dead = false;

  const serve = (toward: 1 | -1) => {
    bx = (LEFT + RIGHT) / 2 - B / 2;
    by = (TOP + BOTTOM) / 2 - B / 2 + (Math.random() - 0.5) * 120;
    const speed = 6;
    const a = (Math.random() - 0.5) * 0.9;
    vx = Math.cos(a) * speed * toward;
    vy = Math.sin(a) * speed;
    wait = 22;
  };
  const clampY = (y: number) => Math.max(TOP + 2, Math.min(BOTTOM - 2 - PH, y));

  return {
    id: "pong",
    title: "PONG",
    controls: "UP AND DOWN OR W AND S",
    tick: () => 33,
    score: () => score,
    reset() {
      py = cy = (TOP + BOTTOM) / 2 - PH / 2;
      score = 0;
      lives = 3;
      dead = false;
      serve(-1);
    },
    press: () => ({}),
    step(held) {
      if (dead) return {};
      const was = { py, cy, bx, by };
      if (held.has("up")) py = clampY(py - 8);
      if (held.has("down")) py = clampY(py + 8);
      // the other side follows the ball, a little slow, and only when it's coming
      const aim = vx > 0 ? by + B / 2 - PH / 2 : (TOP + BOTTOM) / 2 - PH / 2;
      cy = clampY(cy + Math.max(-4.6, Math.min(4.6, (aim - cy) * 0.2)));
      if (wait > 0) {
        wait--;
        return { changed: was.py !== py || was.cy !== cy || wait % 8 === 0 };
      }
      bx += vx;
      by += vy;
      let sound: string | undefined;
      if (by < TOP + 2 || by > BOTTOM - 2 - B) {
        vy = -vy;
        by = Math.max(TOP + 2, Math.min(BOTTOM - 2 - B, by));
        sound = "arcadeWall";
      }
      const speedUp = () => Math.min(12.5, Math.hypot(vx, vy) * 1.05);
      if (vx < 0 && bx <= px + PW && bx >= px - B && by + B >= py && by <= py + PH) {
        const off = (by + B / 2 - (py + PH / 2)) / (PH / 2); // where it hit the paddle: the angle
        const s = speedUp();
        vx = Math.cos(off * 0.9) * s;
        vy = Math.sin(off * 0.9) * s;
        bx = px + PW;
        score += 1;
        sound = "arcadePaddle";
      } else if (vx > 0 && bx + B >= cx && bx + B <= cx + PW + B && by + B >= cy && by <= cy + PH) {
        const off = (by + B / 2 - (cy + PH / 2)) / (PH / 2);
        const s = speedUp();
        vx = -Math.cos(off * 0.8) * s;
        vy = Math.sin(off * 0.8) * s;
        bx = cx - B;
        sound = "arcadePaddle";
      }
      if (bx < LEFT - 20) {
        lives--;
        if (lives <= 0) {
          dead = true;
          return { changed: true, over: true };
        }
        serve(-1);
        return { changed: true, sound: "arcadeMiss" };
      }
      if (bx > RIGHT + 20) {
        score += 5;
        serve(-1);
        return { changed: true, sound: "arcadePoint" };
      }
      return { changed: true, sound };
    },
    draw(l) {
      l.fillStyle = GREEN.dim;
      l.fillRect(LEFT, TOP - 2, RIGHT - LEFT, 2);
      l.fillRect(LEFT, BOTTOM, RIGHT - LEFT, 2);
      for (let y = TOP + 6; y < BOTTOM - 6; y += 18) l.fillRect(W / 2 - 2, y, 4, 10);
      l.fillStyle = GREEN.bright;
      l.fillRect(px, Math.round(py), PW, PH);
      l.fillStyle = GREEN.mid;
      l.fillRect(cx, Math.round(cy), PW, PH);
      if (!dead && (wait === 0 || wait % 8 < 5)) {
        l.fillStyle = GREEN.bright;
        l.fillRect(Math.round(bx), Math.round(by), B, B);
      }
      // balls left, under the playfield
      for (let i = 0; i < 3; i++) {
        l.fillStyle = i < lives ? GREEN.mid : GREEN.faint;
        l.fillRect(LEFT + i * 14, BOTTOM + 8, 8, 8);
      }
    },
  };
}

export const CARTS = [snake, blocks, pong];
