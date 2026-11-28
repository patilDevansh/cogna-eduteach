/**
 * The tutor's ears: a microphone that notices when the student starts and stops talking, and hands
 * each spoken stretch over as a 16 kHz mono WAV (what speech-to-text expects). Ported from the trail
 * prototype's guide/talk.js. The start/stop rules live in SpeechDetector, which needs no microphone,
 * so they can be tested.
 */

export interface EarsHandlers {
  /** The student started talking (stop any reply that is playing). */
  onStart(): void;
  /** A finished stretch of speech. */
  onSpeech(wav: Blob): void;
  /** A sound too short to be speech (a cough, a knock). */
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
/** A stretch is speech only with this much sound above the threshold. Padding (the quiet before and after) doesn't count. */
export const MIN_VOICED_SECONDS = 0.4;
const START_AFTER_SECONDS = 0.16;
const END_AFTER_QUIET_SECONDS = 0.75;
const PRE_ROLL_BLOCKS = 6;

export type DetectorEvent = { kind: "start" } | { kind: "speech"; chunks: Float32Array[] } | { kind: "cancel" };

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/** When speech starts and ends, from blocks of microphone samples. */
export class SpeechDetector {
  private floor = 0.006;
  private talking = false;
  private loud = 0;
  private quiet = 0;
  private length = 0;
  private voiced = 0;
  private chunks: Float32Array[] = [];
  private pre: Float32Array[] = [];

  constructor(private readonly blockSeconds: number) {}

  /** While a turn is being answered, sound is ignored and nothing builds up for later. */
  idle(): void {
    this.pre = [];
  }

