import type { VoiceTutorRef, VoiceTutorScreen, VoiceTutorTurn } from "@/lib/api";
import { MIC_MESSAGES, micProblem, type Ears, type EarsHandlers } from "./ears";
import type { VoicePlayer } from "./voice-player";

/**
 * The live voice tutor's turns, without React: hear → think → speak, and every way a turn ends early.
 *
 * Each turn has a number and an AbortController. Stop, the student moving on (contextKey), leaving the
 * page and the student talking again all bump the number and abort the requests, and the turn checks
 * after every await that it is still current, and that no check has opened, before it says anything.
 * A microphone that finishes opening after Stop, after the page has gone, or after a newer attempt is
 * closed at once. Kept free of React and the browser so tests can drive it with fakes.
 */

export type Mode = "off" | "asking" | "listening" | "hearing" | "thinking" | "speaking";

export interface TutorView {
  mode: Mode;
  heard: string | null;
  reply: string | null;
  note: string | null;
  level: number;
}

export const INITIAL_VIEW: TutorView = { mode: "off", heard: null, reply: null, note: null, level: 0 };

export interface TutorProps {
  surface: VoiceTutorScreen["surface"];
  getScreen: () => Omit<VoiceTutorScreen, "surface">;
  getRef?: () => VoiceTutorRef | undefined;
  pausedReason?: string | null;
}

export interface TutorDeps {
  hear(wav: Blob, ref: VoiceTutorRef | undefined, signal: AbortSignal): Promise<{ text: string; paused?: string }>;
  talk(said: string, screen: VoiceTutorScreen, ref: VoiceTutorRef | undefined, history: VoiceTutorTurn[], signal: AbortSignal): Promise<{ say: string | null; spoken?: string; voice: string | null; paused?: boolean }>;
  voiceUrl(token: string): string;
  /** Called inside the tap, before anything is awaited. */
  createAudioContext(): AudioContext;
  openEars(handlers: EarsHandlers, ctx: AudioContext): Promise<Ears>;
  voice: VoicePlayer;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** A turn (hearing and thinking) that takes longer than this is dropped. */
export const TURN_TIMEOUT_MS = 20_000;
/** The microphone closes after this long with no turn. */
export const IDLE_OFF_MS = 90_000;
/** Refusals that mean "no more today": the microphone is turned off and the reason shown. */
export const DAY_OVER_CODES = new Set(["VOICE_TUTOR_DAILY_LIMIT", "VOICE_TUTOR_RESTING"]);

export const LISTENING_LINE = "I'm listening. Ask me anything about what's on your screen.";
export const TOO_SLOW = "Cogna took too long to answer. Please try again.";
export const IDLE_NOTE = "Cogna stopped listening after a quiet minute and a half. Tap to talk again.";
export const HIDDEN_NOTE = "Cogna stopped listening while you were away from this page. Tap to talk again.";

class TurnTimeout extends Error {}

export class TutorSession {
  private view: TutorView = INITIAL_VIEW;
  private ears: Ears | null = null;
  /** The microphone attempt in progress (0: none). A newer attempt, Stop or leaving makes an older one stale. */
  private opening = 0;
  private attempts = 0;
  private turn = 0;
  private busy = false;
  private controller: AbortController | null = null;
  private history: VoiceTutorTurn[] = [];
  private idleTimer: unknown = null;
  private disposed = false;

  constructor(
    private readonly deps: TutorDeps,
    private readonly props: () => TutorProps,
    private readonly onChange: (view: TutorView) => void,
  ) {}

  get state(): TutorView {
    return this.view;
  }

  private set(patch: Partial<TutorView>): void {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    this.onChange(this.view);
  }

  /**
   * Turns the microphone on. Call it straight from the tap: the audio context is made and the voice
   * unlocked before anything is awaited. A second tap while the first is still opening does nothing.
   */
  turnOn(): Promise<void> {
    if (this.disposed || this.opening || this.ears) return Promise.resolve();
    const attempt = ++this.attempts;
    this.opening = attempt;
    this.set({ mode: "asking", note: null });
    this.deps.voice.unlock();
    let ctx: AudioContext;
    try {
      ctx = this.deps.createAudioContext();
    } catch (error) {
      this.opening = 0;
      this.set({ mode: "off", note: MIC_MESSAGES[micProblem(error)] });
      return Promise.resolve();
    }
    return this.finishOpening(attempt, ctx);
  }

  private async finishOpening(attempt: number, ctx: AudioContext): Promise<void> {
    try {
      const ears = await this.deps.openEars(this.handlers(), ctx);
      if (this.disposed || attempt !== this.opening) { ears.stop(); return; } // stopped, left, or superseded
      this.ears = ears;
      this.opening = 0;
      this.set({ mode: "listening", reply: this.props().pausedReason ?? LISTENING_LINE });
      this.armIdle();
    } catch (error) {
      if (this.disposed || attempt !== this.opening) return;
      this.opening = 0;
      this.set({ mode: "off", note: MIC_MESSAGES[micProblem(error)] });
    }
  }

  private handlers(): EarsHandlers {
    return {
      onStart: () => {
        // The student started talking: stop any reply mid-sentence.
        this.turn++;
        this.abortRequests();
        this.busy = false;
        this.deps.voice.stop();
        this.set({ mode: "hearing", level: 0 });
        this.armIdle();
      },
      onSpeech: (wav) => { void this.answer(wav); },
      onCancel: () => { if (!this.busy) this.set({ mode: this.ears ? "listening" : "off", level: 0 }); },
      onLevel: (level) => { if (this.view.mode === "hearing") this.set({ level }); },
      tutorTalking: () => this.deps.voice.talking,
      busy: () => this.busy,
    };
  }

