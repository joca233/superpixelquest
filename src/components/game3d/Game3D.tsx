import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sfx } from "@/game/audio";
import { buildLevel3D, type Box } from "./level3d";

type Hud = { score: number; coins: number; lives: number; time: number; status: "playing" | "won" | "lost" };
type Input = { f: number; r: number; jump: boolean; turn: number };

const GRAVITY = 30;
const JUMP_V = 12.5;
const SPEED = 7;
const ACCEL = 14;
const PR = 0.35; // player half width
const PH = 1.4; // player height
const CAM_D = 8;
const CAM_H = 4.5;

function makeTexture(base: string, dark: string, kind: Box["kind"]) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark;
  if (kind === "brick") {
    g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1);
    g.fillRect(7, 0, 1, 7); g.fillRect(3, 8, 1, 7); g.fillRect(11, 8, 1, 7);
  } else {
    let s = kind === "grass" ? 3 : 11;
    for (let i = 0; i < 22; i++) {
      s = (s * 9301 + 49297) % 233280;
      const x = s % 16; s = (s * 9301 + 49297) % 233280;
      g.fillRect(x, s % 16, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export default function Game3D({ onExit, startWithMaxLives }: { onExit: () => void; startWithMaxLives?: boolean }) {
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState<Hud>({ score: 0, coins: 0, lives: startWithMaxLives ? 99 : 3, time: 400, status: "playing" });
  const input = useRef<Input>({ f: 0, r: 0, jump: false, turn: 0 });
  const touch = useRef({ l: false, r: false, u: false, d: false });
  const yaw = useRef(0);

  useEffect(() => {
    const keys = new Set<string>();
    const sync = () => {
      const t = touch.current;
      input.current.f = (keys.has("w") || keys.has("arrowup") || t.u ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") || t.d ? 1 : 0);
      input.current.r = (keys.has("d") || t.r ? 1 : 0) - (keys.has("a") || t.l ? 1 : 0);
      input.current.turn = (keys.has("arrowright") || keys.has("e") ? 1 : 0) - (keys.has("arrowleft") || keys.has("q") ? 1 : 0);
      input.current.jump = keys.has(" ") || keys.has("enter");
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") return onExit();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      keys.add(k); sync();
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); sync(); };
    // drag to rotate camera
    let dragging = false, lastX = 0;
    const pd = (e: PointerEvent) => { if ((e.target as HTMLElement).tagName === "CANVAS") { dragging = true; lastX = e.clientX; } };
    const pm = (e: PointerEvent) => { if (dragging) { yaw.current -= (e.clientX - lastX) * 0.008; lastX = e.clientX; } };
    const pu = () => { dragging = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    (touch.current as unknown as { sync: () => void }).sync = sync;
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
    };
  }, [onExit]);

  const setTouch = (k: "l" | "r" | "u" | "d", v: boolean) => {
    touch.current[k] = v;
    (touch.current as unknown as { sync: () => void }).sync?.();
  };

  return (
    <div className="fixed inset-0 bg-background">
      <Canvas key={runId} shadows dpr={[1, 1.75]} camera={{ fov: 60, position: [0, 5, 8] }}>
        <color attach="background" args={["#8fd3ff"]} />
        <fog attach="fog" args={["#8fd3ff", 30, 110]} />
        <hemisphereLight args={["#ffffff", "#5a7a3a", 0.6]} />
        <directionalLight position={[20, 30, 10]} intensity={1.8} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-far={120} />
        <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={1} color="#bde" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <World input={input} yaw={yaw} startLives={startWithMaxLives ? 99 : 3} onHud={setHud} />
      </Canvas>

      {/* HUD */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-10 p-3">
        <div className="pixel-frame mx-auto grid max-w-3xl grid-cols-4 gap-2 rounded-sm bg-card/90 p-3 font-display text-[9px] sm:text-[10px]">
          <Stat label="PONTOS" value={String(hud.score).padStart(6, "0")} />
          <Stat label="MOEDAS" value={`x${String(hud.coins).padStart(2, "0")}`} accent />
          <Stat label="VIDAS" value={hud.lives > 9 ? `♥x${hud.lives}` : "♥".repeat(Math.max(0, hud.lives)) || "—"} />
          <Stat label="TEMPO" value={String(hud.time).padStart(3, "0")} />
        </div>
      </div>
      <div className="fixed right-3 bottom-3 z-10 flex gap-2 max-md:top-24 max-md:bottom-auto">
        <button onClick={onExit} className="pixel-btn rounded-sm bg-secondary px-3 py-2 font-display text-[9px] text-secondary-foreground">SAIR</button>
      </div>
      <p className="pointer-events-none fixed bottom-3 left-3 z-10 hidden font-display text-[8px] leading-relaxed text-foreground md:block">
        MUNDO 3D · WASD mover · ESPAÇO pular · ◀ ▶ / Q E ou arrastar girar câmera · ESC sair
      </p>

      {hud.status !== "playing" && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-background/85 p-4 text-center">
          <div>
            <h2 className="text-shadow-pixel font-display text-lg text-accent sm:text-2xl">
              {hud.status === "won" ? "MUNDO 3D COMPLETO!" : "FIM DE JOGO"}
            </h2>
            <p className="mt-4 font-display text-[10px] text-muted-foreground">PONTUAÇÃO {String(hud.score).padStart(6, "0")}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => { sfx.select(); setRunId((n) => n + 1); }} className="pixel-btn rounded-sm bg-primary px-4 py-3 font-display text-[10px] text-primary-foreground">JOGAR DE NOVO</button>
              <button onClick={onExit} className="pixel-btn rounded-sm bg-secondary px-4 py-3 font-display text-[10px] text-secondary-foreground">MENU</button>
            </div>
          </div>
        </div>
      )}

      {/* Touch controls (any touch device) */}
      <div className="fixed inset-x-0 bottom-4 z-10 hidden items-end justify-between px-4 [@media(pointer:coarse)]:flex [@media(hover:none)]:flex" style={{ touchAction: "none" }}>
        <div className="grid grid-cols-3 gap-2">
          <span />
          <TBtn label="▲" on={(v) => setTouch("u", v)} />
          <span />
          <TBtn label="◀" on={(v) => setTouch("l", v)} />
          <TBtn label="▼" on={(v) => setTouch("d", v)} />
          <TBtn label="▶" on={(v) => setTouch("r", v)} />
        </div>
        <TBtn label="A" big on={(v) => { input.current.jump = v; }} />
      </div>
    </div>
  );
}

function World({ input, yaw, startLives, onHud }: {
  input: React.RefObject<Input>; yaw: React.RefObject<number>; startLives: number; onHud: (h: Hud) => void;
}) {
  const level = useMemo(() => buildLevel3D(), []);
  const { camera } = useThree();
  const player = useRef<THREE.Group>(null);
  const coinRefs = useRef<(THREE.Mesh | null)[]>([]);
  const enemyRefs = useRef<(THREE.Group | null)[]>([]);
  const st = useRef({
    p: new THREE.Vector3(0, 1, 3), v: new THREE.Vector3(), ground: false, jumpHeld: false, facing: 0,
    score: 0, coins: 0, lives: startLives, time: 400, timeAcc: 0, status: "playing" as Hud["status"], inv: 0, last: "",
  });
  const textures = useMemo(() => ({
    grass: makeTexture("#5fae3c", "#4a8f2c", "grass"),
    stone: makeTexture("#9aa0a6", "#7d8288", "stone"),
    brick: makeTexture("#c0602c", "#7a3414", "brick"),
    dirt: makeTexture("#8a5a2b", "#6e4420", "stone"),
  }), []);

  const emit = () => {
    const s = st.current;
    const h: Hud = { score: s.score, coins: s.coins, lives: s.lives, time: s.time, status: s.status };
    const key = JSON.stringify(h);
    if (key !== s.last) { s.last = key; onHud(h); }
  };

  const overlaps = (p: THREE.Vector3, b: Box) =>
    p.x + PR > b.x - b.w / 2 && p.x - PR < b.x + b.w / 2 &&
    p.z + PR > b.z - b.d / 2 && p.z - PR < b.z + b.d / 2 &&
    p.y + PH > b.y - b.h / 2 && p.y < b.y + b.h / 2;

  const respawn = () => {
    const s = st.current;
    s.lives -= 1;
    sfx.death();
    if (s.lives <= 0) { s.status = "lost"; return; }
    s.p.set(0, 1, 3); s.v.set(0, 0, 0); s.inv = 2; yaw.current = 0;
  };

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const s = st.current;
    const inp = input.current;
    const t = performance.now() / 1000;

    // coins spin + enemies move (always animate)
    level.coins.forEach((c, i) => {
      const m = coinRefs.current[i];
      if (m) { m.visible = !c.taken; m.rotation.y = t * 3; m.position.y = c.y + Math.sin(t * 3 + i) * 0.15; }
    });
    level.enemies.forEach((e, i) => {
      const g = enemyRefs.current[i];
      if (!g) return;
      if (e.alive) {
        const cur = e[e.ax] + e.dir * 2.2 * dt;
        if (cur < e.min || cur > e.max) e.dir *= -1; else e[e.ax] = cur;
        g.position.set(e.x, e.y, e.z);
        g.rotation.y = e.ax === "x" ? (e.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (e.dir > 0 ? 0 : Math.PI);
      } else {
        e.squash += dt;
        g.scale.set(1, Math.max(0.15, 1 - e.squash * 6), 1);
        g.visible = e.squash < 0.6;
      }
    });

    if (s.status !== "playing") return;

    yaw.current += inp.turn * 2.2 * dt;
    const y = yaw.current;
    const fwd = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y));
    const right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
    const want = fwd.multiplyScalar(inp.f).add(right.multiplyScalar(inp.r));
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(SPEED);
    const k = 1 - Math.exp(-ACCEL * dt);
    s.v.x += (want.x - s.v.x) * k;
    s.v.z += (want.z - s.v.z) * k;
    if (want.lengthSq() > 0.1) s.facing = Math.atan2(want.x, want.z);

    if (inp.jump && s.ground && !s.jumpHeld) { s.v.y = JUMP_V; s.ground = false; sfx.jump(); }
    if (!inp.jump && s.v.y > 0) s.v.y -= GRAVITY * 1.5 * dt; // short hop
    s.jumpHeld = inp.jump;
    s.v.y -= GRAVITY * dt;

    // axis-separated collision
    for (const ax of ["x", "z", "y"] as const) {
      s.p[ax] += s.v[ax] * dt;
      if (ax === "y") s.ground = false;
      for (const b of level.boxes) {
        if (!overlaps(s.p, b)) continue;
        if (ax === "x") s.p.x = s.v.x > 0 ? b.x - b.w / 2 - PR : b.x + b.w / 2 + PR;
        else if (ax === "z") s.p.z = s.v.z > 0 ? b.z - b.d / 2 - PR : b.z + b.d / 2 + PR;
        else if (s.v.y <= 0) { s.p.y = b.y + b.h / 2; s.ground = true; }
        else { s.p.y = b.y - b.h / 2 - PH; if (b.kind === "brick") { sfx.bump(); s.score += 10; } }
        if (ax === "y") s.v.y = 0; else s.v[ax] = 0;
      }
    }

    if (s.p.y < -15) respawn();
    if (s.inv > 0) s.inv -= dt;

    // coins
    for (const c of level.coins) {
      if (!c.taken && Math.abs(c.x - s.p.x) < 0.8 && Math.abs(c.z - s.p.z) < 0.8 && Math.abs(c.y - (s.p.y + 0.7)) < 1) {
        c.taken = true; s.coins++; s.score += 100; sfx.coin();
        if (s.coins % 50 === 0) s.lives = Math.min(99, s.lives + 1);
      }
    }
    // enemies
    for (const e of level.enemies) {
      if (!e.alive) continue;
      const dx = e.x - s.p.x, dz = e.z - s.p.z;
      if (dx * dx + dz * dz < 0.8 && Math.abs(e.y - s.p.y) < 1.1) {
        if (s.v.y < -1 && s.p.y > e.y + 0.4) { e.alive = false; s.v.y = JUMP_V * 0.7; s.score += 200; sfx.stomp(); }
        else if (s.inv <= 0) respawn();
      }
    }
    // goal
    const f = level.flag;
    if (Math.hypot(f.x - s.p.x, f.z - s.p.z) < 1.2 && s.p.y < f.y + 6) {
      s.status = "won"; s.score += s.time * 10; sfx.win();
      try { const hs = Number(localStorage.getItem("pixelquest_highscore") ?? "0"); if (s.score > hs) localStorage.setItem("pixelquest_highscore", String(s.score)); } catch { /* ignore */ }
    }
    // timer
    s.timeAcc += dt;
    if (s.timeAcc >= 1) { s.timeAcc -= 1; s.time--; if (s.time <= 0) { s.time = 400; respawn(); } }

    // apply to scene
    const g = player.current;
    if (g) {
      g.position.copy(s.p);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, s.facing, 1 - Math.exp(-12 * dt));
      g.visible = s.inv <= 0 || Math.floor(t * 12) % 2 === 0;
      const moving = Math.hypot(s.v.x, s.v.z) > 0.5 && s.ground;
      const legL = g.getObjectByName("legL"), legR = g.getObjectByName("legR");
      const sw = moving ? Math.sin(t * 14) * 0.6 : 0;
      if (legL) legL.rotation.x = sw;
      if (legR) legR.rotation.x = -sw;
    }
    const camTarget = new THREE.Vector3(s.p.x + Math.sin(y) * CAM_D, s.p.y + CAM_H, s.p.z + Math.cos(y) * CAM_D);
    camera.position.lerp(camTarget, 1 - Math.exp(-6 * dt));
    camera.lookAt(s.p.x, s.p.y + 1.2, s.p.z);
    emit();
  });

  return (
    <>
      {level.boxes.map((b, i) => (
        <group key={i} position={[b.x, b.y, b.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial map={textures[b.kind]} roughness={0.9} />
          </mesh>
          {b.kind !== "brick" && (
            <mesh position={[0, -b.h / 2 - 1.5, 0]} receiveShadow>
              <boxGeometry args={[b.w * 0.85, 3, b.d * 0.85]} />
              <meshStandardMaterial map={textures.dirt} roughness={1} />
            </mesh>
          )}
        </group>
      ))}
      {level.coins.map((c, i) => (
        <mesh key={c.id} ref={(m) => { coinRefs.current[i] = m; }} position={[c.x, c.y, c.z]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.1, 12]} />
          <meshStandardMaterial color="#ffcc22" metalness={0.7} roughness={0.25} emissive="#664400" />
        </mesh>
      ))}
      {level.enemies.map((e, i) => (
        <group key={e.id} ref={(g) => { enemyRefs.current[i] = g; }} position={[e.x, e.y, e.z]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[0.9, 0.7, 0.9]} />
            <meshStandardMaterial color="#8b4a1c" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.7, 0.2, 0.7]} />
            <meshStandardMaterial color="#f2d6a0" />
          </mesh>
          <mesh position={[-0.2, 0.55, 0.46]}><boxGeometry args={[0.15, 0.25, 0.02]} /><meshBasicMaterial color="#111" /></mesh>
          <mesh position={[0.2, 0.55, 0.46]}><boxGeometry args={[0.15, 0.25, 0.02]} /><meshBasicMaterial color="#111" /></mesh>
        </group>
      ))}
      {/* Flag */}
      <group position={[level.flag.x, level.flag.y, level.flag.z]}>
        <mesh position={[0, 3.5, 0]} castShadow><cylinderGeometry args={[0.08, 0.08, 7, 8]} /><meshStandardMaterial color="#e8e8e8" metalness={0.6} /></mesh>
        <mesh position={[0, 7.1, 0]}><sphereGeometry args={[0.2, 10, 10]} /><meshStandardMaterial color="#ffcc22" metalness={0.7} /></mesh>
        <mesh position={[0.7, 6.2, 0]} castShadow><boxGeometry args={[1.4, 0.9, 0.05]} /><meshStandardMaterial color="#2fb24a" /></mesh>
        <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[1, 0.8, 1]} /><meshStandardMaterial map={textures.stone} /></mesh>
      </group>
      {/* Player — voxel hero */}
      <group ref={player}>
        <mesh position={[0, 0.85, 0]} castShadow><boxGeometry args={[0.6, 0.55, 0.4]} /><meshStandardMaterial color="#d8312a" /></mesh>
        <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[0.62, 0.25, 0.42]} /><meshStandardMaterial color="#2a4fb8" /></mesh>
        <mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[0.5, 0.45, 0.45]} /><meshStandardMaterial color="#f1c39a" /></mesh>
        <mesh position={[0, 1.58, 0.05]} castShadow><boxGeometry args={[0.56, 0.14, 0.6]} /><meshStandardMaterial color="#d8312a" /></mesh>
        <mesh position={[-0.11, 1.35, 0.23]}><boxGeometry args={[0.07, 0.1, 0.02]} /><meshBasicMaterial color="#111" /></mesh>
        <mesh position={[0.11, 1.35, 0.23]}><boxGeometry args={[0.07, 0.1, 0.02]} /><meshBasicMaterial color="#111" /></mesh>
        <group name="legL" position={[-0.15, 0.45, 0]}><mesh position={[0, -0.22, 0]} castShadow><boxGeometry args={[0.22, 0.45, 0.25]} /><meshStandardMaterial color="#5a3418" /></mesh></group>
        <group name="legR" position={[0.15, 0.45, 0]}><mesh position={[0, -0.22, 0]} castShadow><boxGeometry args={[0.22, 0.45, 0.25]} /><meshStandardMaterial color="#5a3418" /></mesh></group>
      </group>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground">{label}</div>
      <div className={accent ? "mt-1 text-accent" : "mt-1 text-foreground"}>{value}</div>
    </div>
  );
}

function TBtn({ label, on, big }: { label: string; on: (v: boolean) => void; big?: boolean }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); on(true); }}
      onPointerUp={() => on(false)}
      onPointerLeave={() => on(false)}
      onPointerCancel={() => on(false)}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      className={`pixel-btn select-none rounded-sm font-display ${big ? "h-20 w-20 bg-primary text-lg text-primary-foreground" : "h-14 w-14 bg-secondary text-secondary-foreground"}`}
    >
      {label}
    </button>
  );
}
