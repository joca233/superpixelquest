/** GIF frames are extracted into a sheet because canvas does not advance GIFs. */
export const RUN_FRAME_COUNT = 3;
export const RUN_FRAME_DURATION_MS = 80;

export function playerSpriteFrame(index: number, hasPalette: boolean, vx: number, onGround: boolean, time: number): "idle" | number | null {
  if (index !== 0 || hasPalette) return null;
  if (!onGround || Math.abs(vx) < 0.05) return "idle";
  return Math.floor(time / RUN_FRAME_DURATION_MS) % RUN_FRAME_COUNT;
}