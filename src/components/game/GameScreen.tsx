import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine, PLAYER_COLORS, type ControlScheme, type HudState, type NetSnapshot } from "@/game/engine";
import { sfx, setMuted, isMuted } from "@/game/audio";
import { ChatPanel } from "@/components/game/ChatPanel";
import type { ChatMessage } from "@/hooks/useRoom";
import { extractAmiiboPalette, parseAmiiboCommand } from "@/game/amiibo";

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
const AMIIBO_COMMAND = "/amiibo";

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
  const amiiboInputRef = useRef<HTMLInputElement | null>(null);
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
    boots: 0,
    sonic: 0,
    ending: "none",
  });
  const [highScore, setHighScore] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [runId, setRunId] = useState(0);

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

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
      onSonicEnd: () => window.setTimeout(() => onExitRef.current(), 1200),

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

  // Secret code: → ↑ ↓ ← then Space = 99 lives
  useEffect(() => {
    const seq = ["ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft", " "];
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key === "Spacebar" ? " " : e.key;
      if (k === seq[pos]) pos++;
      else pos = k === seq[0] ? 1 : 0;
      if (pos === seq.length) {
        pos = 0;
        engineRef.current?.setMaxLives(localIndices);
        sfx.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  /* ---------------- Chat (WiFi mode only) ---------------- */
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const chatRef = useRef(chat);
  chatRef.current = chat;

  useEffect(() => {
    engineRef.current?.setInputLocked(chatOpen);
  }, [chatOpen, runId]);

  // Incoming messages: bubble over the sender, plus remote god-mode sync.
  useEffect(() => {
    if (!chat) return;
    chat.onChatMessage((m) => {
      const amiiboPalette = parseAmiiboCommand(m.text);
      if (amiiboPalette) {
        engineRef.current?.setPlayerPalette(m.slot, amiiboPalette);
        engineRef.current?.setChatBubble(m.slot, "PALETA AMIIBO!");
      } else if (m.text.toLowerCase().startsWith(GOD_COMMAND)) {
        engineRef.current?.setGodMode(m.slot, true);
        engineRef.current?.setChatBubble(m.slot, "✦ INVENCÍVEL ✦");
      } else {
        engineRef.current?.setChatBubble(m.slot, m.text);
      }
    });
  }, [chat]);

  // "T" opens the chat, "ESC" closes it.
  useEffect(() => {
    if (!chat) return;
    const onKey = (e: KeyboardEvent) => {
      if (chatOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setChatOpen(false);
          setDraft("");
        }
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setChatOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat, chatOpen]);

  const submitChat = useCallback(async () => {
    const api = chatRef.current;
    const text = draft.trim();
    setDraft("");
    if (!api || !text) {
      setChatOpen(false);
      return;
    }
    const lower = text.toLowerCase();

    if (lower === "/voicechat") {
      const on = await api.toggleVoice();
      api.addSystemMessage(
        on ? "Chat de voz ATIVADO — fale com a sala." : (api.voiceError ?? "Chat de voz DESATIVADO."),
      );
      setChatOpen(false);
      return;
    }

    if (lower === GOD_COMMAND) {
      engineRef.current?.setGodMode(api.mySlot, true);
      engineRef.current?.setChatBubble(api.mySlot, "✦ INVENCÍVEL ✦");
      api.sendChat(GOD_COMMAND);
      api.addSystemMessage("Invencibilidade infinita ativada!");
      setChatOpen(false);
      return;
    }

    if (lower === AMIIBO_COMMAND) {
      setChatOpen(false);
      amiiboInputRef.current?.click();
      return;
    }

    if (lower.startsWith("/")) {
      api.addSystemMessage("Comando desconhecido. Tente /voicechat, /amiibo ou /invencibilidade infinita");
      setChatOpen(false);
      return;
    }

    api.sendChat(text);
    engineRef.current?.setChatBubble(api.mySlot, text);
    setChatOpen(false);
  }, [draft]);

  const loadAmiibo = useCallback(async (file: File | undefined) => {
    const api = chatRef.current;
    if (!api || !file) return;
    try {
      const palette = await extractAmiiboPalette(file);
      engineRef.current?.setPlayerPalette(api.mySlot, palette);
      engineRef.current?.setChatBubble(api.mySlot, "PALETA AMIIBO!");
      api.sendChat(`${AMIIBO_COMMAND} ${palette.join(",")}`);
      api.addSystemMessage("Paleta Amiibo aplicada ao seu personagem!");
    } catch (error) {
      api.addSystemMessage(error instanceof Error ? error.message : "Não foi possível analisar essa imagem.");
    } finally {
      if (amiiboInputRef.current) amiiboInputRef.current.value = "";
    }
  }, []);


  return (
    <div className="min-h-screen bg-background px-2 py-3 sm:px-4 sm:py-6">
      {chat && (
        <input
          ref={amiiboInputRef}
          type="file"
          accept="image/png,.png"
          className="sr-only"
          aria-label="Selecionar imagem PNG do Amiibo"
          onChange={(event) => void loadAmiibo(event.target.files?.[0])}
        />
      )}
      <div className="mx-auto w-full max-w-5xl">
        {/* HUD */}
        <div className="pixel-frame mb-3 grid grid-cols-2 gap-2 rounded-sm bg-card p-3 font-display text-[9px] sm:grid-cols-5 sm:text-[10px]">
          <Stat label="PONTOS" value={String(hud.score).padStart(6, "0")} />
          <Stat label="MOEDAS" value={`x${String(hud.coins).padStart(2, "0")}`} accent />
          <Stat label="VIDAS" value={"♥".repeat(Math.max(0, hud.lives)) || "—"} />
          <Stat label="TEMPO" value={String(hud.time).padStart(3, "0")} />
          <Stat label="RECORDE" value={String(highScore).padStart(6, "0")} />
          {hud.boots > 0 && <Stat label="BOTAS" value="TURBO" accent />}
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

          {hud.sonic > 0 && hud.status === "playing" && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `radial-gradient(circle at 50% 60%, transparent ${70 - hud.sonic * 40}%, rgba(15,120,220,${hud.sonic * 0.55}) 100%)` }}
            />
          )}

          {hud.status !== "playing" && (
            <div className="absolute inset-0 grid place-items-center bg-background/85 p-4 text-center">
              <div className="animate-fade-in">
                <h2 className="text-shadow-pixel font-display text-lg text-accent sm:text-2xl">
                  {hud.status === "won"
                    ? hud.ending === "sonic"
                      ? "DIMENSÃO DO SONIC ALCANÇADA!"
                      : "FASE COMPLETA!"
                    : "FIM DE JOGO"}
                </h2>
                {hud.status === "won" && hud.ending === "sonic" && (
                  <p className="mt-3 font-display text-[8px] leading-relaxed text-primary sm:text-[10px]">
                    FINAL SECRETO · GREEN HILL ZONE
                    <br />
                    CRÉDITOS: SUPER PIXEL QUEST — ENGINE, ARTE E SOM PIXEL
                    <br />
                    OBRIGADO POR JOGAR!
                  </p>
                )}
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

          {chat && (
            <ChatPanel
              messages={chat.messages}
              open={chatOpen}
              draft={draft}
              onDraft={setDraft}
              onSubmit={() => void submitChat()}
              onClose={() => {
                setChatOpen(false);
                setDraft("");
              }}
              voiceEnabled={chat.voiceEnabled}
            />
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
          <div className="flex items-end gap-3">
            {chat && (
              <button
                onClick={() => setChatOpen((v) => !v)}
                className="pixel-btn h-16 w-16 select-none rounded-sm bg-accent font-display text-[9px] text-accent-foreground"
              >
                CHAT
              </button>
            )}
            <TouchBtn label="A" big onDown={() => touch("jump", true)} onUp={() => touch("jump", false)} />
          </div>
        </div>

        <p className="mt-4 hidden font-display text-[8px] leading-relaxed text-muted-foreground md:block">
          A/D ou ◀ ▶ para mover · ESPAÇO / ▲ para pular · S / ▼ para descer no cano
          {chat ? " · T para abrir o chat (/voicechat · /invencibilidade infinita)" : ""}
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
