import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MIC_MESSAGES, MicError, micProblem, MIN_VOICED_SECONDS, resample, SpeechDetector, wavBytes, type Ears, type EarsHandlers } from "../src/components/voice-tutor/ears";
import { spokenForBrowser } from "../src/components/voice-tutor/spoken-math";
import { createVoicePlayer, speakingTimeMs, type AudioLike, type SpeechLike, type UtteranceLike, type VoicePlayer } from "../src/components/voice-tutor/voice-player";
import { HIDDEN_NOTE, IDLE_NOTE, IDLE_OFF_MS, TOO_SLOW, TURN_TIMEOUT_MS, TutorSession, type TutorDeps, type TutorProps, type TutorView } from "../src/components/voice-tutor/tutor-session";

/** A manual clock for the timers the tutor sets. */
function manualClock() {
  let now = 0;
  let next = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn: () => void, ms: number): unknown => { const id = ++next; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id: unknown) => { timers.delete(id as number); },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn(); }
      }
    },
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------- hearing speech

describe("voice tutor ears — what counts as speech", () => {
  const RATE = 48000;
  const BLOCK = 2048;
  const block = (amplitude: number) => {
    const samples = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * 200 * i) / RATE);
    return samples;
  };
  /** Quiet room, a sound of `seconds`, quiet again: what the detector reports. */
  function hear(seconds: number, opts: { amplitude?: number; tutorTalking?: boolean } = {}) {
    const detector = new SpeechDetector(BLOCK / RATE);
    const events: string[] = [];
    const push = (samples: Float32Array) => { const e = detector.push(samples, opts.tutorTalking ?? false); if (e) events.push(e.kind); };
    const blockSeconds = BLOCK / RATE;
    for (let t = 0; t < 2; t += blockSeconds) push(block(0.002));
    for (let t = 0; t < seconds; t += blockSeconds) push(block(opts.amplitude ?? 0.2));
    for (let t = 0; t < 2; t += blockSeconds) push(block(0.002));
    return events;
  }

  it("lets a cough or a knock pass: the quiet padding around a sound is not speech", () => {
    assert.deepEqual(hear(0.2), ["start", "cancel"]);
    assert.deepEqual(hear(0.3), ["start", "cancel"]);
  });

  it("hands over real speech", () => {
    assert.equal(MIN_VOICED_SECONDS, 0.4);
    assert.deepEqual(hear(0.5), ["start", "speech"]);
    assert.deepEqual(hear(1.5), ["start", "speech"]);
  });

  it("ignores a quiet room, and needs a louder voice while Cogna is talking", () => {
    assert.deepEqual(hear(0), []);
    assert.deepEqual(hear(1.5, { amplitude: 0.035 }), ["start", "speech"]);
    assert.deepEqual(hear(1.5, { amplitude: 0.035, tutorTalking: true }), []);
  });
});

describe("voice tutor ears — the recording", () => {
  it("upsamples a slow device by interpolating, never with silent gaps", () => {
    const out = resample(new Float32Array(800).fill(0.5), 8000);
    assert.equal(out.length, 1600);
    assert.ok(out.every((v) => Math.abs(v - 0.5) < 1e-6));
    const ramp = resample(Float32Array.from([0, 1, 2, 3]), 8000);
    assert.deepEqual([...ramp.slice(0, 5)].map((v) => Math.round(v * 10) / 10), [0, 0.5, 1, 1.5, 2]);
  });

  it("downsamples by averaging, at any rate", () => {
    const out = resample(new Float32Array(4800).fill(-0.25), 48000);
    assert.equal(out.length, 1600);
    assert.ok(out.every((v) => Math.abs(v + 0.25) < 1e-6));
    assert.equal(resample(new Float32Array(4410), 44100).length, 1600);
  });

  it("writes a 16 kHz mono 16-bit WAV", () => {
    const bytes = wavBytes(new Float32Array([0, 1, -1]));
    const view = new DataView(bytes.buffer);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "RIFF");
    assert.equal(view.getUint32(24, true), 16000);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(40, true), 6);
    assert.equal(view.getInt16(46, true), 0x7fff);
    assert.equal(view.getInt16(48, true), -0x8000);
  });

  it("says why the microphone could not open, in words a student can act on", () => {
    assert.equal(micProblem(Object.assign(new Error("x"), { name: "NotAllowedError" })), "blocked");
    assert.equal(micProblem(Object.assign(new Error("x"), { name: "NotFoundError" })), "no-device");
    assert.equal(micProblem(Object.assign(new Error("x"), { name: "NotReadableError" })), "busy");
    assert.equal(micProblem(new MicError("insecure")), "insecure");
    assert.match(MIC_MESSAGES.insecure, /secure \(https\)/);
    assert.match(MIC_MESSAGES["no-device"], /can't find a microphone/);
    assert.match(MIC_MESSAGES.blocked, /blocked/);
  });
});

