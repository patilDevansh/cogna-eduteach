import { spokenForBrowser } from "./spoken-math";

/**
 * Cogna's voice on the page: one reusable <audio> element for the voice service's reply, and the browser's
 * own voice when that fails, so a reply is never silent. Browser objects come in through VoiceEnv, so the
 * rules can be tested without a browser.
 */

export interface AudioLike {
  src: string;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

export interface UtteranceLike {
  voice: unknown;
  rate: number;
  volume: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface SpeechLike {
  speak(line: UtteranceLike): void;
  cancel(): void;
  getVoices(): Array<{ lang: string }>;
}

export interface VoiceEnv {
  makeAudio(): AudioLike | null;
  /** The browser's speech synthesis, or null where there is none. */
  speech(): SpeechLike | null;
  makeUtterance(text: string): UtteranceLike;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** A tiny silent sound, played inside a tap to unlock later playback on phones. */
  silentUrl(): string;
}

export interface VoicePlayer {
  /** Call inside a tap: phones only let sound play later if it was first started by a tap. */
  unlock(): void;
  /** Speaks a reply: the voice link when there is one, else (or if it fails) the browser's own voice. */
  play(text: string, url: string | null, onDone: () => void): void;
  /** Stops at once; the reply's onDone is not called. */
  stop(): void;
  /** True while a reply is being spoken: the microphone then needs a louder voice to count as the student. */
  readonly talking: boolean;
}

/** Long enough for a slow voice to say the line, so a voice that never reports its end can't keep Cogna "talking". */
export function speakingTimeMs(text: string): number {
  return 4000 + text.length * 90;
}
/** A voice service may take a while to start, so its watchdog allows more. */
const VOICE_SERVICE_GRACE_MS = 15_000;

export function createVoicePlayer(env: VoiceEnv): VoicePlayer {
  let audio: AudioLike | null | undefined;
  // Kept while speaking: Chrome can drop the end event of an utterance nothing refers to.
  let utterance: UtteranceLike | null = null;
  let current: { id: number; cancel(): void } | null = null;
  let nextId = 0;

  const element = (): AudioLike | null => {
    if (audio === undefined) audio = env.makeAudio();
    return audio;
  };

  const quietAudio = () => {
    const el = audio;
    if (!el) return;
    el.onended = null;
    el.onerror = null;
    el.pause();
    // No source and a reload stop the download too, without the error a blank src would raise.
    el.removeAttribute("src");
    el.load();
  };

  const quietSpeech = () => {
    if (utterance) { utterance.onend = null; utterance.onerror = null; }
    utterance = null;
    env.speech()?.cancel();
  };

  function stop(): void {
    const playing = current;
    current = null;
    playing?.cancel();
  }

  function play(text: string, url: string | null, onDone: () => void): void {
    stop();
    const id = ++nextId;
    let timer: unknown = null;
    const mine = () => current?.id === id;
    const clearTimer = () => { if (timer !== null) env.clearTimeout(timer); timer = null; };
    const watch = (ms: number) => {
      clearTimer();
      timer = env.setTimeout(() => { if (mine()) { quietAudio(); quietSpeech(); done(); } }, ms);
    };
    const done = () => {
      if (!mine()) return;
      current = null;
      clearTimer();
      utterance = null;
      onDone();
    };
    const browserVoice = () => {
      if (!mine()) return;
      const speech = env.speech();
      // No browser voice at all: finish now, so Cogna is never left "talking" (and the mic never left deaf).
      if (!speech) { done(); return; }
      const line = env.makeUtterance(spokenForBrowser(text));
      const voices = speech.getVoices();
      line.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang?.startsWith("en")) ?? null;
      line.rate = 1;
      line.onend = done;
      line.onerror = done;
      utterance = line;
      speech.cancel();
      speech.speak(line);
      watch(speakingTimeMs(text));
    };
    current = { id, cancel: () => { clearTimer(); quietAudio(); quietSpeech(); } };
    const el = url ? element() : null;
    if (!el || !url) { browserVoice(); return; }
    // The error event and the rejected play() can both arrive: fall back once.
    let fellBack = false;
    const fallBack = () => { if (!mine() || fellBack) return; fellBack = true; quietAudio(); browserVoice(); };
    el.onended = () => { if (mine()) done(); };
    el.onerror = fallBack;
    el.src = url;
    watch(speakingTimeMs(text) + VOICE_SERVICE_GRACE_MS);
    el.play().catch(fallBack);
  }

  function unlock(): void {
    if (current) return;
    const el = element();
    if (el) {
      el.onended = null;
      el.onerror = null;
      el.src = env.silentUrl();
      el.play().catch(() => undefined);
    }
    const speech = env.speech();
    if (speech) {
      const line = env.makeUtterance(" ");
      line.volume = 0;
      try { speech.speak(line); } catch { /* best effort */ }
    }
  }

  return {
    unlock,
    play,
    stop,
    get talking() { return current !== null; },
  };
}
