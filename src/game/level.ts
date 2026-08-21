export const TILE = 32;
export const LEVEL_ROWS = 16;
export const LEVEL_COLS = 220;

export type TileChar = "." | "X" | "G" | "B" | "?" | "P" | "F" | "C";

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

export type LevelData = {
  grid: Grid;
  enemies: { x: number; y: number }[];
  flagX: number;
};

/** Deterministic level so every networked client builds the exact same stage. */
export function buildLevel(seed = 1337): LevelData {
  const rnd = mulberry32(seed);
  const grid = new Grid(LEVEL_ROWS, LEVEL_COLS);
  const enemies: { x: number; y: number }[] = [];
  const groundTop = LEVEL_ROWS - 2;

  let col = 0;
  while (col < LEVEL_COLS) {
    if (col > 18 && col < LEVEL_COLS - 20 && rnd() < 0.12) {
      col += 2 + Math.floor(rnd() * 2);
      continue;
    }
    grid.set(groundTop, col, "G");
    grid.set(groundTop + 1, col, "X");
    col++;
  }

  for (let c = 12; c < LEVEL_COLS - 16; c += 4) {
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

  for (let c = 8; c < LEVEL_COLS - 14; c += 7) {
    if (rnd() < 0.5 && grid.get(groundTop, c) === "G" && grid.get(groundTop - 2, c) === ".") {
      grid.set(groundTop - 2, c, "C");
    }
  }

  for (let c = 20; c < LEVEL_COLS - 14; c += 6) {
    if (grid.get(groundTop, c) === "G" && grid.get(groundTop - 1, c) === "." && rnd() < 0.55) {
      enemies.push({ x: c * TILE, y: (groundTop - 1) * TILE });
    }
  }

  for (let c = 0; c < 8; c++) {
    for (let r = 0; r < groundTop; r++) grid.set(r, c, ".");
    grid.set(groundTop, c, "G");
    grid.set(groundTop + 1, c, "X");
  }
  const flagCol = LEVEL_COLS - 8;
  for (let c = flagCol - 6; c < LEVEL_COLS; c++) {
    for (let r = 0; r < groundTop; r++) grid.set(r, c, ".");
    grid.set(groundTop, c, "G");
    grid.set(groundTop + 1, c, "X");
  }
  grid.set(groundTop - 1, flagCol, "F");

  return { grid, enemies, flagX: flagCol * TILE };
}

export function isSolid(ch: TileChar): boolean {
  return ch === "X" || ch === "G" || ch === "B" || ch === "?" || ch === "P";
}