describe("voice tutor — the browser's own voice reads maths in words", () => {
  it("says squares, signs and brackets", () => {
    assert.equal(spokenForBrowser("x² + 5x + 6"), "x squared plus 5 x plus 6");
    assert.equal(spokenForBrowser("(x + 2)(x − 4)"), "x plus 2, times x minus 4");
    assert.equal(spokenForBrowser("6 × 4 = 24"), "6 times 4 equals 24");
  });
});

// ---------------------------------------------------------------- the voice

function fakeVoiceEnv(opts: { speech?: boolean } = {}) {
  const clock = manualClock();
  const log: string[] = [];
  const utterances: Array<UtteranceLike & { text: string }> = [];
  const audio: AudioLike & { playResult: "ok" | "reject" } = {
    src: "",
    onended: null,
    onerror: null,
    playResult: "ok",
    play() { log.push(`play ${audio.src}`); return audio.playResult === "ok" ? Promise.resolve() : Promise.reject(new Error("NotAllowedError")); },
    pause() { log.push("pause"); },
    load() { log.push("load"); },
    removeAttribute(name: string) { if (name === "src") audio.src = ""; },
  };
  const speech: SpeechLike = {
    speak(line) { log.push(`speak ${(line as UtteranceLike & { text: string }).text}`); },
    cancel() { log.push("cancel speech"); },
    getVoices: () => [{ lang: "en-GB" }, { lang: "en-IN" }],
  };
  const player = createVoicePlayer({
    makeAudio: () => audio,
    speech: () => (opts.speech === false ? null : speech),
    makeUtterance: (text) => { const u = { text, voice: null, rate: 1, volume: 1, onend: null, onerror: null } as UtteranceLike & { text: string }; utterances.push(u); return u; },
    silentUrl: () => "data:silence",
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });
  return { player, audio, utterances, log, clock };
}

describe("voice tutor — Cogna's voice", () => {
  it("plays the voice link, and finishes when it ends", async () => {
    const { player, audio } = fakeVoiceEnv();
    let done = 0;
    player.play("Go on.", "https://api/voice?t=1", () => done++);
    assert.equal(player.talking, true);
    assert.equal(audio.src, "https://api/voice?t=1");
    audio.onended!();
    assert.equal(done, 1);
    assert.equal(player.talking, false);
  });

  it("falls back to the browser's voice once, reading maths in words, if the link fails", async () => {
    const { player, audio, utterances } = fakeVoiceEnv();
    audio.playResult = "reject";
    let done = 0;
    player.play("x² is big.", "https://api/voice?t=2", () => done++);
    audio.onerror?.();
    await flush();
    assert.equal(utterances.length, 1, "the error event and the refused play() fall back only once");
    assert.equal(utterances[0]!.text, "x squared is big.");
    assert.equal((utterances[0]!.voice as { lang: string }).lang, "en-IN");
    utterances[0]!.onend!();
    assert.equal(done, 1);
  });

  it("is never left talking: no browser voice finishes at once, and a voice that never ends is timed out", () => {
    const quiet = fakeVoiceEnv({ speech: false });
    let done = 0;
    quiet.player.play("Hello.", null, () => done++);
    assert.equal(done, 1);
    assert.equal(quiet.player.talking, false);

    const silent = fakeVoiceEnv();
    silent.player.play("Hello there.", null, () => done++);
    assert.equal(silent.player.talking, true);
    silent.clock.advance(speakingTimeMs("Hello there.") + 1);
    assert.equal(done, 2);
    assert.equal(silent.player.talking, false);
  });

  it("stops at once without finishing the turn, and empties the audio element", () => {
    const { player, audio, log } = fakeVoiceEnv();
    let done = 0;
    player.play("Go on.", "https://api/voice?t=3", () => done++);
    player.stop();
    assert.equal(player.talking, false);
    assert.equal(audio.src, "");
    assert.ok(log.includes("pause") && log.includes("load"));
    audio.onended?.();
    assert.equal(done, 0);
  });

  it("unlocks playback inside the tap with a silent sound", () => {
    const { player, log } = fakeVoiceEnv();
    player.unlock();
    assert.ok(log.includes("play data:silence"));
  });
});

