import { useEffect, useState } from "react";
import { sfx } from "@/game/audio";

type Props = {
  onSingleplayer: () => void;
  onLocalCoop: () => void;
  onWifi: () => void;
};

export function MainMenu({ onSingleplayer, onLocalCoop, onWifi }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    try {
      setHighScore(Number(localStorage.getItem("pixelquest_highscore") ?? "0"));
    } catch {
      /* ignore */
    }
  }, []);

  const click = (fn: () => void) => () => {
    sfx.select();
    fn();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <PixelBackdrop />

      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center">
        <p className="font-display text-[9px] tracking-widest text-accent">SUPER</p>
        <h1 className="text-shadow-pixel mt-3 text-center font-display text-2xl text-primary sm:text-4xl">
          PIXEL QUEST
        </h1>
        <p className="mt-4 text-center font-display text-[8px] leading-relaxed text-muted-foreground sm:text-[10px]">
          UMA AVENTURA DE PLATAFORMA 8-BIT
        </p>

        <div className="animate-floaty mt-8">
          <CoinIcon />
        </div>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-4">
          <button
            onClick={click(onSingleplayer)}
            className="pixel-btn rounded-sm bg-primary px-6 py-4 text-[11px] text-primary-foreground"
          >
            SINGLEPLAYER
          </button>
          <button
            onClick={click(() => setModalOpen(true))}
            className="pixel-btn rounded-sm bg-accent px-6 py-4 text-[11px] text-accent-foreground"
          >
            MULTIPLAYER
          </button>
        </div>

        <p className="mt-10 font-display text-[8px] text-muted-foreground">
          RECORDE: {String(highScore).padStart(6, "0")}
        </p>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="pixel-frame w-full max-w-sm rounded-sm bg-card p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Escolher modo multiplayer"
          >
            <h2 className="text-center font-display text-sm text-accent">MULTIPLAYER</h2>
            <div className="mt-6 flex flex-col gap-4">
              <button
                onClick={click(onLocalCoop)}
                className="pixel-btn rounded-sm bg-primary px-4 py-4 text-[10px] text-primary-foreground"
              >
                JOGAR NO TECLADO
              </button>
              <button
                onClick={click(onWifi)}
                className="pixel-btn rounded-sm bg-secondary px-4 py-4 text-[10px] text-secondary-foreground"
              >
                JOGAR COM AMIGOS EM WIFI
              </button>
            </div>
            <p className="mt-5 text-center font-display text-[7px] leading-relaxed text-muted-foreground">
              TECLADO: P1 = WASD + ESPAÇO · P2 = SETAS + ENTER
            </p>
            <button
              onClick={() => setModalOpen(false)}
              className="mt-6 w-full font-display text-[8px] text-muted-foreground underline"
            >
              FECHAR
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function CoinIcon() {
  return (
    <div className="grid h-16 w-16 place-items-center border-4 border-foreground bg-accent">
      <span className="font-display text-lg text-accent-foreground">?</span>
    </div>
  );
}

function PixelBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70">
      <div className="absolute inset-x-0 bottom-0 h-24 bg-brick" />
      <div className="absolute inset-x-0 bottom-24 h-4 bg-leaf" />
      {[12, 28, 46, 66, 84].map((left, i) => (
        <div
          key={left}
          className="absolute h-3 w-16 bg-foreground/20"
          style={{ left: `${left}%`, top: `${10 + i * 13}%` }}
        />
      ))}
    </div>
  );
}
