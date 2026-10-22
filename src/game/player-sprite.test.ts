import { expect, test } from "bun:test";
import { playerSpriteFrame } from "./player-sprite";

test("player one uses the PNG while standing still", () => {
  expect(playerSpriteFrame(0, false, 0, true, 160)).toBe("idle");
});

test("player one cycles the three uploaded GIF frames every 80ms while walking", () => {
  expect([0, 80, 160, 240].map(t => playerSpriteFrame(0, false, 3, true, t))).toEqual([0, 1, 2, 0]);
  expect(playerSpriteFrame(0, false, -3, true, 80)).toBe(1);
});

test("other players and Amiibo palettes keep their existing artwork", () => {
  expect(playerSpriteFrame(1, false, 3, true, 80)).toBeNull();
  expect(playerSpriteFrame(0, true, 3, true, 80)).toBeNull();
});