// ---------------------------------------------------------------- turns

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(signal?: AbortSignal): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")));
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function harness(overrides: Partial<TutorProps> = {}) {
  const clock = manualClock();
  const hears: Array<{ signal: AbortSignal; d: Deferred<{ text: string; paused?: string }> }> = [];
  const talks: Array<{ said: string; signal: AbortSignal; d: Deferred<{ say: string | null; voice: string | null; paused?: boolean }> }> = [];
  const opens: Array<Deferred<Ears>> = [];
  const played: Array<{ text: string; url: string | null; onDone: () => void }> = [];
  let handlers: EarsHandlers | null = null;
  let talking = false;
  let earsStopped = 0;
  const voice: VoicePlayer = {
    unlock() {},
    play(text, url, onDone) { played.push({ text, url, onDone }); talking = true; },
    stop() { talking = false; },
    get talking() { return talking; },
  };
  const deps: TutorDeps = {
    hear: (_wav, _ref, signal) => { const d = deferred<{ text: string; paused?: string }>(signal); hears.push({ signal, d }); return d.promise; },
    talk: (said, _screen, _ref, _history, signal) => { const d = deferred<{ say: string | null; voice: string | null; paused?: boolean }>(signal); talks.push({ said, signal, d }); return d.promise; },
    voiceUrl: (token) => `voice:${token}`,
    createAudioContext: () => ({}) as AudioContext,
    openEars: (h) => { handlers = h; const d = deferred<Ears>(); opens.push(d); return d.promise; },
    voice,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  };
  const props: TutorProps = { surface: "PRACTICE", getScreen: () => ({ title: "Practice" }), getRef: () => ({ kind: "PRACTICE", sessionId: "s1", questionId: "Q1", questionVersion: 1 }), pausedReason: null, ...overrides };
  let view: TutorView | null = null;
  const session = new TutorSession(deps, () => props, (v) => { view = v; });
  const ears: Ears = { stop: () => { earsStopped++; } };
  return {
    session, props, clock, hears, talks, opens, played,
    view: () => view!,
    busy: () => handlers!.busy(),
    earsStopped: () => earsStopped,
    async on() { const opening = session.turnOn(); opens.at(-1)!.resolve(ears); await opening; },
    async speak() { handlers!.onStart(); handlers!.onSpeech(new Blob(["wav"])); await flush(); },
  };
}

describe("voice tutor turns — never two microphones, never one left open", () => {
  it("a second tap while the microphone is opening does nothing", async () => {
    const h = harness();
    const first = h.session.turnOn();
    void h.session.turnOn();
    assert.equal(h.opens.length, 1);
    h.opens[0]!.resolve({ stop() {} });
    await first;
    assert.equal(h.view().mode, "listening");
  });

  it("a microphone that finishes opening after the page has gone is closed at once", async () => {
    const h = harness();
    const opening = h.session.turnOn();
    h.session.dispose();
    let stopped = 0;
    h.opens[0]!.resolve({ stop: () => { stopped++; } });
    await opening;
    assert.equal(stopped, 1);
  });

  it("one that finishes opening after the tab was hidden is closed too", async () => {
    const h = harness();
    const opening = h.session.turnOn();
    h.session.hidden();
    let stopped = 0;
    h.opens[0]!.resolve({ stop: () => { stopped++; } });
    await opening;
    assert.equal(stopped, 1);
    assert.equal(h.view().mode, "off");
    assert.equal(h.view().note, HIDDEN_NOTE);
  });
});

