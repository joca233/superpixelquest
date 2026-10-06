export const TILE = 32;
export const LEVEL_ROWS = 16;
/** Hidden area occupies the first columns, blocked by an invisible wall. */
export const SECRET_COLS = 16;
export const WALL_COL = SECRET_COLS; // invisible wall column
export const START_COL = SECRET_COLS + 2;
export const LEVEL_COLS = 236;

/** Underground bonus rooms (one per pit) live in their own grid. */
export const ROOM_ROWS = 16;
export const ROOM_COLS = 30;

export type TileChar = "." | "X" | "G" | "B" | "?" | "P" | "F" | "C" | "O" | "E" | "W" | "D" | "S" | "H";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Grid {
  cells: TileChar[];
  constructor(
    public rows: number,
    public cols: number,
  ) {
    this.cells = new Array<TileChar>(rows * cols).fill(".");
  }
  get(r: number, c: number): TileChar {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return ".";
    return this.cells[r * this.cols + c] ?? ".";
  }
  set(r: number, c: number, v: TileChar) {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return;
    this.cells[r * this.cols + c] = v;
  }
}

export type Hole = { startCol: number; endCol: number };

export type LevelData = {
  grid: Grid;
  enemies: { x: number; y: number }[];
  flagX: number;
  /** Pits in the surface ground, indexed left to right. */
  holes: Hole[];
  /** Underground rooms grid: room i lives at columns i*ROOM_COLS .. +ROOM_COLS-1 */
  rooms: Grid;
  /** Column of the orange secret pipe (2 tiles wide). */
  secretPipeCol: number;
};

export const ROOM_REWARDS = ["invencibilidade", "superpulo", "moedas", "vida"] as const;
export type Reward = (typeof ROOM_REWARDS)[number];

