import {
  buildLevel,
  isSolid,
  LEVEL_COLS,
  LEVEL_ROWS,
  ROOM_COLS,
  ROOM_ROWS,
  ROOM_REWARDS,
  START_COL,
  TILE,
  WALL_COL,
  type Grid,
  type LevelData,
} from "./level";
import { sfx, sfxExtra } from "./audio";


export const PLAYER_COLORS = ["#e64539", "#3fd463", "#3a8ee6", "#f5d442"];
export const PLAYER_NAMES = ["Jogador 1", "Jogador 2", "Jogador 3", "Jogador 4"];

export type ControlScheme = "wasd" | "arrows" | "both";

export type PlayerState = {
  index: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  anim: number;
  alive: boolean;
  active: boolean;
  respawnAt: number;
  invuln: number;
  score: number;
  coins: number;
  lives: number;
  finished: boolean;
  scheme: ControlScheme;
  local: boolean;
  // secret mode
  area: "surface" | "under";
  room: number;
  superJump: number;
  // speed boots power-up
  boots: number;
  autoRun: boolean;
  // network interpolation targets
  tx: number;
  ty: number;
};


export type Enemy = { id: number; x: number; y: number; vx: number; alive: boolean };

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export type HudState = {
  score: number;
  coins: number;
  lives: number;
  time: number;
  status: "playing" | "won" | "gameover";
  secret: boolean;
  power: string | null;
  message: string | null;
  pushPct: number;
  boots: number;
  sonic: number;
  ending: "none" | "sonic";
};


export type NetSnapshot = {
  i: number;
  x: number;
  y: number;
  vy: number;
  f: number;
  g: number;
  a: number;
  al: number;
  s: number;
  c: number;
};

const GRAVITY = 0.62;
const MAX_FALL = 14;
const ACCEL = 0.7;
const FRICTION = 0.82;
const MAX_SPEED = 5.2;
const JUMP_V = -12.4;
const PW = 22;
const PH = 28;