  private abortRequests(): void {
    this.controller?.abort();
    this.controller = null;
  }

  private back(mine: number): void {
    if (this.disposed || this.turn !== mine) return;
    this.busy = false;
    this.set({ mode: this.ears ? "listening" : "off", level: 0 });
    this.armIdle();
  }

  /** A check is open on the page: show why, send nothing. */
  private showPause(mine: number): void {
    this.set({ heard: null, reply: this.props().pausedReason ?? null });
    this.back(mine);
  }

  private async answer(wav: Blob): Promise<void> {
    if (this.disposed) return;
    const mine = ++this.turn;
    this.abortRequests();
    const controller = new AbortController();
    this.controller = controller;
    this.busy = true;
    const timer = this.deps.setTimeout(() => controller.abort(new TurnTimeout("too slow")), TURN_TIMEOUT_MS);
    // Still this turn: not stopped, not moved on, not interrupted, page still here.
    const isCurrent = () => !this.disposed && this.turn === mine;
    // After every await: give up quietly if the turn was replaced, or report the timeout.
    const settle = () => {
      if (!isCurrent()) return false;
      if (controller.signal.aborted) throw controller.signal.reason ?? new TurnTimeout("too slow");
      return true;
    };
    this.set({ mode: "thinking", note: null, level: 0 });
    this.armIdle();
    try {
      // Paused for a check: nothing is sent anywhere, so a check stays unaided and costs nothing.
      if (this.props().pausedReason) { this.showPause(mine); return; }
      const ref = this.props().getRef?.();
      const heard = await this.deps.hear(wav, ref, controller.signal);
      if (!settle()) return;
      if (this.props().pausedReason) { this.showPause(mine); return; }
      if (heard.paused) { this.set({ heard: null, reply: heard.paused }); this.back(mine); return; }
      const said = heard.text.trim();
      if (!said) { this.back(mine); return; }
      this.set({ heard: said });
      const props = this.props();
      const screen: VoiceTutorScreen = { ...props.getScreen(), surface: props.surface };
      const result = await this.deps.talk(said, screen, ref, this.history, controller.signal);
      if (!settle()) return;
      if (this.props().pausedReason) { this.showPause(mine); return; }
      if (result.paused && result.say) { this.set({ reply: result.say }); this.back(mine); return; }
      if (!result.say) { this.back(mine); return; }
      this.history = [...this.history, { role: "student" as const, text: said }, { role: "tutor" as const, text: result.say }].slice(-12);
      this.busy = false; // the student may interrupt while it speaks
      this.set({ reply: result.say, mode: "speaking" });
      this.deps.voice.play(result.spoken ?? result.say, result.voice ? this.deps.voiceUrl(result.voice) : null, () => this.back(mine));
    } catch (error) {
      if (!isCurrent()) return; // stopped, moved on or left: nothing to say
      if (controller.signal.reason instanceof TurnTimeout || error instanceof TurnTimeout) { this.set({ note: TOO_SLOW }); this.back(mine); return; }
      const code = (error as { code?: unknown } | null)?.code;
      const message = error instanceof Error && error.message ? error.message : "Sorry, that didn't work. Please try again.";
      if (typeof code === "string" && DAY_OVER_CODES.has(code)) { this.turnOff(message); return; }
      this.set({ note: message });
      this.back(mine);
    } finally {
      this.deps.clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }

  /**
   * The student moved on (answered, a new question, the next lesson step): stop at once, drop any reply on
   * its way, and clear the old words and the old conversation, so Cogna never talks about a part they left.
   */
  contextChanged(): void {
    this.turn++;
    this.abortRequests();
    this.busy = false;
    this.deps.voice.stop();
    this.history = [];
    this.set({ heard: null, reply: null, note: null, level: 0, mode: this.ears ? "listening" : this.view.mode === "asking" ? "asking" : "off" });
  }

  /** Stop: microphone off, voice off, any request dropped. A microphone still opening is closed when it arrives. */
  turnOff(note: string | null = null): void {
    this.opening = 0;
    this.turn++;
    this.abortRequests();
    this.busy = false;
    this.deps.voice.stop();
    this.ears?.stop();
    this.ears = null;
    this.clearIdle();
    this.set({ mode: "off", level: 0, note });
  }

  /** The page was hidden: a hidden tab is no place for an open microphone. */
  hidden(): void {
    if (this.ears || this.opening) this.turnOff(HIDDEN_NOTE);
  }

  /** The page is going away: everything stops, and nothing is shown or played afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.opening = 0;
    this.turn++;
    this.abortRequests();
    this.deps.voice.stop();
    this.ears?.stop();
    this.ears = null;
    this.clearIdle();
  }

  private armIdle(): void {
    this.clearIdle();
    if (!this.ears || this.disposed) return;
    this.idleTimer = this.deps.setTimeout(() => {
      this.idleTimer = null;
      if (!this.ears) return;
      if (this.busy || this.deps.voice.talking || this.view.mode === "hearing") { this.armIdle(); return; }
      this.turnOff(IDLE_NOTE);
    }, IDLE_OFF_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer !== null) this.deps.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
