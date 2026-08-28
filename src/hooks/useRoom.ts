import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { NetSnapshot } from "@/game/engine";

export type RoomPlayer = { id: string; name: string; joinedAt: number; slot: number };

export type ChatMessage = {
  id: string;
  from: string;
  slot: number;
  name: string;
  text: string;
  ts: number;
  system?: boolean;
};

export function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

const clientId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

export function useRoom(roomCode: string | null, playerName: string) {
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const joinedAtRef = useRef<number>(Date.now());
  const remoteHandler = useRef<((s: NetSnapshot) => void) | null>(null);
  const chatHandler = useRef<((m: ChatMessage) => void) | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    setStarted(false);
    setConnected(false);
    setMessages([]);
    joinedAtRef.current = Date.now();

    const channel = supabase.channel(`sala-${roomCode}`, {
      config: { presence: { key: clientId }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ name: string; joinedAt: number }>();
      const list = Object.entries(state)
        .map(([id, metas]) => {
          const meta = metas[0];
          return { id, name: meta?.name ?? "Jogador", joinedAt: meta?.joinedAt ?? 0 };
        })
        .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
        .slice(0, 4)
        .map((p, i) => ({ ...p, slot: i }));
      setPlayers(list);
    });

    channel.on("broadcast", { event: "start" }, () => setStarted(true));
    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      remoteHandler.current?.(payload as NetSnapshot);
    });
    channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      const msg = payload as ChatMessage;
      setMessages((prev) => [...prev.slice(-49), msg]);
      chatHandler.current?.(msg);
    });

    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await channel.track({ name: playerName, joinedAt: joinedAtRef.current });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomCode, playerName]);

  const me = players.find((p) => p.id === clientId) ?? null;
  const isHost = me?.slot === 0;

  const startGame = useCallback(() => {
    void channelRef.current?.send({ type: "broadcast", event: "start", payload: {} });
    setStarted(true);
  }, []);

  const sendState = useCallback((snap: NetSnapshot) => {
    void channelRef.current?.send({ type: "broadcast", event: "state", payload: snap });
  }, []);

  const onRemoteState = useCallback((fn: (s: NetSnapshot) => void) => {
    remoteHandler.current = fn;
  }, []);

  const onChatMessage = useCallback((fn: (m: ChatMessage) => void) => {
    chatHandler.current = fn;
  }, []);

  const slotRef = useRef(0);
  slotRef.current = me?.slot ?? 0;

  const pushLocal = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev.slice(-49), msg]);
  }, []);

  const sendChat = useCallback(
    (text: string) => {
      const msg: ChatMessage = {
        id: `${clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        from: clientId,
        slot: slotRef.current,
        name: `Jogador ${slotRef.current + 1}`,
        text,
        ts: Date.now(),
      };
      pushLocal(msg);
      void channelRef.current?.send({ type: "broadcast", event: "chat", payload: msg });
      return msg;
    },
    [pushLocal],
  );

  const addSystemMessage = useCallback(
    (text: string) => {
      pushLocal({
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        from: "system",
        slot: slotRef.current,
        name: "SISTEMA",
        text,
        ts: Date.now(),
        system: true,
      });
    },
    [pushLocal],
  );

  const getChannel = useCallback(() => channelRef.current, []);

  return {
    players,
    me,
    isHost,
    connected,
    started,
    startGame,
    sendState,
    onRemoteState,
    clientId,
    messages,
    sendChat,
    onChatMessage,
    addSystemMessage,
    getChannel,
  };
}
