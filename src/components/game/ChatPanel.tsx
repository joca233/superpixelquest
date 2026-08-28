import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/hooks/useRoom";
import { PLAYER_COLORS } from "@/game/engine";

type Props = {
  messages: ChatMessage[];
  open: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  voiceEnabled: boolean;
};

export function ChatPanel({ messages, open, draft, onDraft, onSubmit, onClose, voiceEnabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const recent = messages.slice(-6);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 sm:p-3">
      <div
        ref={listRef}
        className="max-h-32 overflow-y-auto pr-1 font-display text-[7px] leading-relaxed sm:text-[9px]"
      >
        {recent.map((m) => (
          <div key={m.id} className="mb-1">
            <span className="inline-block bg-background/80 px-2 py-1">
              <span style={{ color: m.system ? "#f5d442" : (PLAYER_COLORS[m.slot % 4] ?? "#fff") }}>
                {m.system ? "SISTEMA" : m.name.toUpperCase()}:
              </span>{" "}
              <span className="text-foreground">{m.text}</span>
            </span>
          </div>
        ))}
      </div>

      {open ? (
        <form
          className="pointer-events-auto mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            maxLength={120}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Mensagem ou /comando…"
            className="pixel-frame min-w-0 flex-1 rounded-sm bg-background px-3 py-2 font-display text-[8px] text-foreground outline-none sm:text-[10px]"
          />
          <button
            type="submit"
            className="pixel-btn shrink-0 rounded-sm bg-primary px-3 py-2 font-display text-[8px] text-primary-foreground sm:text-[10px]"
          >
            ENVIAR
          </button>
        </form>
      ) : (
        <p className="mt-2 font-display text-[7px] text-foreground/70 sm:text-[9px]">
          [T] CHAT {voiceEnabled ? "· VOZ ATIVA 🎙" : ""}
        </p>
      )}
    </div>
  );
}