describe("voice tutor turns — a reply is only spoken where it was asked", () => {
  it("Stop while thinking drops the request, and nothing is sent or spoken afterwards", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    const hear = h.hears[0]!;
    h.session.turnOff();
    assert.equal(hear.signal.aborted, true);
    hear.d.resolve({ text: "how do I start?" });
    await flush();
    assert.equal(h.talks.length, 0, "no reply is asked for after Stop");
    assert.equal(h.played.length, 0);
    assert.equal(h.view().mode, "off");
  });

  it("moving on while thinking drops the reply on its way", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.hears[0]!.d.resolve({ text: "help" });
    await flush();
    const talk = h.talks[0]!;
    h.session.contextChanged();
    assert.equal(talk.signal.aborted, true);
    talk.d.resolve({ say: "Think about both sides.", voice: "t1" });
    await flush();
    assert.equal(h.played.length, 0);
    assert.equal(h.view().reply, null);
    assert.equal(h.view().mode, "listening");
  });

  it("moving on while speaking stops the voice", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.hears[0]!.d.resolve({ text: "help" });
    await flush();
    h.talks[0]!.d.resolve({ say: "Think about both sides.", voice: "t1" });
    await flush();
    assert.equal(h.played.length, 1);
    assert.equal(h.played[0]!.url, "voice:t1");
    h.session.contextChanged();
    assert.equal(h.view().mode, "listening");
    assert.equal(h.view().reply, null);
  });

  it("leaving the page while thinking: nothing is spoken on the next page", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.hears[0]!.d.resolve({ text: "help" });
    await flush();
    h.session.dispose();
    h.talks[0]!.d.resolve({ say: "Think about both sides.", voice: "t1" });
    await flush();
    assert.equal(h.played.length, 0);
    assert.equal(h.earsStopped(), 1);
  });

  it("a check that opens while hearing: nothing is sent, the pause is shown", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.props.pausedReason = "This question is a check on your own, so I'll stay quiet.";
    h.hears[0]!.d.resolve({ text: "is it x plus 3?" });
    await flush();
    assert.equal(h.talks.length, 0);
    assert.equal(h.view().reply, h.props.pausedReason);
    assert.equal(h.view().heard, null);
  });

  it("a check that opens while thinking: the reply is not spoken", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.hears[0]!.d.resolve({ text: "help" });
    await flush();
    h.props.pausedReason = "This question is a check on your own, so I'll stay quiet.";
    h.talks[0]!.d.resolve({ say: "Find two numbers that multiply to six.", voice: "t1" });
    await flush();
    assert.equal(h.played.length, 0);
    assert.equal(h.view().reply, h.props.pausedReason);
  });

  it("while paused, nothing is even heard", async () => {
    const h = harness({ pausedReason: "Paused for a check." });
    await h.on();
    await h.speak();
    assert.equal(h.hears.length, 0);
    assert.equal(h.view().reply, "Paused for a check.");
    assert.equal(h.busy(), false);
  });

  it("a pause from the server is shown and never spoken", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.hears[0]!.d.resolve({ text: "", paused: "Your check-in is still open, so I'll stay quiet until you finish it." });
    await flush();
    assert.equal(h.talks.length, 0);
    assert.match(h.view().reply!, /check-in is still open/);
    await h.speak();
    h.hears[1]!.d.resolve({ text: "help" });
    await flush();
    h.talks[0]!.d.resolve({ say: "Your check-in is still open.", voice: null, paused: true });
    await flush();
    assert.equal(h.played.length, 0);
  });
});

describe("voice tutor turns — limits and quiet", () => {
  it("turns the microphone off when the day's limit is reached, and says so", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.hears[0]!.d.reject(Object.assign(new Error("You've talked a lot today! Cogna will be ready to chat again tomorrow."), { status: 429, code: "VOICE_TUTOR_DAILY_LIMIT" }));
    await flush();
    assert.equal(h.view().mode, "off");
    assert.match(h.view().note!, /talked a lot today/);
    assert.equal(h.earsStopped(), 1);
  });

  it("a turn that takes too long is dropped with a note, and the next one is heard", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.clock.advance(TURN_TIMEOUT_MS + 1);
    await flush();
    assert.equal(h.view().note, TOO_SLOW);
    assert.equal(h.view().mode, "listening");
    assert.equal(h.busy(), false);
    await h.speak();
    assert.equal(h.hears.length, 2);
  });

  it("other failures keep the microphone on and show the server's words", async () => {
    const h = harness();
    await h.on();
    await h.speak();
    h.hears[0]!.d.reject(Object.assign(new Error("Cogna couldn't answer just now. Please try again in a moment."), { status: 503, code: "VOICE_TUTOR_UNAVAILABLE" }));
    await flush();
    assert.equal(h.view().mode, "listening");
    assert.match(h.view().note!, /couldn't answer just now/);
  });

  it("closes the microphone after a quiet minute and a half", async () => {
    const h = harness();
    await h.on();
    h.clock.advance(IDLE_OFF_MS - 1);
    assert.equal(h.view().mode, "listening");
    h.clock.advance(2);
    assert.equal(h.view().mode, "off");
    assert.equal(h.view().note, IDLE_NOTE);
    assert.equal(h.earsStopped(), 1);
  });
});
