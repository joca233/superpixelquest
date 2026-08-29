import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine, PLAYER_COLORS, type ControlScheme, type HudState, type NetSnapshot } from "@/game/engine";
import { sfx, setMuted, isMuted } from "@/game/audio";
import { ChatPanel } from "@/components/game/ChatPanel";
import type { ChatMessage } from "@/hooks/useRoom";

export type ChatApi = {
  messages: ChatMessage[];
  mySlot: number;
  sendChat: (text: string) => ChatMessage;
  onChatMessage: (fn: (m: ChatMessage) => void) => void;
  addSystemMessage: (text: string) => void;
  toggleVoice: () => Promise<boolean>;
  voiceEnabled: boolean;
  voiceError: string | null;
};

const GOD_COMMAND = "/invencibilidade infinita";

type Props = {
  playerCount: number;
  localIndices: number[];
  schemes: ControlScheme[];
  networked?: boolean;
  isHost?: boolean;
  sendState?: (s: NetSnapshot) => void;
  registerRemote?: (fn: (s: NetSnapshot) => void) => void;
  chat?: ChatApi;
  onExit: () => void;
  title: string;
};

const CANVAS_W = 960;
const CANVAS_H = 512;


export function GameScreen({
  playerCount,
  localIndices,
  schemes,
  networked = false,
  isHost = false,
  sendState,
  registerRemote,
  chat,
  onExit,
  title,
}: Props) {

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState>({
    score: 0,
    coins: 0,
    lives: 3,
    time: 300,
    status: "playing",
    secret: false,
    power: null,
    message: null,
    pushPct: 0,
  });
  const [highScore, setHighScore] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const engine = new GameEngine({
      canvas,
      playerCount,
      localIndices,
      schemes,
      isHost,
      networked,
      onHud: setHud,
      onNet: sendState ?? (() => {}),
    });
    engineRef.current = engine;
    registerRemote?.((snap) => engine.applyRemote(snap));
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    try {
      setHighScore(Number(localStorage.getItem("pixelquest_highscore") ?? "0"));
    } catch {
      /* ignore */
    }
  }, [hud.status]);

  const touch = (key: "left" | "right" | "jump" | "down", value: boolean) => {
    engineRef.current?.setTouch({ [key]: value });
  };

  const toggleMute = () => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  };

  return (
    <div className="min-h-screen bg-background px-2 py-3 sm:px-4 sm:py-6">
      <div className="mx-auto w-full max-w-5xl">
        {/* HUD */}
        <div className="pixel-frame mb-3 grid grid-cols-2 gap-2 rounded-sm bg-card p-3 font-display text-[9px] sm:grid-cols-5 sm:text-[10px]">
          <Stat label="PONTOS" value={String(hud.score).padStart(6, "0")} />
          <Stat label="MOEDAS" value={`x${String(hud.coins).padStart(2, "0")}`} accent />
          <Stat label="VIDAS" value={"♥".repeat(Math.max(0, hud.lives)) || "—"} />
          <Stat label="TEMPO" value={String(hud.time).padStart(3, "0")} />
          <Stat label="RECORDE" value={String(highScore).padStart(6, "0")} />
          {(hud.secret || hud.power) && (
            <Stat label={hud.secret ? "MODO SECRETO" : "ITEM"} value={hud.power ?? "ATIVO"} accent />
          )}
        </div>

        <div className="scanlines pixel-frame relative overflow-hidden rounded-sm bg-sky">
          <canvas ref={canvasRef} className="block h-auto w-full" style={{ imageRendering: "pixelated" }} />

          {hud.pushPct > 0 && hud.pushPct < 1 && (
            <div className="absolute left-1/2 top-3 w-40 -translate-x-1/2">
              <div className="h-2 w-full border-2 border-foreground bg-background">
                <div className="h-full bg-accent" style={{ width: `${Math.round(hud.pushPct * 100)}%` }} />
              </div>
            </div>
          )}

          {hud.message && (
            <div className="absolute inset-x-0 top-10 px-3 text-center">
              <span className="inline-block bg-background/85 px-3 py-2 font-display text-[8px] leading-relaxed text-accent sm:text-[10px]">
                {hud.message}
              </span>
            </div>
          )}

          {hud.status !== "playing" && (
            <div className="absolute inset-0 grid place-items-center bg-background/85 p-4 text-center">
              <div>
                <h2 className="text-shadow-pixel font-display text-lg text-accent sm:text-2xl">
                  {hud.status === "won" ? "FASE COMPLETA!" : "FIM DE JOGO"}
                </h2>
                <p className="mt-4 font-display text-[10px] text-muted-foreground">
                  PONTUAÇÃO {String(hud.score).padStart(6, "0")}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => {
                      sfx.select();
                      setRunId((n) => n + 1);
                    }}
                    className="pixel-btn rounded-sm bg-primary px-4 py-3 text-[10px] text-primary-foreground"
                  >
                    JOGAR DE NOVO
                  </button>
                  <button
                    onClick={onExit}
                    className="pixel-btn rounded-sm bg-secondary px-4 py-3 text-[10px] text-secondary-foreground"
                  >
                    MENU
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <p className="min-w-0 truncate font-display text-[8px] text-muted-foreground sm:text-[9px]">{title}</p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={toggleMute}
              className="pixel-btn rounded-sm bg-secondary px-3 py-2 text-[9px] text-secondary-foreground"
            >
              {muted ? "SOM OFF" : "SOM ON"}
            </button>
            <button
              onClick={onExit}
              className="pixel-btn rounded-sm bg-secondary px-3 py-2 text-[9px] text-secondary-foreground"
            >
              SAIR
            </button>
          </div>
        </div>

        {playerCount > 1 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {Array.from({ length: playerCount }).map((_, i) => (
              <span
                key={i}
                className="flex items-center gap-2 font-display text-[8px] text-muted-foreground"
                style={{ color: PLAYER_COLORS[i] }}
              >
                <span className="inline-block h-3 w-3 border-2 border-foreground" style={{ background: PLAYER_COLORS[i] }} />
                P{i + 1}
                {localIndices.includes(i) ? " (VOCÊ)" : ""}
              </span>
            ))}
          </div>
        )}

        {/* Mobile touch controls */}
        <div className="mt-4 flex items-end justify-between gap-4 md:hidden">
          <div className="flex gap-3">
            <TouchBtn label="◀" onDown={() => touch("left", true)} onUp={() => touch("left", false)} />
            <TouchBtn label="▶" onDown={() => touch("right", true)} onUp={() => touch("right", false)} />
            <TouchBtn label="▼" onDown={() => touch("down", true)} onUp={() => touch("down", false)} />
          </div>
          <TouchBtn label="A" big onDown={() => touch("jump", true)} onUp={() => touch("jump", false)} />
        </div>

        <p className="mt-4 hidden font-display text-[8px] leading-relaxed text-muted-foreground md:block">
          A/D ou ◀ ▶ para mover · ESPAÇO / ▲ para pular · S / ▼ para descer no cano
        </p>
      </div>
    </div>
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

function TouchBtn({
  label,
  onDown,
  onUp,
  big,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
  big?: boolean;
}) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`pixel-btn select-none rounded-sm font-display ${
        big ? "h-20 w-20 bg-primary text-primary-foreground text-lg" : "h-16 w-16 bg-secondary text-secondary-foreground"
      }`}
    >
      {label}
    </button>
  );
}
