export type Box = { x: number; y: number; z: number; w: number; h: number; d: number; kind: "grass" | "brick" | "stone" };
export type Coin3D = { id: number; x: number; y: number; z: number; taken: boolean };
export type Enemy3D = { id: number; x: number; y: number; z: number; ax: "x" | "z"; min: number; max: number; dir: number; alive: boolean; squash: number };

// Deterministic voxel-island world leading to a flag.
export function buildLevel3D() {
  const boxes: Box[] = [];
  const coins: Coin3D[] = [];
  const enemies: Enemy3D[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  // Start island
  boxes.push({ x: 0, y: -0.5, z: 0, w: 14, h: 1, d: 14, kind: "grass" });
  let cx = 0, cz = 0, cy = 0;
  let coinId = 0, enemyId = 0;
  const N = 16;
  for (let i = 1; i <= N; i++) {
    const ang = (i * 0.55) + Math.sin(i) * 0.4;
    const dist = 9 + rnd() * 3;
    cx += Math.sin(ang) * dist;
    cz -= Math.cos(ang) * dist * 0.9 + 3;
    cy = Math.max(0, Math.min(8, cy + (rnd() < 0.5 ? 1 : -0.5) * (rnd() < 0.7 ? 1 : 2)));
    const big = i % 4 === 0;
    const w = big ? 12 : 5 + Math.floor(rnd() * 4);
    const d = big ? 12 : 5 + Math.floor(rnd() * 4);
    boxes.push({ x: cx, y: cy - 0.5, z: cz, w, h: 1, d, kind: i % 3 === 0 ? "stone" : "grass" });
    // coins in a ring
    for (let c = 0; c < 3; c++) {
      coins.push({ id: coinId++, x: cx + (c - 1) * 1.4, y: cy + 1.2, z: cz, taken: false });
    }
    // floating bricks on big islands + enemy
    if (big) {
      boxes.push({ x: cx - 2, y: cy + 2.5, z: cz - 2, w: 1, h: 1, d: 1, kind: "brick" });
      boxes.push({ x: cx, y: cy + 2.5, z: cz - 2, w: 1, h: 1, d: 1, kind: "brick" });
      boxes.push({ x: cx + 2, y: cy + 2.5, z: cz - 2, w: 1, h: 1, d: 1, kind: "brick" });
      coins.push({ id: coinId++, x: cx, y: cy + 4.2, z: cz - 2, taken: false });
      enemies.push({ id: enemyId++, x: cx, y: cy, z: cz + 3, ax: "x", min: cx - 4.5, max: cx + 4.5, dir: 1, alive: true, squash: 0 });
    } else if (i % 3 === 1 && w >= 7) {
      enemies.push({ id: enemyId++, x: cx, y: cy, z: cz, ax: "z", min: cz - d / 2 + 1, max: cz + d / 2 - 1, dir: 1, alive: true, squash: 0 });
    }
  }
  // Goal island
  cz -= 12;
  boxes.push({ x: cx, y: cy - 0.5, z: cz, w: 10, h: 1, d: 10, kind: "grass" });
  const flag = { x: cx, y: cy, z: cz };
  return { boxes, coins, enemies, flag };
}
