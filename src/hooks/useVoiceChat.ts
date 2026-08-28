import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Signal =
  | { kind: "join"; from: string }
  | { kind: "leave"; from: string }
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] }] };

/**
 * Mesh voice chat over WebRTC. Signalling rides the existing Supabase Realtime
 * channel of the room, so no extra backend is required.
 */
export function useVoiceChat(getChannel: () => RealtimeChannel | null, clientId: string) {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const enabledRef = useRef(false);

  const signal = useCallback(
    (payload: Signal) => {
      void getChannel()?.send({ type: "broadcast", event: "voice", payload });
    },
    [getChannel],
  );

  const closePeer = useCallback((id: string) => {
    peers.current.get(id)?.close();
    peers.current.delete(id);
    const el = audios.current.get(id);
    if (el) {
      el.srcObject = null;
      el.remove();
    }
    audios.current.delete(id);
  }, []);

  const makePeer = useCallback(
    (id: string) => {
      const existing = peers.current.get(id);
      if (existing) return existing;
      const pc = new RTCPeerConnection(ICE);
      streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) signal({ kind: "ice", from: clientId, to: id, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        let el = audios.current.get(id);
        if (!el) {
          el = document.createElement("audio");
          el.autoplay = true;
          audios.current.set(id, el);
          document.body.appendChild(el);
        }
        el.srcObject = e.streams[0] ?? null;
        void el.play().catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(id);
      };
      peers.current.set(id, pc);
      return pc;
    },
    [clientId, closePeer, signal],
  );

  // Handle incoming signalling
  useEffect(() => {
    const channel = getChannel();
    if (!channel) return;
    channel.on("broadcast", { event: "voice" }, async ({ payload }) => {
      const msg = payload as Signal;
      if (!enabledRef.current || msg.from === clientId) return;
      if (msg.kind === "leave") {
        closePeer(msg.from);
        return;
      }
      if (msg.kind === "join") {
        // Deterministic caller: the larger id initiates the offer.
        if (clientId > msg.from) {
          const pc = makePeer(msg.from);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal({ kind: "offer", from: clientId, to: msg.from, sdp: offer });
        }
        return;
      }
      if (msg.to !== clientId) return;
      const pc = makePeer(msg.from);
      if (msg.kind === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal({ kind: "answer", from: clientId, to: msg.from, sdp: answer });
      } else if (msg.kind === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.kind === "ice") {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {
          /* ignore late candidates */
        }
      }
    });
  }, [getChannel, clientId, closePeer, makePeer, signal]);

  const stop = useCallback(() => {
    enabledRef.current = false;
    setEnabled(false);
    signal({ kind: "leave", from: clientId });
    peers.current.forEach((_, id) => closePeer(id));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [clientId, closePeer, signal]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      enabledRef.current = true;
      setEnabled(true);
      signal({ kind: "join", from: clientId });
      return true;
    } catch {
      setError("Microfone bloqueado ou indisponível.");
      return false;
    }
  }, [clientId, signal]);

  const toggle = useCallback(async () => {
    if (enabledRef.current) {
      stop();
      return false;
    }
    return await start();
  }, [start, stop]);

  useEffect(() => () => stop(), [stop]);

  return { voiceEnabled: enabled, voiceError: error, toggleVoice: toggle };
}
