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

export type LevelData = {
  grid: TileChar[][];
  enemies: { x: number; y: number }[];
  flagX: number;
};

/** Deterministic level so every networked client builds the exact same stage. */
export function buildLevel(seed = 1337): LevelData {
  const rnd = mulberry32(seed);
  const grid: TileChar[][] = Array.from({ length: LEVEL_ROWS }, () =>
    Array.from({ length: LEVEL_COLS }, () => "." as TileChar),
  );
  const enemies: { x: number; y: number }[] = [];

  const groundTop = LEVEL_ROWS - 2;

  // Ground with holes
  let col = 0;
  while (col < LEVEL_COLS) {
    const makeHole = col > 18 && col < LEVEL_COLS - 20 && rnd() < 0.12;
    if (makeHole) {
      const holeW = 2 + Math.floor(rnd() * 2);
      col += holeW;
      continue;
    }
    grid[groundTop][col] = "G";
    grid[groundTop + 1][col] = "X";
    col++;
  }

  // Platforms, bricks, coin blocks
  for (let c = 12; c < LEVEL_COLS - 16; c += 4) {
    const r = rnd();
    if (r < 0.22) {
      const row = groundTop - 4;
      const len = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < len && c + i < LEVEL_COLS - 12; i++) {
        grid[row][c + i] = rnd() < 0.35 ? "?" : "B";
      }
      c += len;
    } else if (r < 0.38) {
      const row = groundTop - 6;
      const len = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < len && c + i < LEVEL_COLS - 12; i++) grid[row][c + i] = "P";
      for (let i = 0; i < len; i++) grid[row - 1][c + i] = "C";
      c += len;
    } else if (r < 0.5) {
      grid[groundTop - 3][c] = "?";
      grid[groundTop - 3][c + 1] = "B";
    } else if (r < 0.62) {
      // small stair
      const h = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i <= h; i++) {
        for (let j = 0; j <= i; j++) grid[groundTop - j][c + i] = "X";
      }
      c += h + 1;
    }
  }

  // Floating coins over the ground here and there
  for (let c = 8; c < LEVEL_COLS - 14; c += 7) {
    if (rnd() < 0.5 && grid[groundTop][c] === "G" && grid[groundTop - 2][c] === ".") {
      grid[groundTop - 2][c] = "C";
    }
  }

  // Enemies on solid ground
  for (let c = 20; c < LEVEL_COLS - 14; c += 6) {
    if (grid[groundTop][c] === "G" && grid[groundTop - 1][c] === "." && rnd() < 0.55) {
      enemies.push({ x: c * TILE, y: (groundTop - 1) * TILE });
    }
  }

  // Clean the start area & the finish area
  for (let c = 0; c < 8; c++) {
    grid[groundTop][c] = "G";
    grid[groundTop + 1][c] = "X";
    for (let r = 0; r < groundTop; r++) grid[r][c] = ".";
  }
  const flagCol = LEVEL_COLS - 8;
  for (let c = flagCol - 6; c < LEVEL_COLS; c++) {
    grid[groundTop][c] = "G";
    grid[groundTop + 1][c] = "X";
    for (let r = 0; r < groundTop; r++) grid[r][c] = ".";
  }
  grid[groundTop - 1][flagCol] = "F";

  return { grid, enemies, flagX: flagCol * TILE };
}

export function isSolid(ch: TileChar | undefined): boolean {
  return ch === "X" || ch === "G" || ch === "B" || ch === "?" || ch === "P";
}
