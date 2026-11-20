/**
 * A tiny synthesized sound kit: no files to download, and nothing plays before the learner's first touch
 * (browsers only start audio after a gesture). Every sound is short, soft and pitched to sit under a narrator.
 */
let ctx: AudioContext | undefined;
export const sound = { on: true };

function audio() {
  if (!sound.on || typeof window === "undefined") return undefined;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type ToneOpts = { type?: OscillatorType; gain?: number; at?: number; to?: number };
function tone(freq: number, dur: number, { type = "sine", gain = 0.1, at = 0, to }: ToneOpts = {}) {
  try {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* sound is a nicety */ }
}

type HissOpts = { gain?: number; at?: number; from?: number; to?: number; q?: number };
function hiss(dur: number, { gain = 0.08, at = 0, from = 800, to = 4000, q = 1 }: HissOpts = {}) {
  try {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + at, buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf;
    f.type = "bandpass";
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
    src.stop(t + dur);
  } catch { /* sound is a nicety */ }
}

export const sfx = {
  lift: () => tone(420, 0.1, { to: 640, gain: 0.05 }),
  place: () => { tone(150, 0.18, { to: 70, gain: 0.28 }); hiss(0.05, { gain: 0.06, from: 3200, to: 1600 }); tone(1320, 0.06, { type: "triangle", gain: 0.04, at: 0.02 }); },
  cut: () => hiss(0.26, { gain: 0.14, from: 900, to: 7000, q: 0.8 }),
  tick: (i: number) => tone(523 * 2 ** (i / 30), 0.07, { type: "triangle", gain: 0.05 }),
  detent: () => tone(1800, 0.025, { type: "triangle", gain: 0.02 }),
  nope: () => { tone(260, 0.1, { gain: 0.07, to: 210 }); tone(210, 0.14, { gain: 0.07, at: 0.09, to: 165 }); },
  whoosh: () => hiss(0.55, { gain: 0.06, from: 300, to: 2600, q: 0.6 }),
  chime: () => [784, 988, 1175, 1568].forEach((f, k) => tone(f, 0.7, { gain: 0.05, at: k * 0.08 })),
};

/** A short tap on phones that can vibrate; silently nothing elsewhere. */
export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