  push(samples: Float32Array, tutorTalking: boolean, level = rms(samples)): DetectorEvent | null {
    const threshold = Math.max(0.018, this.floor * 3.2) * (tutorTalking ? 2.6 : 1);
    const copy = new Float32Array(samples);
    if (!this.talking) {
      if (level < threshold) this.floor = this.floor * 0.97 + level * 0.03;
      this.pre.push(copy);
      if (this.pre.length > PRE_ROLL_BLOCKS) this.pre.shift();
      this.loud = level > threshold ? this.loud + 1 : 0;
      if (this.loud * this.blockSeconds > START_AFTER_SECONDS) {
        this.talking = true;
        this.quiet = 0;
        this.length = 0;
        this.voiced = this.loud;
        this.chunks = this.pre.slice();
        this.pre = [];
        return { kind: "start" };
      }
      return null;
    }
    this.chunks.push(copy);
    this.length += this.blockSeconds;
    if (level > threshold) this.voiced++;
    this.quiet = level < threshold * 0.7 ? this.quiet + 1 : 0;
    if (this.quiet * this.blockSeconds <= END_AFTER_QUIET_SECONDS && this.length <= MAX_SECONDS) return null;
    this.talking = false;
    this.loud = 0;
    const chunks = this.chunks;
    this.chunks = [];
    return this.voiced * this.blockSeconds >= MIN_VOICED_SECONDS ? { kind: "speech", chunks } : { kind: "cancel" };
  }
}

/** Why the microphone could not open. */
export type MicProblem = "insecure" | "unsupported" | "blocked" | "no-device" | "busy" | "other";

export class MicError extends Error {
  constructor(readonly problem: MicProblem) {
    super(`microphone: ${problem}`);
    this.name = "MicError";
  }
}

export function micProblem(error: unknown): MicProblem {
  if (error instanceof MicError) return error.problem;
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no-device";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "other";
}

/** What the student is told, in words they can act on. */
export const MIC_MESSAGES: Record<MicProblem, string> = {
  insecure: "The microphone only works on a secure (https) page. Ask a grown-up to open Cogna's secure link.",
  unsupported: "This browser can't share a microphone with Cogna. Try Chrome, Edge or Safari.",
  blocked: "The microphone is blocked. Allow it for this site in your browser (the icon in the address bar), then tap again.",
  "no-device": "Cogna can't find a microphone. Plug one in or check your device, then tap again.",
  busy: "Another app is using the microphone. Close it, then tap again.",
  other: "Cogna can't hear you yet. Check the microphone, then tap again.",
};

/** Call inside the tap that turns the tutor on: browsers only let an audio context start from a tap. */
export function createAudioContext(): AudioContext {
  if (typeof window !== "undefined" && window.isSecureContext === false) throw new MicError("insecure");
  const AudioCtx = typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new MicError("unsupported");
  return new AudioCtx();
}

/**
 * Opens the microphone into an audio context made in the tap. Owns that context: on failure, and on
 * stop(), the microphone and the context are both closed, so nothing is left running.
 */
export async function openEars(handlers: EarsHandlers, ctx: AudioContext): Promise<Ears> {
  // Resume before anything is awaited, while the tap still counts.
  const resumed = ctx.state === "suspended" ? ctx.resume().catch(() => undefined) : Promise.resolve();
  let stream: MediaStream | null = null;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new MicError(window.isSecureContext === false ? "insecure" : "unsupported");
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    await resumed;
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but universally available and needs no separate worklet file.
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const rate = ctx.sampleRate;
    const detector = new SpeechDetector(2048 / rate);
    proc.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      const level = rms(samples);
      handlers.onLevel?.(Math.min(1, level / 0.08));
      if (handlers.busy()) { detector.idle(); return; }
      const heard = detector.push(samples, handlers.tutorTalking(), level);
      if (!heard) return;
      if (heard.kind === "start") handlers.onStart();
      else if (heard.kind === "speech") handlers.onSpeech(toWav(heard.chunks, rate));
      else handlers.onCancel();
    };
    source.connect(proc);
    proc.connect(ctx.destination);
    const open = stream;
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        proc.onaudioprocess = null;
        try { proc.disconnect(); source.disconnect(); } catch { /* already disconnected */ }
        open.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
      },
    };
  } catch (error) {
    // Never leave a microphone or an audio context running after a failed start.
    stream?.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Samples at `from` Hz → samples at `to` Hz. Going down averages each output sample's span of input
 * (a simple low-pass); going up interpolates between neighbours, so a slow device rate (a Bluetooth
 * headset's 8 kHz) is never stretched with silent gaps.
 */
export function resample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input.slice();
  const ratio = from / to;
  const n = Math.max(0, Math.floor(input.length / ratio));
  const out = new Float32Array(n);
  if (ratio > 1) {
    for (let i = 0; i < n; i++) {
      const start = i * ratio;
      const end = start + ratio;
      let sum = 0;
      let weight = 0;
      for (let j = Math.floor(start); j < Math.ceil(end) && j < input.length; j++) {
        const w = Math.min(end, j + 1) - Math.max(start, j);
        if (w > 0) { sum += input[j]! * w; weight += w; }
      }
      out[i] = weight ? sum / weight : 0;
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const at = i * ratio;
    const j = Math.floor(at);
    const a = input[j] ?? 0;
    const b = input[Math.min(j + 1, input.length - 1)] ?? a;
    out[i] = a + (b - a) * (at - j);
  }
  return out;
}

/** Mono samples → the bytes of a 16-bit PCM WAV file. */
export function wavBytes(samples: Float32Array, rate = 16000): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => { for (let k = 0; k < s.length; k++) view.setUint8(at + k, s.charCodeAt(k)); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** Float32 blocks at `rate` → 16 kHz mono 16-bit WAV. */
export function toWav(chunks: Float32Array[], rate: number): Blob {
  let total = 0;
  for (const c of chunks) total += c.length;
  const flat = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) { flat.set(c, offset); offset += c.length; }
  return new Blob([wavBytes(resample(flat, rate))], { type: "audio/wav" });
}

/** A tenth of a second of silence, played inside the tap so later replies may play on phones. */
export function silentWavDataUrl(): string {
  const bytes = wavBytes(new Float32Array(1600));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
