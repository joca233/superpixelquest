import { test } from "node:test";
import { strict as assert } from "node:assert";
import { playerSpriteFrame } from "./player-sprite";

test("player one uses the PNG while standing still", () => {
  assert.equal(playerSpriteFrame(0, false, 0, true, 160), "idle");
});

test("player one cycles the three uploaded GIF frames every 80ms while walking", () => {
  assert.deepEqual([0, 80, 160, 240].map(t => playerSpriteFrame(0, false, 3, true, t)), [0, 1, 2, 0]);
  assert.equal(playerSpriteFrame(0, false, -3, true, 80), 1);
});

test("other players and Amiibo palettes keep their existing artwork", () => {
  assert.equal(playerSpriteFrame(1, false, 3, true, 80), null);
  assert.equal(playerSpriteFrame(0, true, 3, true, 80), null);
});