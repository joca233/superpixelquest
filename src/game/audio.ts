let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean) {
  muted = value;
}
export function isMuted() {
  return muted;
}

type ToneOpts = { freq: number; dur: number; type?: OscillatorType; vol?: number; sweep?: number; delay?: number };

function tone({ freq, dur, type = "square", vol = 0.08, sweep, delay = 0 }: ToneOpts) {
  const ac = getCtx();
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweep), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  jump: () => tone({ freq: 320, dur: 0.16, sweep: 720, type: "square", vol: 0.06 }),
  coin: () => {
    tone({ freq: 988, dur: 0.07, type: "square", vol: 0.07 });
    tone({ freq: 1319, dur: 0.16, type: "square", vol: 0.07, delay: 0.07 });
  },
  stomp: () => tone({ freq: 220, dur: 0.12, sweep: 80, type: "triangle", vol: 0.1 }),
  brick: () => tone({ freq: 150, dur: 0.14, sweep: 60, type: "sawtooth", vol: 0.08 }),
  bump: () => tone({ freq: 180, dur: 0.08, sweep: 120, type: "square", vol: 0.05 }),
  death: () => {
    tone({ freq: 440, dur: 0.12, type: "square", vol: 0.09 });
    tone({ freq: 300, dur: 0.4, sweep: 90, type: "square", vol: 0.09, delay: 0.13 });
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.18, type: "square", vol: 0.08, delay: i * 0.13 }),
    );
  },
  select: () => tone({ freq: 660, dur: 0.08, type: "square", vol: 0.06 }),
};

export const sfxExtra = {
  pipe: () => {
    tone({ freq: 700, dur: 0.18, sweep: 120, type: "square", vol: 0.09 });
    tone({ freq: 300, dur: 0.22, sweep: 60, type: "square", vol: 0.07, delay: 0.12 });
  },
  secret: () => {
    [392, 523, 659, 880, 1175].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, type: "triangle", vol: 0.09, delay: i * 0.1 }),
    );
  },
  power: () => {
    [523, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.14, type: "square", vol: 0.08, delay: i * 0.08 }));
  },
};
