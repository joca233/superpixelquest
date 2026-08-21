import { buildLevel, isSolid, LEVEL_COLS, LEVEL_ROWS, TILE, type LevelData } from "./level";
import { sfx } from "./audio";

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
};

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private level: LevelData;
  private players: PlayerState[] = [];
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private keys = new Set<string>();
  private touch = { left: false, right: false, jump: false };
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

  constructor(private opts: EngineOptions) {
    const ctx = opts.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível");
    this.ctx = ctx;
    this.level = buildLevel(1337);
    this.enemies = this.level.enemies.map((e, id) => ({ id, x: e.x, y: e.y, vx: 1.1, alive: true }));

    for (let i = 0; i < opts.playerCount; i++) {
      const local = opts.localIndices.includes(i);
      this.players.push({
        index: i,
        x: 64 + i * 26,
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
        tx: 64 + i * 26,
        ty: (LEVEL_ROWS - 3) * TILE,
      });
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  setTouch(t: Partial<{ left: boolean; right: boolean; jump: boolean }>) {
    Object.assign(this.touch, t);
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

  private pressed(p: PlayerState, action: "left" | "right" | "jump") {
    const k = this.keys;
    const wasd =
      action === "left" ? k.has("KeyA") : action === "right" ? k.has("KeyD") : k.has("Space") || k.has("KeyW");
    const arrows =
      action === "left"
        ? k.has("ArrowLeft")
        : action === "right"
          ? k.has("ArrowRight")
          : k.has("ArrowUp") || k.has("Enter");
    let base = p.scheme === "wasd" ? wasd : p.scheme === "arrows" ? arrows : wasd || arrows;
    if (this.opts.localIndices[0] === p.index) {
      base = base || (action === "left" ? this.touch.left : action === "right" ? this.touch.right : this.touch.jump);
    }
    return base;
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
      if (p.local && p.alive && p.active) this.collideEnemies(p);
    }

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

    const cam = this.players.find((p) => p.local) ?? this.players[0];
    if (cam) {
      const target = Math.max(0, Math.min(cam.x - this.opts.canvas.width / 2, LEVEL_COLS * TILE - this.opts.canvas.width));
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

    const left = this.pressed(p, "left");
    const right = this.pressed(p, "right");
    const jump = this.pressed(p, "jump");

    if (left) {
      p.vx -= ACCEL;
      p.facing = -1;
    }
    if (right) {
      p.vx += ACCEL;
      p.facing = 1;
    }
    if (!left && !right) p.vx *= FRICTION;
    p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx));
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    if (jump && p.onGround) {
      p.vy = JUMP_V;
      p.onGround = false;
      sfx.jump();
    }
    if (!jump && p.vy < -4) p.vy *= 0.86;

    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY);

    // Horizontal
    p.x += p.vx;
    if (p.x < 0) {
      p.x = 0;
      p.vx = 0;
    }
    this.resolveAxis(p, "x");

    // Vertical
    p.y += p.vy;
    p.onGround = false;
    this.resolveAxis(p, "y");

    this.collectTiles(p);

    if (p.vx !== 0 && p.onGround) p.anim = (p.anim + Math.abs(p.vx) * 0.4) % 4;
    else if (!p.onGround) p.anim = 4;

    if (p.y > LEVEL_ROWS * TILE + 80) this.killPlayer(p);

    if (!p.finished && p.x >= this.level.flagX - 6) {
      p.finished = true;
      p.score += 1000 + this.time * 10;
      this.status = "won";
      sfx.win();
      this.saveHighScore(p.score);
    }
  }

  private resolveAxis(p: PlayerState, axis: "x" | "y") {
    const left = p.x - PW / 2;
    const right = p.x + PW / 2;
    const top = p.y;
    const bottom = p.y + PH;
    const c0 = Math.floor(left / TILE);
    const c1 = Math.floor(right / TILE);
    const r0 = Math.floor(top / TILE);
    const r1 = Math.floor(bottom / TILE);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = this.level.grid.get(r, c);
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
    const ch = this.level.grid.get(r, c);
    const key = r * LEVEL_COLS + c;
    if (ch === "?") {
      this.level.grid.set(r, c, "X");
      p.coins++;
      p.score += 200;
      this.bumps.set(key, 10);
      this.spawnParticles(c * TILE + 16, r * TILE, "#f5d442", 6);
      sfx.coin();
    } else if (ch === "B") {
      this.level.grid.set(r, c, ".");
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
        if (this.level.grid.get(r, c) === "C") {
          this.level.grid.set(r, c, ".");
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
    p.x = Math.max(64, this.camX + 80);
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

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#3aa5f0");
    sky.addColorStop(1, "#9fd8ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    this.drawClouds(W, H);
    this.drawHills(W, H);

    ctx.save();
    ctx.translate(-Math.round(this.camX), 0);

    const c0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const c1 = Math.min(LEVEL_COLS - 1, Math.floor((this.camX + W) / TILE) + 1);

    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = this.level.grid.get(r, c);
        if (ch === ".") continue;
        const bump = this.bumps.get(r * LEVEL_COLS + c) ?? 0;
        const x = c * TILE;
        const y = r * TILE - (bump > 0 ? Math.sin((bump / 10) * Math.PI) * 8 : 0);
        this.drawTile(ch, x, y);
      }
    }

    for (const e of this.enemies) if (e.alive) this.drawEnemy(e);
    for (const p of this.players) if (p.active) this.drawPlayer(p);

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

  private drawTile(ch: string, x: number, y: number) {
    const ctx = this.ctx;
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
    if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;
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
  }
}
