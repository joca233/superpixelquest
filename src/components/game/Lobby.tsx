import { useMemo, useState } from "react";
import { PLAYER_COLORS, PLAYER_NAMES } from "@/game/engine";
import { sfx } from "@/game/audio";
import type { RoomPlayer } from "@/hooks/useRoom";
import { toast } from "sonner";

type Props = {
  roomCode: string;
  players: RoomPlayer[];
  connected: boolean;
  isHost: boolean;
  meId: string;
  onStart: () => void;
  onBack: () => void;
};

export function Lobby({ roomCode, players, connected, isHost, meId, onStart, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("sala", roomCode);
    return url.toString();
  }, [roomCode]);

  const copy = async () => {
    sfx.select();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado! Envie para seus amigos.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link manualmente.");
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-shadow-pixel text-center font-display text-lg text-accent sm:text-2xl">SALA WIFI</h1>
        <p className="mt-4 text-center font-display text-[9px] text-muted-foreground">
          CÓDIGO DA SALA: <span className="text-foreground">{roomCode}</span>
        </p>
        <p className="mt-2 text-center font-display text-[8px] text-muted-foreground">
          {connected ? "CONECTADO" : "CONECTANDO..."} · {players.length}/4 JOGADORES
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, slot) => {
            const p = players.find((pl) => pl.slot === slot);
            return (
              <div
                key={slot}
                className="pixel-frame flex items-center gap-3 rounded-sm bg-card p-4"
                style={{ opacity: p ? 1 : 0.45 }}
              >
                <span
                  className="h-6 w-6 shrink-0 border-4 border-foreground"
                  style={{ background: PLAYER_COLORS[slot] }}
                />
                <div className="min-w-0">
                  <div className="truncate font-display text-[9px]">{PLAYER_NAMES[slot]}</div>
                  <div className="mt-1 truncate font-display text-[7px] text-muted-foreground">
                    {p ? (p.id === meId ? "VOCÊ" : "PRONTO") : "AGUARDANDO..."}
                    {p && p.slot === 0 ? " · HOST" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pixel-frame mt-8 rounded-sm bg-card p-4">
          <div className="font-display text-[8px] text-muted-foreground">LINK DE CONVITE</div>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3 w-full rounded-sm border-2 border-border bg-input px-3 py-2 font-sans text-xs text-foreground"
          />
          <button
            onClick={copy}
            className="pixel-btn mt-4 w-full rounded-sm bg-accent px-4 py-3 text-[10px] text-accent-foreground"
          >
            {copied ? "COPIADO!" : "COPIAR LINK DE CONVITE"}
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => {
              sfx.select();
              onStart();
            }}
            disabled={!isHost || players.length < 1}
            className="pixel-btn flex-1 rounded-sm bg-primary px-4 py-4 text-[10px] text-primary-foreground"
          >
            {isHost ? "INICIAR JOGO" : "AGUARDANDO O HOST..."}
          </button>
          <button
            onClick={onBack}
            className="pixel-btn rounded-sm bg-secondary px-4 py-4 text-[10px] text-secondary-foreground"
          >
            VOLTAR
          </button>
        </div>
      </div>
    </main>
  );
}