export type EngineOptions = {
  canvas: HTMLCanvasElement;
  playerCount: number;
  localIndices: number[];
  schemes: ControlScheme[];
  isHost: boolean;
  networked: boolean;
  onHud: (hud: HudState) => void;
  onNet?: (snap: NetSnapshot) => void;
  onSonicEnd?: () => void;

};

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private level: LevelData;
  private players: PlayerState[] = [];
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private keys = new Set<string>();
  private touch = { left: false, right: false, jump: false, down: false };
  private raf = 0;
  private last = 0;
  private acc = 0;
  private camX = 0;
  private time = 300;
  private timeAcc = 0;
  private status: HudState["status"] = "playing";
  private netAcc = 0;
  private bumps = new Map<number, number>();
  private destroyed = false;
  // chat / commands
  private inputLocked = false;
  private bubbles = new Map<number, { text: string; until: number }>();
  private godMode = new Set<number>();

  // secret / easter egg state
  private revealed = false;
  private pushFrames = 0;
  private secretMode = false;
  private power: string | null = null;
  private powerTimer = 0;
  private message: string | null = null;
  private messageTimer = 0;

  // speed boots / sonic ending
  private bootsItems: { x: number; y: number; vx: number; vy: number; alive: boolean }[] = [];
  private disguised = false;
  private sonicMode = false;
  private sonicX = 0;
  private sonic = 0;
  private ending: "none" | "sonic" = "none";
  private sonicMeetX = 0;
  private talkStart = 0;
  private finaleDone = false;


  constructor(private opts: EngineOptions) {
    const ctx = opts.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível");
    this.ctx = ctx;
    this.level = buildLevel(1337);
    this.enemies = this.level.enemies.map((e, id) => ({ id, x: e.x, y: e.y, vx: 1.1, alive: true }));

    const spawnX = (START_COL + 1) * TILE;
    for (let i = 0; i < opts.playerCount; i++) {
      const local = opts.localIndices.includes(i);
      this.players.push({
        index: i,
        x: spawnX + i * 26,
        y: (LEVEL_ROWS - 3) * TILE,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,
        anim: 0,
        alive: true,
        active: true,
        respawnAt: 0,
        invuln: 0,
        score: 0,
        coins: 0,
        lives: 3,
        finished: false,
        scheme: opts.schemes[i] ?? "both",
        local,
        area: "surface",
        room: 0,
        superJump: 0,
        boots: 0,
        autoRun: false,
        tx: spawnX + i * 26,
        ty: (LEVEL_ROWS - 3) * TILE,
      });
    }
    this.camX = WALL_COL * TILE;


    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.inputLocked) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  setTouch(t: Partial<{ left: boolean; right: boolean; jump: boolean; down: boolean }>) {
    Object.assign(this.touch, t);
  }

  /** Freeze local movement while the chat box is open. */
  setInputLocked(locked: boolean) {
    this.inputLocked = locked;
    if (locked) {
      this.keys.clear();
      this.touch.left = this.touch.right = this.touch.jump = this.touch.down = false;
    }
  }

  /** Show a chat bubble above a player for a few seconds. */
  setChatBubble(index: number, text: string) {
    this.bubbles.set(index, { text: text.slice(0, 48), until: performance.now() + 5000 });
  }

  /** Permanent invincibility granted by the /invencibilidade infinita command. */
  setGodMode(index: number, on: boolean) {
    if (on) this.godMode.add(index);
    else this.godMode.delete(index);
  }



  applyRemote(snap: NetSnapshot) {
    const p = this.players[snap.i];
    if (!p || p.local) return;
    p.tx = snap.x;
    p.ty = snap.y;
    p.vy = snap.vy;
    p.facing = snap.f >= 0 ? 1 : -1;
    p.onGround = snap.g === 1;
    p.anim = snap.a;
    p.alive = snap.al === 1;
    p.score = snap.s;
    p.coins = snap.c;
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(50, now - this.last);
    this.last = now;
    this.acc += dt;
    while (this.acc >= 16.666) {
      this.step();
      this.acc -= 16.666;
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private pressed(p: PlayerState, action: "left" | "right" | "jump" | "down") {
    if (this.inputLocked && p.local) return false;
    const k = this.keys;

    const wasd =
      action === "left"
        ? k.has("KeyA")
        : action === "right"
          ? k.has("KeyD")
          : action === "down"
            ? k.has("KeyS")
            : k.has("Space") || k.has("KeyW");
    const arrows =
      action === "left"
        ? k.has("ArrowLeft")
        : action === "right"
          ? k.has("ArrowRight")
          : action === "down"
            ? k.has("ArrowDown")
            : k.has("ArrowUp") || k.has("Enter");
    let base = p.scheme === "wasd" ? wasd : p.scheme === "arrows" ? arrows : wasd || arrows;
    if (this.opts.localIndices[0] === p.index) {
      base =
        base ||
        (action === "left"
          ? this.touch.left
          : action === "right"
            ? this.touch.right
            : action === "down"
              ? this.touch.down
              : this.touch.jump);
    }
    return base;
  }

  /** Grid currently used for collisions / rendering (surface level or bonus rooms). */
  private g(): Grid {
    return this.viewArea() === "under" ? this.level.rooms : this.level.grid;
  }

  private me(): PlayerState | undefined {
    return this.players[this.opts.localIndices[0] ?? 0] ?? this.players[0];
  }

  private viewArea(): "surface" | "under" {
    return this.me()?.area ?? "surface";
  }

  private solidAt(px: number, py: number) {
    const c = Math.floor(px / TILE);
    const r = Math.floor(py / TILE);
    return isSolid(this.level.grid.get(r, c));
  }


  private step() {
    if (this.status !== "playing") return;

    this.timeAcc += 16.666;
    if (this.timeAcc >= 1000) {
      this.timeAcc -= 1000;
      this.time = Math.max(0, this.time - 1);
      if (this.time === 0) this.killPlayer(this.players[0]);
    }

    for (const p of this.players) {
      if (!p.active) continue;
      if (p.local) this.stepLocalPlayer(p);
      else {
        p.x += (p.tx - p.x) * 0.35;
        p.y += (p.ty - p.y) * 0.35;
      }
    }

    // Enemies simulated by host (or by everyone in offline modes)
    if (!this.opts.networked || this.opts.isHost) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.x += e.vx;
        const aheadX = e.vx > 0 ? e.x + 26 : e.x - 2;
        if (this.solidAt(aheadX, e.y + 14) || !this.solidAt(e.x + 12, e.y + 34)) {
          e.vx *= -1;
          e.x += e.vx * 2;
        }
      }
    }

    for (const p of this.players) {
      if (p.local && p.alive && p.active && p.area === "surface") this.collideEnemies(p);
    }

    this.stepBoots();

    for (const pt of this.particles) {
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += 0.4;
      pt.life -= 1;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const [k, v] of this.bumps) {
      if (v <= 1) this.bumps.delete(k);
      else this.bumps.set(k, v - 1);
    }

    if (this.powerTimer > 0) {
      this.powerTimer--;
      if (this.powerTimer === 0) this.power = null;
    }
    if (this.messageTimer > 0) {
      this.messageTimer--;
      if (this.messageTimer === 0) this.message = null;
    }

    if (this.sonicMode) {
      this.sonic = Math.min(1, this.sonic + 0.004);
      this.sonicX += 26;
    }

    const cam = this.me() ?? this.players[0];
    if (cam) {
      const W = this.opts.canvas.width;
      let min = this.revealed ? 0 : WALL_COL * TILE;
      let max = LEVEL_COLS * TILE - W;
      if (cam.area === "under") {
        min = cam.room * ROOM_COLS * TILE;
        max = min + ROOM_COLS * TILE - W;
      }
      const target = Math.max(min, Math.min(cam.x - W / 2, Math.max(min, max)));
      this.camX += (target - this.camX) * 0.12;
    }


    // network broadcast at ~20/s
    this.netAcc += 16.666;
    if (this.opts.networked && this.netAcc >= 50) {
      this.netAcc = 0;
      const me = this.players[this.opts.localIndices[0] ?? 0];
      if (me && this.opts.onNet) {
        this.opts.onNet({
          i: me.index,
          x: Math.round(me.x),
          y: Math.round(me.y),
          vy: Math.round(me.vy),
          f: me.facing,
          g: me.onGround ? 1 : 0,
          a: Math.round(me.anim),
          al: me.alive ? 1 : 0,
          s: me.score,
          c: me.coins,
        });
      }
    }

    this.emitHud();
  }

  private stepLocalPlayer(p: PlayerState) {
    if (!p.alive) {
      p.y += 6;
      if (performance.now() > p.respawnAt) this.respawn(p);
      return;
    }
    if (p.invuln > 0) p.invuln--;
    if (p.superJump > 0) p.superJump--;

    const left = this.pressed(p, "left");
    const right = this.pressed(p, "right");
    const jump = this.pressed(p, "jump");
    const down = this.pressed(p, "down");

    const boosted = p.boots > 0;
    const accel = boosted ? ACCEL * 1.7 : ACCEL;
    const maxSpeed = boosted ? MAX_SPEED * 1.95 : MAX_SPEED;

    if (p.autoRun) {
      p.vx = Math.min(maxSpeed, p.vx + accel);
      p.facing = 1;
    } else {
      if (left) {
        p.vx -= accel;
        p.facing = -1;
      }
      if (right) {
        p.vx += accel;
        p.facing = 1;
      }
      if (!left && !right) p.vx *= FRICTION;
    }
    p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    if (p.boots > 0) {
      p.boots--;
      if (p.boots === 0 && !this.sonicMode) this.showMessage("AS BOTAS PERDERAM A CARGA");
    }

    if (jump && !p.autoRun && p.onGround) {
      p.vy = p.superJump > 0 ? JUMP_V * 1.55 : JUMP_V;
      p.onGround = false;
      sfx.jump();
    }
    if (!jump && p.vy < -4) p.vy *= 0.86;

    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY);

    // Horizontal
    p.x += p.vx;
    const minX = p.area === "under" ? p.room * ROOM_COLS * TILE : 0;
    if (p.x < minX) {
      p.x = minX;
      p.vx = 0;
    }
    this.resolveAxis(p, "x");

    // Vertical
    p.y += p.vy;
    p.onGround = false;
    this.resolveAxis(p, "y");

    this.collectTiles(p);
    this.maybeDisguiseBlocks(p);
    this.collectBoots(p);
    if (p.boots > 0) this.bootsEffects(p);
    this.checkSonicFinale(p);

    if (p.vx !== 0 && p.onGround) p.anim = (p.anim + Math.abs(p.vx) * 0.4) % 4;
    else if (!p.onGround) p.anim = 4;

    this.handleSecret(p, left, down);

    if (p.area === "surface" && p.y > LEVEL_ROWS * TILE + 80) {
      if (this.secretMode) this.enterRoom(p);
      else if (this.godMode.has(p.index)) this.respawn(p);
      else this.killPlayer(p);
    }


    if (this.sonicMode) {
      // Autorun until Sonic at the edge of the transformed world, then talk and exit.
      if (p.x >= this.sonicMeetX - 60) {
        p.autoRun = false;
        p.vx = 0;
        p.x = Math.min(p.x, this.sonicMeetX - 56);
        if (!this.talkStart) {
          this.talkStart = performance.now();
          p.score += 1000 + this.time * 10;
          this.saveHighScore(p.score);
          sfx.win();
        }
      }
      if (this.talkStart && !this.finaleDone && performance.now() - this.talkStart > 3400) {
        this.finaleDone = true;
        p.finished = true;
        this.status = "won";
        this.opts.onSonicEnd?.();
      }
      return;
    }

    if (p.area === "surface" && !p.finished && p.x >= this.level.flagX - 6) {
      p.finished = true;
      p.score += 1000 + this.time * 10;
      this.status = "won";
      sfx.win();
      this.saveHighScore(p.score);
    }

  }

  /** Invisible wall push timer, secret reveal, and pipe transitions. */
  private handleSecret(p: PlayerState, left: boolean, down: boolean) {
    if (p.area === "surface" && !this.revealed) {
      const atWall = left && p.vx === 0 && p.x - PW / 2 <= (WALL_COL + 1) * TILE + 3 && p.x > WALL_COL * TILE;
      if (atWall) {
        this.pushFrames++;
        if (this.pushFrames >= 300) {
          this.revealed = true;
          for (let r = 0; r < LEVEL_ROWS; r++) {
            if (this.level.grid.get(r, WALL_COL) === "W") this.level.grid.set(r, WALL_COL, ".");
          }
          this.showMessage("SEGREDO REVELADO! DESÇA NO CANO LARANJA");
          sfxExtra.secret();
        }
      } else if (this.pushFrames > 0) {
        this.pushFrames = Math.max(0, this.pushFrames - 3);
      }
    }

    const footRow = Math.floor((p.y + PH + 4) / TILE);
    const feet = [
      this.g().get(footRow, Math.floor(p.x / TILE)),
      this.g().get(footRow, Math.floor((p.x - PW / 2) / TILE)),
      this.g().get(footRow, Math.floor((p.x + PW / 2) / TILE)),
    ];
    const tileUnder = feet.includes("O") ? "O" : feet.includes("E") ? "E" : feet[0];

    if (down && p.onGround && p.area === "surface" && tileUnder === "O") {
      if (!this.secretMode) {
        this.secretMode = true;
        this.showMessage("MODO SECRETO ATIVADO — OS BURACOS VIRAM SALAS!");
        sfxExtra.secret();
      }
    }

    if (down && p.onGround && p.area === "under" && tileUnder === "E") {
      this.exitRoom(p);
    }
  }

  private holeIndexAt(x: number) {
    const col = Math.floor(x / TILE);
    let best = -1;
    this.level.holes.forEach((h, i) => {
      if (col >= h.startCol - 2 && col <= h.endCol + 2) best = i;
    });
    if (best < 0) {
      // fall back to nearest hole to the left
      this.level.holes.forEach((h, i) => {
        if (h.startCol <= col) best = i;
      });
    }
    return Math.max(0, best);
  }

  private enterRoom(p: PlayerState) {
    if (this.level.holes.length === 0) {
      this.killPlayer(p);
      return;
    }
    const i = this.holeIndexAt(p.x);
    p.area = "under";
    p.room = i;
    p.x = (i * ROOM_COLS + 3) * TILE;
    p.y = (ROOM_ROWS - 5) * TILE;
    p.vx = 0;
    p.vy = 0;
    this.camX = i * ROOM_COLS * TILE;
    sfxExtra.pipe();
    this.grantReward(p, i);
  }

  private grantReward(p: PlayerState, i: number) {
    const reward = ROOM_REWARDS[i % ROOM_REWARDS.length] ?? "moedas";
    if (reward === "invencibilidade") {
      p.invuln = 600;
      this.setPower("INVENCÍVEL", 600);
    } else if (reward === "superpulo") {
      p.superJump = 900;
      this.setPower("SUPER PULO", 900);
    } else if (reward === "moedas") {
      p.coins += 10;
      p.score += 1000;
      this.setPower("+10 MOEDAS", 240);
    } else {
      p.lives += 1;
      this.setPower("+1 VIDA", 240);
    }
    this.showMessage(`SALA SECRETA — ITEM: ${reward.toUpperCase()}`);
    this.spawnParticles(p.x, p.y, "#f5d442", 14);
    sfxExtra.power();
  }


  // ---------- speed boots ----------

  /** With 8+ coins, the middle brick of any 3-brick row becomes a disguised ? block. */
  private maybeDisguiseBlocks(p: PlayerState) {
    if (this.disguised || p.coins < 8 || p.area !== "surface") return;
    this.disguised = true;
    const grid = this.level.grid;
    let count = 0;
    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = 1; c < LEVEL_COLS - 1; c++) {
        if (grid.get(r, c - 1) === "B" && grid.get(r, c) === "B" && grid.get(r, c + 1) === "B") {
          grid.set(r, c, "H");
          count++;
          c += 2;
        }
      }
    }
    if (count > 0) this.showMessage("8 MOEDAS! ALGUM TIJOLO ESCONDE ALGO...");
  }

  private stepBoots() {
    for (const b of this.bootsItems) {
      if (!b.alive) continue;
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY);
      b.x += b.vx;
      if (this.solidAt(b.vx > 0 ? b.x + 26 : b.x - 2, b.y + 14)) b.vx *= -1;
      b.y += b.vy;
      if (this.solidAt(b.x + 12, b.y + 26)) {
        b.y = Math.floor((b.y + 26) / TILE) * TILE - 26;
        b.vy = 0;
      }
      if (b.y > LEVEL_ROWS * TILE + 200) b.alive = false;
    }
  }

  private collectBoots(p: PlayerState) {
    if (p.area !== "surface") return;
    for (const b of this.bootsItems) {
      if (!b.alive) continue;
      if (Math.abs(b.x + 12 - p.x) < 22 && Math.abs(b.y + 12 - (p.y + PH / 2)) < 26) {
        b.alive = false;
        p.boots = 1800;
        this.setPower("BOTAS DE VELOCIDADE", 1800);
        this.showMessage("BOTAS DE VELOCIDADE! CORRA E QUEBRE TUDO!");
        this.spawnParticles(p.x, p.y, "#5fd1ff", 18);
        sfxExtra.power();
      }
    }
  }

  /** While running fast: smash blocks ahead, bridge pits, and trail sparks. */
  private bootsEffects(p: PlayerState) {
    const fast = Math.abs(p.vx) > 4.5;
    if (fast && Math.random() < 0.7) {
      this.particles.push({
        x: p.x - p.facing * 12,
        y: p.y + PH - 6,
        vx: -p.facing * (1 + Math.random() * 2),
        vy: -Math.random() * 2,
        life: 14 + Math.random() * 10,
        color: Math.random() < 0.5 ? "#5fd1ff" : "#ffffff",
      });
    }

    if (fast) {
      const ahead = p.x + p.facing * (PW / 2 + 6);
      const c = Math.floor(ahead / TILE);
      for (let r = Math.floor(p.y / TILE); r <= Math.floor((p.y + PH - 2) / TILE); r++) {
        const ch = this.level.grid.get(r, c);
        if (ch === "B" || ch === "?" || ch === "H" || ch === "X") {
          this.level.grid.set(r, c, ".");
          p.score += 50;
          this.spawnParticles(c * TILE + 16, r * TILE + 16, "#b45f2e", 8);
          sfx.brick();
        }
      }
    }

    // instant dirt bridges over pits
    const groundTop = LEVEL_ROWS - 2;
    const col = Math.floor(p.x / TILE);
    for (let c = col - 1; c <= col + 3; c++) {
      if (c < 0 || c >= LEVEL_COLS) continue;
      if (this.level.grid.get(groundTop, c) === ".") {
        this.level.grid.set(groundTop, c, "G");
        this.level.grid.set(groundTop + 1, c, "X");
        this.spawnParticles(c * TILE + 16, groundTop * TILE, "#8b5a2b", 4);
      }
    }
  }

  /** Reaching the flag zone with the boots triggers the Sonic dimension ending. */
  private checkSonicFinale(p: PlayerState) {
    if (this.sonicMode || p.area !== "surface" || p.boots <= 0) return;
    if (p.x < this.level.flagX - 14 * TILE) return;

    this.sonicMode = true;
    this.ending = "sonic";
    this.sonicX = p.x;
    p.autoRun = true;
    p.boots = 99999;

    const groundTop = LEVEL_ROWS - 2;
    const flagCol = Math.floor(this.level.flagX / TILE);
    for (let c = flagCol - 2; c <= flagCol + 2; c++) {
      for (let r = groundTop - 1; r <= groundTop + 1; r++) {
        if (this.level.grid.get(r, c) === "X" || this.level.grid.get(r, c) === "B") {
          this.level.grid.set(r, c, ".");
          this.spawnParticles(c * TILE + 16, r * TILE + 16, "#c1662f", 8);
        }
      }
    }
    this.showMessage("A BASE DA BANDEIRA QUEBROU — DIMENSÃO DO SONIC!");
    sfxExtra.secret();
  }

  private setPower(label: string, frames: number) {
    this.power = label;
    this.powerTimer = frames;
  }

  private showMessage(text: string) {
    this.message = text;
    this.messageTimer = 240;
  }

  private exitRoom(p: PlayerState) {
    const hole = this.level.holes[p.room];
    p.area = "surface";
    p.x = ((hole?.endCol ?? START_COL) + 2) * TILE;
    p.y = (LEVEL_ROWS - 5) * TILE;
    p.vx = 0;
    p.vy = 0;
    this.camX = Math.max(this.revealed ? 0 : WALL_COL * TILE, p.x - this.opts.canvas.width / 2);
    sfxExtra.pipe();
  }


  private resolveAxis(p: PlayerState, axis: "x" | "y") {
    const EPS = 0.6;
    const left = p.x - PW / 2 + EPS;
    const right = p.x + PW / 2 - EPS;
    const top = p.y + EPS;
    const bottom = p.y + PH - EPS;
    const c0 = Math.floor(left / TILE);
    const c1 = Math.floor(right / TILE);
    const r0 = Math.floor(top / TILE);
    const r1 = Math.floor(bottom / TILE);


    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = this.g().get(r, c);
        if (!isSolid(ch)) continue;
        if (ch === "P" && axis === "y" && p.vy < 0) continue; // one-way platform
        if (ch === "P" && axis === "x") continue;
        if (axis === "x") {
          if (p.vx > 0) p.x = c * TILE - PW / 2 - 0.01;
          else if (p.vx < 0) p.x = (c + 1) * TILE + PW / 2 + 0.01;
          p.vx = 0;
        } else {
          if (p.vy > 0) {
            if (ch === "P" && bottom - p.vy > r * TILE + 2) continue;
            p.y = r * TILE - PH;
            p.vy = 0;
            p.onGround = true;
          } else if (p.vy < 0) {
            p.y = (r + 1) * TILE;
            p.vy = 1;
            this.hitBlockFromBelow(p, r, c);
          }
        }
        return;
      }
    }
  }

  private hitBlockFromBelow(p: PlayerState, r: number, c: number) {
    const ch = this.g().get(r, c);
    const key = r * LEVEL_COLS + c;
    if (ch === "H") {
      this.g().set(r, c, "X");
      this.bumps.set(key, 10);
      this.bootsItems.push({ x: c * TILE + 4, y: r * TILE - TILE, vx: 1.4, vy: 0, alive: true });
      this.showMessage("BOTAS DE VELOCIDADE APARECERAM!");
      sfxExtra.power();
      return;
    }
    if (ch === "?") {
      this.g().set(r, c, "X");
      p.coins++;
      p.score += 200;
      this.bumps.set(key, 10);
      this.spawnParticles(c * TILE + 16, r * TILE, "#f5d442", 6);
      sfx.coin();
    } else if (ch === "B") {
      this.g().set(r, c, ".");
      p.score += 50;
      this.spawnParticles(c * TILE + 16, r * TILE + 16, "#b45f2e", 10);
      sfx.brick();
    } else {
      this.bumps.set(key, 6);
      sfx.bump();
    }
  }

  private collectTiles(p: PlayerState) {
    const c0 = Math.floor((p.x - PW / 2) / TILE);
    const c1 = Math.floor((p.x + PW / 2) / TILE);
    const r0 = Math.floor(p.y / TILE);
    const r1 = Math.floor((p.y + PH) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.g().get(r, c) === "C") {
          this.g().set(r, c, ".");
          p.coins++;
          p.score += 100;
          this.spawnParticles(c * TILE + 16, r * TILE + 16, "#f5d442", 5);
          sfx.coin();
        }
      }
    }
  }

  private collideEnemies(p: PlayerState) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const overlap =
        p.x + PW / 2 > e.x + 3 && p.x - PW / 2 < e.x + 25 && p.y + PH > e.y + 6 && p.y < e.y + 28;
      if (!overlap) continue;
      if (p.vy > 1 && p.y + PH < e.y + 22) {
        e.alive = false;
        p.vy = -8.5;
        p.score += 150;
        this.spawnParticles(e.x + 14, e.y + 14, "#8b4b2b", 8);
        sfx.stomp();
      } else if (p.invuln <= 0) {
        this.killPlayer(p);
      }
    }
  }

  private killPlayer(p: PlayerState | undefined) {
    if (!p || !p.alive) return;
    if (this.godMode.has(p.index)) return;

    p.alive = false;
    p.vy = -8;
    p.lives -= 1;
    p.respawnAt = performance.now() + 1200;
    sfx.death();
    if (p.lives <= 0) {
      this.status = "gameover";
      this.saveHighScore(p.score);
    }
  }

  private respawn(p: PlayerState) {
    if (p.lives <= 0) return;
    p.alive = true;
    p.area = "surface";
    p.x = Math.max((START_COL + 1) * TILE, this.camX + 80);
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.invuln = 90;
    this.time = Math.max(this.time, 60);
  }

  private saveHighScore(score: number) {
    try {
      const prev = Number(localStorage.getItem("pixelquest_highscore") ?? "0");
      if (score > prev) localStorage.setItem("pixelquest_highscore", String(score));
    } catch {
      /* ignore */
    }
  }

  private spawnParticles(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5,
        vy: -Math.random() * 5 - 1,
        life: 24 + Math.random() * 16,
        color,
      });
    }
  }

  private emitHud() {
    const p = this.players[this.opts.localIndices[0] ?? 0] ?? this.players[0];
    this.opts.onHud({
      score: p?.score ?? 0,
      coins: p?.coins ?? 0,
      lives: Math.max(0, p?.lives ?? 0),
      time: this.time,
      status: this.status,
      secret: this.secretMode,
      power: this.power,
      message: this.message,
      pushPct: this.revealed ? 1 : Math.min(1, this.pushFrames / 300),
      boots: p?.boots ?? 0,
      sonic: this.sonic,
      ending: this.ending,
    });
  }

  getPlayersPublic() {
    return this.players.map((p) => ({ index: p.index, score: p.score, coins: p.coins, lives: p.lives }));
  }

  // ---------- rendering ----------
  private render() {
    const ctx = this.ctx;
    const { width: W, height: H } = this.opts.canvas;
    ctx.imageSmoothingEnabled = false;
    const under = this.viewArea() === "under";

    if (under) {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0b0d1c");
      bg.addColorStop(1, "#171a33");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      if (this.sonic > 0) {
        sky.addColorStop(0, "#0b7bd6");
        sky.addColorStop(1, "#7fe0ff");
      } else {
        sky.addColorStop(0, "#3aa5f0");
        sky.addColorStop(1, "#9fd8ff");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      this.drawClouds(W, H);
      if (this.sonic > 0) this.drawPalms(W, H);
      this.drawHills(W, H);
    }

    ctx.save();
    ctx.translate(-Math.round(this.camX), 0);

    const grid = this.g();
    const rows = under ? ROOM_ROWS : LEVEL_ROWS;
    const c0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const c1 = Math.min(grid.cols - 1, Math.floor((this.camX + W) / TILE) + 1);

    for (let r = 0; r < rows; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = grid.get(r, c);
        if (ch === "." || ch === "W") continue;
        const bump = this.bumps.get(r * LEVEL_COLS + c) ?? 0;
        const x = c * TILE;
        const y = r * TILE - (bump > 0 ? Math.sin((bump / 10) * Math.PI) * 8 : 0);
        this.drawTile(ch, x, y);
      }
    }

    if (!under) {
      for (const e of this.enemies) if (e.alive) this.drawEnemy(e);
    }
    if (!under) {
      for (const b of this.bootsItems) {
        if (!b.alive) continue;
        const bob = Math.sin(performance.now() / 180) * 2;
        ctx.fillStyle = "#5fd1ff";
        ctx.fillRect(b.x, b.y + 10 + bob, 24, 12);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(b.x + 2, b.y + 12 + bob, 8, 4);
        ctx.fillStyle = "#e64539";
        ctx.fillRect(b.x, b.y + 20 + bob, 24, 4);
      }
    }

    for (const p of this.players) {
      if (!p.active) continue;
      if (p.local ? p.area !== this.viewArea() : under) continue;
      this.drawPlayer(p);
    }

    for (const pt of this.particles) {
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 4, 4);
    }

    ctx.restore();
  }


  private drawClouds(W: number, H: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 14; i++) {
      const bx = (i * 340 - this.camX * 0.25) % (W + 400);
      const x = bx < -200 ? bx + W + 400 : bx;
      const y = 30 + ((i * 53) % 90);
      ctx.fillRect(x, y, 48, 14);
      ctx.fillRect(x + 12, y - 10, 30, 14);
      ctx.fillRect(x - 10, y + 6, 22, 10);
    }
    void H;
  }

  private drawHills(W: number, H: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#2f8f3f";
    for (let i = 0; i < 12; i++) {
      const bx = (i * 420 - this.camX * 0.5) % (W + 600);
      const x = bx < -300 ? bx + W + 600 : bx;
      const base = H - TILE * 2;
      for (let k = 0; k < 8; k++) {
        ctx.fillRect(x + k * 10, base - k * 10, 160 - k * 20, 12);
      }
    }
  }

  private drawPalms(W: number, H: number) {
    const ctx = this.ctx;
    for (let i = 0; i < 10; i++) {
      const bx = (i * 300 - this.camX * 0.4) % (W + 400);
      const x = bx < -200 ? bx + W + 400 : bx;
      const base = H - TILE * 2;
      ctx.fillStyle = "#7a4a1c";
      ctx.fillRect(x, base - 90, 10, 90);
      ctx.fillStyle = "#2fae5a";
      for (let k = 0; k < 4; k++) {
        const dir = k < 2 ? -1 : 1;
        ctx.fillRect(x + (dir < 0 ? -46 : 8), base - 96 - (k % 2) * 12, 48, 8);
      }
    }
  }

  private drawTile(ch: string, x: number, y: number) {
    const ctx = this.ctx;
    const sonicTile = this.sonicMode && x < this.sonicX;
    if (sonicTile && (ch === "G" || ch === "X")) {
      if (ch === "G") {
        ctx.fillStyle = "#39c04a";
        ctx.fillRect(x, y, TILE, 12);
        ctx.fillStyle = "#1f9c37";
        for (let i = 0; i < TILE; i += 8) ctx.fillRect(x + i, y, 4, 12);
      }
      for (let r = 0; r < TILE; r += 8) {
        for (let c = 0; c < TILE; c += 8) {
          const odd = ((x + c) / 8 + (y + r) / 8) % 2 === 0;
          ctx.fillStyle = odd ? "#b4761f" : "#8a5514";
          ctx.fillRect(x + c, y + r + (ch === "G" ? 12 : 0), 8, 8);
        }
      }
      return;
    }
    if (sonicTile && ch === "F") {
      ctx.fillStyle = "#ffd83d";
      ctx.fillRect(x + 8, y - 40, 16, 40);
      ctx.fillStyle = "#1f6fe0";
      ctx.fillRect(x + 2, y - 56, 28, 18);
      return;
    }
    if (ch === "H") {
      ch = "B";
    }
    if (ch === "G") {
      ctx.fillStyle = "#3fbf4f";
      ctx.fillRect(x, y, TILE, 10);
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(x, y + 10, TILE, TILE - 10);
      ctx.fillStyle = "#6d451f";
      ctx.fillRect(x + 4, y + 16, 6, 6);
      ctx.fillRect(x + 20, y + 22, 6, 6);
    } else if (ch === "X") {
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#6d451f";
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = "#a26a33";
      ctx.fillRect(x + 4, y + 4, TILE - 8, 4);
    } else if (ch === "B") {
      ctx.fillStyle = "#c1662f";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#8f4620";
      for (let r = 0; r < 4; r++) ctx.fillRect(x, y + r * 8 + 7, TILE, 2);
      for (let r = 0; r < 4; r++) ctx.fillRect(x + (r % 2 ? 8 : 22), y + r * 8, 2, 8);
    } else if (ch === "?") {
      ctx.fillStyle = "#e8a020";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#b06f0c";
      ctx.fillRect(x, y, TILE, 3);
      ctx.fillRect(x, y + TILE - 3, TILE, 3);
      ctx.fillStyle = "#fff3c4";
      ctx.fillRect(x + 11, y + 8, 10, 4);
      ctx.fillRect(x + 18, y + 12, 4, 5);
      ctx.fillRect(x + 13, y + 16, 8, 4);
      ctx.fillRect(x + 13, y + 22, 5, 4);
    } else if (ch === "P") {
      ctx.fillStyle = "#9a6b3f";
      ctx.fillRect(x, y, TILE, 12);
      ctx.fillStyle = "#c99a63";
      ctx.fillRect(x, y, TILE, 4);
    } else if (ch === "C") {
      const t = (performance.now() / 120) % 4;
      const w = t < 2 ? 12 : 6;
      ctx.fillStyle = "#f5d442";
      ctx.fillRect(x + 16 - w / 2, y + 8, w, 16);
      ctx.fillStyle = "#c9a713";
      ctx.fillRect(x + 16 - w / 2, y + 14, w, 4);
    } else if (ch === "F") {
      ctx.fillStyle = "#dddddd";
      ctx.fillRect(x + 14, y - TILE * 5, 4, TILE * 6);
      ctx.fillStyle = "#e64539";
      ctx.beginPath();
      ctx.moveTo(x + 18, y - TILE * 5);
      ctx.lineTo(x + 18 + 34, y - TILE * 5 + 12);
      ctx.lineTo(x + 18, y - TILE * 5 + 24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#333";
      ctx.fillRect(x + 8, y + TILE - 6, 16, 6);
    } else if (ch === "O" || ch === "E") {
      const body = ch === "O" ? "#e8862a" : "#2fae5a";
      const dark = ch === "O" ? "#a95a12" : "#1d7a3c";
      ctx.fillStyle = body;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = dark;
      ctx.fillRect(x + TILE - 6, y, 6, TILE);
      ctx.fillRect(x, y, TILE, 3);
      ctx.fillStyle = "#ffd9a8";
      ctx.fillRect(x + 3, y + 4, 4, TILE - 8);
    } else if (ch === "D") {
      ctx.fillStyle = "#2a2f52";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#1b1f3a";
      ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
    } else if (ch === "S") {
      ctx.fillStyle = "#4a5188";
      ctx.fillRect(x, y, TILE, 8);
      ctx.fillStyle = "#2a2f52";
      ctx.fillRect(x, y + 8, TILE, TILE - 8);
    }
  }


  private drawEnemy(e: Enemy) {
    const ctx = this.ctx;
    const wobble = Math.floor(performance.now() / 160) % 2;
    ctx.fillStyle = "#8b4b2b";
    ctx.fillRect(e.x + 2, e.y + 6, 24, 20);
    ctx.fillStyle = "#5f3018";
    ctx.fillRect(e.x, e.y + 12, 28, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(e.x + 6, e.y + 10, 5, 5);
    ctx.fillRect(e.x + 17, e.y + 10, 5, 5);
    ctx.fillStyle = "#000000";
    ctx.fillRect(e.x + 8, e.y + 12, 3, 3);
    ctx.fillRect(e.x + 19, e.y + 12, 3, 3);
    ctx.fillStyle = "#3a2013";
    ctx.fillRect(e.x + (wobble ? 2 : 6), e.y + 26, 8, 4);
    ctx.fillRect(e.x + (wobble ? 18 : 14), e.y + 26, 8, 4);
  }

  private drawPlayer(p: PlayerState) {
    const ctx = this.ctx;
    if (!p.alive && p.lives <= 0) return;
    const god = this.godMode.has(p.index);
    if (!god && p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;
    const color = PLAYER_COLORS[p.index % 4] ?? "#e64539";

    const x = Math.round(p.x - PW / 2);
    const y = Math.round(p.y);
    const step = Math.floor(p.anim) % 4;

    // cap
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y, 16, 6);
    ctx.fillRect(p.facing === 1 ? x + 13 : x + 1, y + 4, 8, 3);
    // face
    ctx.fillStyle = "#ffc79a";
    ctx.fillRect(x + 3, y + 6, 16, 9);
    ctx.fillStyle = "#241a12";
    ctx.fillRect(p.facing === 1 ? x + 13 : x + 6, y + 8, 3, 3);
    // body
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 15, 20, 9);
    ctx.fillStyle = "#2b48b5";
    ctx.fillRect(x + 4, y + 20, 14, 6);
    // legs
    ctx.fillStyle = "#2b48b5";
    if (!p.onGround) {
      ctx.fillRect(x + 2, y + 24, 7, 4);
      ctx.fillRect(x + 13, y + 24, 7, 4);
    } else if (step === 1 || step === 3) {
      ctx.fillRect(x + 4, y + 24, 8, 4);
      ctx.fillRect(x + 12, y + 26, 7, 2);
    } else {
      ctx.fillRect(x + 2, y + 26, 8, 2);
      ctx.fillRect(x + 12, y + 24, 8, 4);
    }
    // name tag for multiplayer
    if (this.players.length > 1) {
      ctx.fillStyle = color;
      ctx.fillRect(x + 8, y - 10, 6, 5);
    }

    // shimmering aura for permanent invincibility
    if (god) {
      const t = performance.now() / 90;
      ctx.strokeStyle = `hsl(${Math.floor(t * 8) % 360} 100% 65%)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 3, PW + 6, PH + 6);
      for (let i = 0; i < 4; i++) {
        const a = t * 0.6 + (i * Math.PI) / 2;
        ctx.fillStyle = "#fff3a8";
        ctx.fillRect(Math.round(x + 10 + Math.cos(a) * 20), Math.round(y + 14 + Math.sin(a) * 20), 3, 3);
      }
    }

    // speed boots aura
    if (p.boots > 0) {
      const t = performance.now() / 60;
      ctx.strokeStyle = `rgba(95,209,255,${0.5 + Math.sin(t) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 4, y - 4, PW + 8, PH + 8);
      ctx.fillStyle = "#5fd1ff";
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(Math.round(x - p.facing * i * 10), Math.round(y + 10 + i * 4), 8, 2);
      }
    }

    // chat bubble
    const bubble = this.bubbles.get(p.index);
    if (bubble) {
      if (performance.now() > bubble.until) {
        this.bubbles.delete(p.index);
      } else {
        ctx.font = "10px monospace";
        ctx.textBaseline = "top";
        const w = Math.ceil(ctx.measureText(bubble.text).width) + 10;
        const bx = Math.round(x + PW / 2 - w / 2);
        const by = y - 30;
        ctx.fillStyle = "rgba(12,12,20,0.88)";
        ctx.fillRect(bx, by, w, 16);
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, w, 2);
        ctx.fillRect(bx + w / 2 - 3, by + 16, 6, 4);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(bubble.text, bx + 5, by + 3);
      }
    }
  }
}

