import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { MainMenu } from "@/components/game/MainMenu";
import { GameScreen } from "@/components/game/GameScreen";
import { Lobby } from "@/components/game/Lobby";
import { makeRoomCode, useRoom } from "@/hooks/useRoom";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import type { ControlScheme } from "@/game/engine";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Super Pixel Quest — Plataforma 2D Retrô Online" },
      {
        name: "description",
        content:
          "Jogue Super Pixel Quest: plataforma 2D em pixel art com pulo preciso, moedas, inimigos, co-op no teclado e multiplayer para até 4 amigos por link.",
      },
      { property: "og:title", content: "Super Pixel Quest — Plataforma 2D Retrô Online" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Aventura de plataforma 8-bit no navegador: singleplayer, co-op local e multiplayer online até 4 jogadores.",
      },
    ],
  }),
  component: Index,
});

type Screen = "menu" | "single" | "local" | "lobby" | "net" | "3d" | "sonic";

const Game3D = lazy(() => import("@/components/game3d/Game3D"));

function Index() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [maxLives, setMaxLives] = useState(false);

  // Secret codes in the main menu (checked against the most recent keys):
  //  → ↑ ↓ ← Space           = 99 lives (doesn't start)
  //  ← ↑ → ↓ ← ← ↑ ↑ → → A B Space = start the 3D world
  // Plain Space otherwise starts a singleplayer run.
  useEffect(() => {
    if (screen !== "menu") return;
    const lives = ["ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft"];
    const threeD = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowUp", "ArrowRight", "ArrowRight", "a", "b"];
    let buf: string[] = [];
    const endsWith = (s: string[]) => buf.length >= s.length && s.every((k, i) => buf[buf.length - s.length + i] === k);
    const onKey = (e: KeyboardEvent) => {
      const raw = e.key === "Spacebar" ? " " : e.key;
      const k = raw.length === 1 ? raw.toLowerCase() : raw;
      if (k === " ") {
        e.preventDefault();
        if (endsWith(threeD)) setScreen("3d");
        else if (endsWith(lives)) setMaxLives(true);
        else setScreen("single");
        buf = [];
        return;
      }
      buf = [...buf, k].slice(-20);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  // Join a room automatically when the URL carries ?sala=XXXX
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("sala");
    if (code) {
      setRoomCode(code.toUpperCase());
      setScreen("lobby");
    }
  }, []);

  const room = useRoom(screen === "lobby" || screen === "net" ? roomCode : null, "Jogador");
  const voice = useVoiceChat(room.getChannel, room.clientId);


  useEffect(() => {
    if (room.started && screen === "lobby") setScreen("net");
  }, [room.started, screen]);

  const openWifi = useCallback(() => {
    const code = new URLSearchParams(window.location.search).get("sala") ?? makeRoomCode();
    const url = new URL(window.location.href);
    url.searchParams.set("sala", code);
    window.history.replaceState({}, "", url.toString());
    setRoomCode(code);
    setScreen("lobby");
  }, []);

  const backToMenu = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("sala");
    window.history.replaceState({}, "", url.toString());
    setRoomCode(null);
    setScreen("menu");
  }, []);

  if (screen === "menu") {
    return (
      <MainMenu
        onSingleplayer={() => setScreen("single")}
        onLocalCoop={() => setScreen("local")}
        onWifi={openWifi}
        onSonicStage={() => setScreen("sonic")}
      />
    );
  }

  if (screen === "3d") {
    return (
      <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background font-display text-[10px] text-accent">CARREGANDO 3D...</div>}>
        <Game3D onExit={backToMenu} startWithMaxLives={maxLives} />
      </Suspense>
    );
  }

  if (screen === "sonic") {
    return (
      <GameScreen
        playerCount={1}
        localIndices={[0]}
        schemes={["both"]}
        onExit={backToMenu}
        title="DIMENSÃO DO SONIC · BOTAS DE VELOCIDADE ATIVAS"
        startWithMaxLives={maxLives}
        sonicStage
      />
    );
  }

  if (screen === "single") {
    return (
      <GameScreen
        playerCount={1}
        localIndices={[0]}
        schemes={["both"]}
        onExit={backToMenu}
        title="SINGLEPLAYER · CHEGUE ATÉ A BANDEIRA"
        startWithMaxLives={maxLives}
      />
    );
  }

  if (screen === "local") {
    const schemes: ControlScheme[] = ["wasd", "arrows"];
    return (
      <GameScreen
        playerCount={2}
        localIndices={[0, 1]}
        schemes={schemes}
        onExit={backToMenu}
        title="CO-OP LOCAL · P1 WASD+ESPAÇO · P2 SETAS+ENTER"
        startWithMaxLives={maxLives}
      />
    );
  }

  if (screen === "lobby" && roomCode) {
    return (
      <Lobby
        roomCode={roomCode}
        players={room.players}
        connected={room.connected}
        isHost={room.isHost}
        meId={room.clientId}
        onStart={room.startGame}
        onBack={backToMenu}
      />
    );
  }

  if (screen === "net" && roomCode) {
    const slot = room.me?.slot ?? 0;
    const count = Math.max(room.players.length, slot + 1, 2);
    return (
      <GameScreen
        playerCount={Math.min(4, count)}
        localIndices={[slot]}
        schemes={Array.from({ length: 4 }, () => "both" as ControlScheme)}
        networked
        isHost={room.isHost}
        sendState={room.sendState}
        registerRemote={room.onRemoteState}
        chat={{
          messages: room.messages,
          mySlot: slot,
          sendChat: room.sendChat,
          onChatMessage: room.onChatMessage,
          addSystemMessage: room.addSystemMessage,
          toggleVoice: voice.toggleVoice,
          voiceEnabled: voice.voiceEnabled,
          voiceError: voice.voiceError,
        }}

        onExit={backToMenu}
        title={`SALA ${roomCode} · VOCÊ É O JOGADOR ${slot + 1}`}
        startWithMaxLives={maxLives}
      />
    );
  }

  return null;
}