/** Deterministic level so every networked client builds the exact same stage. */
export function buildLevel(seed = 1337): LevelData {
  const rnd = mulberry32(seed);
  const grid = new Grid(LEVEL_ROWS, LEVEL_COLS);
  const enemies: { x: number; y: number }[] = [];
  const groundTop = LEVEL_ROWS - 2;

  let col = 0;
  while (col < LEVEL_COLS) {
    if (col > START_COL + 8 && col < LEVEL_COLS - 20 && rnd() < 0.06) {
      col += 2 + Math.floor(rnd() * 2);
      continue;
    }
    grid.set(groundTop, col, "G");
    grid.set(groundTop + 1, col, "X");
    col++;
  }

  for (let c = START_COL + 10; c < LEVEL_COLS - 16; c += 4) {
    const r = rnd();
    if (r < 0.22) {
      const row = groundTop - 4;
      const len = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < len && c + i < LEVEL_COLS - 12; i++) {
        grid.set(row, c + i, rnd() < 0.35 ? "?" : "B");
      }
      c += len;
    } else if (r < 0.38) {
      const row = groundTop - 6;
      const len = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < len && c + i < LEVEL_COLS - 12; i++) {
        grid.set(row, c + i, "P");
        grid.set(row - 1, c + i, "C");
      }
      c += len;
    } else if (r < 0.5) {
      grid.set(groundTop - 3, c, "?");
      grid.set(groundTop - 3, c + 1, "B");
    } else if (r < 0.62) {
      const h = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i <= h; i++) {
        for (let j = 0; j <= i; j++) grid.set(groundTop - j, c + i, "X");
      }
      c += h + 1;
    }
  }

  for (let c = START_COL + 6; c < LEVEL_COLS - 14; c += 7) {
    if (rnd() < 0.5 && grid.get(groundTop, c) === "G" && grid.get(groundTop - 2, c) === ".") {
      grid.set(groundTop - 2, c, "C");
    }
  }

  for (let c = START_COL + 12; c < LEVEL_COLS - 14; c += 6) {
    if (grid.get(groundTop, c) === "G" && grid.get(groundTop - 1, c) === "." && rnd() < 0.55) {
      enemies.push({ x: c * TILE, y: (groundTop - 1) * TILE });
    }
  }

  // Clean start area (secret zone + first playable tiles)
  for (let c = 0; c <= START_COL + 4; c++) {
    for (let r = 0; r < groundTop; r++) grid.set(r, c, ".");
    grid.set(groundTop, c, "G");
    grid.set(groundTop + 1, c, "X");
  }

  // Secret zone: orange pipe + invisible wall
  const secretPipeCol = 4;
  for (const c of [secretPipeCol, secretPipeCol + 1]) {
    grid.set(groundTop - 1, c, "O");
  }
  for (let r = 0; r <= groundTop - 1; r++) grid.set(r, WALL_COL, "W");

  const flagCol = LEVEL_COLS - 8;
  for (let c = flagCol - 6; c < LEVEL_COLS; c++) {
    for (let r = 0; r < groundTop; r++) grid.set(r, c, ".");
    grid.set(groundTop, c, "G");
    grid.set(groundTop + 1, c, "X");
  }
  grid.set(groundTop - 1, flagCol, "F");

  // Move the pit flanked by two 4-brick rows (at groundTop-4) to the middle of
  // the level, so that gap never has to be jumped under brick rows.
  {
    const brickRuns: [number, number][] = [];
    let bs = -1;
    for (let c = START_COL; c < LEVEL_COLS; c++) {
      const t = grid.get(groundTop - 4, c);
      const solid = t === "B" || t === "?";
      if (solid && bs < 0) bs = c;
      if (!solid && bs >= 0) {
        if (c - bs === 4) brickRuns.push([bs, c - 1]);
        bs = -1;
      }
    }
    const pits: Hole[] = [];
    let pr = -1;
    for (let c = START_COL; c < LEVEL_COLS; c++) {
      const empty = grid.get(groundTop, c) === ".";
      if (empty && pr < 0) pr = c;
      if (!empty && pr >= 0) {
        pits.push({ startCol: pr, endCol: c - 1 });
        pr = -1;
      }
    }
    const flanked = pits.find(
      (p) =>
        brickRuns.some((b) => Math.abs(b[0] - (p.endCol + 1)) <= 1) &&
        brickRuns.some((b) => Math.abs(b[1] - p.startCol) <= 9),
    );
    if (flanked) {
      const candidates = pits.filter((p) => p !== flanked);
      if (candidates.length > 0) {
        // Fill the pit between the brick rows with solid ground.
        for (let c = flanked.startCol; c <= flanked.endCol; c++) {
          grid.set(groundTop, c, "G");
          grid.set(groundTop + 1, c, "X");
        }
        // Place an equivalent pit in the middle: widen the pit closest to the
        // level's center up to 3 tiles wide.
        const mid = Math.floor(LEVEL_COLS / 2);
        const target = candidates.reduce((best, p) =>
          Math.abs((p.startCol + p.endCol) / 2 - mid) <
          Math.abs((best.startCol + best.endCol) / 2 - mid)
            ? p
            : best,
        );
        while (target.endCol - target.startCol < 2) {
          const left = target.startCol - 1;
          const right = target.endCol + 1;
          const canLeft = grid.get(groundTop, left) === "G" && grid.get(groundTop - 1, left) === ".";
          const canRight = grid.get(groundTop, right) === "G" && grid.get(groundTop - 1, right) === ".";
          if (canLeft) {
            grid.set(groundTop, left, ".");
            target.startCol = left;
          } else if (canRight) {
            grid.set(groundTop, right, ".");
            target.endCol = right;
          } else break;
        }
        // No enemy may stand over the widened pit.
        const x0 = target.startCol * TILE;
        const x1 = (target.endCol + 1) * TILE - 1;
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e && e.x >= x0 && e.x <= x1) enemies.splice(i, 1);
        }
      }
    }
  }

  // Detect pits (runs of empty ground) left to right
  const holes: Hole[] = [];
  let run = -1;
  for (let c = START_COL; c <= flagCol; c++) {
    const empty = grid.get(groundTop, c) === ".";
    if (empty && run < 0) run = c;
    if (!empty && run >= 0) {
      holes.push({ startCol: run, endCol: c - 1 });
      run = -1;
    }
  }

  // Replace every surface pit with solid ground and a two-tile-wide green pipe.
  // Keep the original locations as entrances to the secret bonus rooms.
  for (const hole of holes) {
    for (let c = hole.startCol; c <= hole.endCol; c++) {
      grid.set(groundTop, c, "G");
      grid.set(groundTop + 1, c, "X");
    }
    for (let c = hole.startCol; c < hole.startCol + 2; c++) {
      grid.set(groundTop - 1, c, "E");
      grid.set(groundTop - 2, c, "E");
    }
  }

  // Underground rooms, one per former pit
  const rooms = new Grid(ROOM_ROWS, Math.max(1, holes.length) * ROOM_COLS);
  const floor = ROOM_ROWS - 2;
  for (let i = 0; i < holes.length; i++) {
    const base = i * ROOM_COLS;
    for (let c = 0; c < ROOM_COLS; c++) {
      rooms.set(floor, base + c, "S");
      rooms.set(floor + 1, base + c, "D");
      rooms.set(0, base + c, "D");
    }
    for (let r = 0; r < ROOM_ROWS; r++) {
      rooms.set(r, base, "D");
      rooms.set(r, base + ROOM_COLS - 1, "D");
    }
    for (let c = 4; c < ROOM_COLS - 8; c += 3) rooms.set(floor - 3, base + c, "C");
    const pipe = base + ROOM_COLS - 5;
    rooms.set(floor - 1, pipe, "E");
    rooms.set(floor - 1, pipe + 1, "E");
    rooms.set(floor - 2, pipe, "E");
    rooms.set(floor - 2, pipe + 1, "E");
  }

  return { grid, enemies, flagX: flagCol * TILE, holes, rooms, secretPipeCol };
}

export function isSolid(ch: TileChar): boolean {
  return (
    ch === "X" ||
    ch === "G" ||
    ch === "B" ||
    ch === "?" ||
    ch === "P" ||
    ch === "O" ||
    ch === "E" ||
    ch === "W" ||
    ch === "D" ||
    ch === "S" ||
    ch === "H"
  );
}
