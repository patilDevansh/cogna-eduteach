/**
 * The tutor's ears: an always-on microphone that notices when the student starts
 * and stops talking, and hands each spoken stretch over as a 16 kHz mono WAV
 * (what speech-to-text expects). Ported from the trail prototype's guide/talk.js.
 */

export interface EarsHandlers {
  /** The student started talking (stop any reply that is playing). */
  onStart(): void;
  /** A finished stretch of speech. */
  onSpeech(wav: Blob): void;
  /** A sound too short to be speech. */
  onCancel(): void;
  /** Mic level 0–1, for the meter. */
  onLevel?(level: number): void;
  /** True while the tutor's own voice is playing: only a clearly louder voice then counts as the student. */
  tutorTalking(): boolean;
  /** True while a turn is being answered: speech is ignored until it's done. */
  busy(): boolean;
}

export interface Ears {
  stop(): void;
}

const MAX_SECONDS = 14;
const MIN_SECONDS = 0.55;
const START_AFTER_SECONDS = 0.16;
const END_AFTER_QUIET_SECONDS = 0.75;

export async function openEars(handlers: EarsHandlers): Promise<Ears> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally available and needs no separate worklet file.
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const rate = ctx.sampleRate;
  const block = 2048 / rate;
  let floor = 0.006;
  let talking = false;
  let loud = 0;
  let quiet = 0;
  let length = 0;
  let chunks: Float32Array[] = [];
  let pre: Float32Array[] = [];

  proc.onaudioprocess = (event) => {
    const x = event.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i]! * x[i]!;
    const rms = Math.sqrt(sum / x.length);
    handlers.onLevel?.(Math.min(1, rms / 0.08));
    if (handlers.busy()) { pre = []; return; }
    const threshold = Math.max(0.018, floor * 3.2) * (handlers.tutorTalking() ? 2.6 : 1);
    const copy = new Float32Array(x);
    if (!talking) {
      if (rms < threshold) floor = floor * 0.97 + rms * 0.03;
      pre.push(copy);
      if (pre.length > 6) pre.shift();
      loud = rms > threshold ? loud + 1 : 0;
      if (loud * block > START_AFTER_SECONDS) {
        talking = true; quiet = 0; length = 0; chunks = pre.slice(); pre = [];
        handlers.onStart();
      }
    } else {
      chunks.push(copy);
      length += block;
      quiet = rms < threshold * 0.7 ? quiet + 1 : 0;
      if (quiet * block > END_AFTER_QUIET_SECONDS || length > MAX_SECONDS) {
        talking = false; loud = 0;
        const seconds = chunks.length * block;
        const spoken = chunks;
        chunks = [];
        if (seconds > MIN_SECONDS) handlers.onSpeech(toWav(spoken, rate)); else handlers.onCancel();
      }
    }
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  return {
    stop() {
      try {
        proc.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      } catch { /* already closed */ }
    },
  };
}

/** Float32 blocks at `rate` → 16 kHz mono 16-bit WAV. */
export function toWav(chunks: Float32Array[], rate: number): Blob {
  let total = 0;
  for (const c of chunks) total += c.length;
  const flat = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) { flat.set(c, offset); offset += c.length; }
  const ratio = rate / 16000;
  const n = Math.floor(total / ratio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(total, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += flat[j]!;
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => { for (let k = 0; k < s.length; k++) view.setUint8(at + k, s.charCodeAt(k)); };
  text(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}
