"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { voiceTutor, type VoiceTutorScreen } from "@/lib/api";
import { openEars, type Ears } from "./ears";
import styles from "./voice-tutor.module.css";

type Mode = "off" | "asking" | "listening" | "hearing" | "thinking" | "speaking";

/** Whether the tutor may help with the open question, and the reviewed hints it may build on. */
export interface TutorHelp {
  allowed: boolean;
  approvedHints?: string[];
}

export interface VoiceTutorProps {
  surface: VoiceTutorScreen["surface"];
  /** What is on screen right now; read each time the student speaks. */
  getScreen: () => Omit<VoiceTutorScreen, "surface" | "helpOnQuestion">;
  /**
   * Runs before the tutor answers while a question is open. It records the help first (so the answer
   * counts as helped) and says whether help on this question is allowed. Throw to cancel the turn.
   */
  prepareHelp?: () => Promise<TutorHelp>;
  /** When set, the tutor waits with this reason, e.g. during an independent check. */
  pausedReason?: string | null;
}

const LABEL: Record<Mode, string> = {
  off: "Talk to Cogna",
  asking: "Asking for the mic…",
  listening: "Listening",
  hearing: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking",
};

/** The browser's own voice: robotic, but it means a reply is never silent when no voice service answers. */
function speakWithBrowser(text: string, onEnd: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) { onEnd(); return () => undefined; }
  const line = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  line.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
  line.rate = 1;
  line.onend = onEnd;
  line.onerror = onEnd;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(line);
  return () => window.speechSynthesis.cancel();
}

/**
 * The live voice tutor: tap once to allow the mic, then just talk. It hears the
 * student, answers out loud and in writing, and stops when interrupted. Hidden
 * unless the API's voice tutor switch is on (VOICE_TUTOR_ENABLED).
 */
export function VoiceTutor(props: VoiceTutorProps) {
  const latest = useRef(props);
  latest.current = props;

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>("off");
  const [heard, setHeard] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const ears = useRef<Ears | null>(null);
  const busy = useRef(false);
  const stopVoice = useRef<(() => void) | null>(null);
  const history = useRef<Array<{ role: "student" | "tutor"; text: string }>>([]);
  const turn = useRef(0);

  useEffect(() => {
    voiceTutor.status().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(false));
  }, []);

  const quiet = useCallback(() => {
    stopVoice.current?.();
    stopVoice.current = null;
  }, []);

  const speak = useCallback((say: string, voiceToken: string | null, onDone: () => void) => {
    quiet();
    let finished = false;
    const done = () => { if (finished) return; finished = true; stopVoice.current = null; onDone(); };
    const fallback = () => { if (!finished) stopVoice.current = speakWithBrowser(say, done); };
    if (!voiceToken) { fallback(); return; }
    const audio = new Audio(voiceTutor.voiceUrl(voiceToken));
    stopVoice.current = () => { finished = true; audio.pause(); audio.src = ""; };
    audio.onended = done;
    audio.onerror = () => { stopVoice.current = null; fallback(); };
    audio.play().catch(() => { stopVoice.current = null; fallback(); });
  }, [quiet]);

  const answer = useCallback(async (wav: Blob) => {
    const mine = ++turn.current;
    busy.current = true;
    setMode("thinking");
    setNote(null);
    const backToListening = () => { if (turn.current === mine) { busy.current = false; setMode(ears.current ? "listening" : "off"); } };
    try {
      // Paused for a check: nothing is sent anywhere, so a check stays unaided and costs nothing.
      if (latest.current.pausedReason) { setHeard(null); setReply(latest.current.pausedReason); backToListening(); return; }
      const { text } = await voiceTutor.hear(wav);
      if (!text.trim()) { backToListening(); return; }
      setHeard(text);
      const { getScreen, prepareHelp, surface } = latest.current;
      const screen = getScreen();
      const help = screen.question && prepareHelp ? await prepareHelp() : { allowed: Boolean(screen.question) };
      const full: VoiceTutorScreen = { ...screen, surface, helpOnQuestion: help.allowed, approvedHints: help.allowed ? help.approvedHints : undefined };
      const result = await voiceTutor.talk(text, full, history.current);
      if (turn.current !== mine) return; // the student started talking again
      if (!result.say) { backToListening(); return; }
      history.current = [...history.current, { role: "student" as const, text }, { role: "tutor" as const, text: result.say }].slice(-12);
      setReply(result.say);
      busy.current = false; // the student may interrupt while it speaks
      setMode("speaking");
      speak(result.say, result.voice, backToListening);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Sorry, that didn't work. Try again.");
      backToListening();
    }
  }, [speak]);

  const turnOn = useCallback(async () => {
    setMode("asking");
    setNote(null);
    try {
      ears.current = await openEars({
        onStart: () => { turn.current++; busy.current = false; quiet(); setMode("hearing"); },
        onSpeech: (wav) => { void answer(wav); },
        onCancel: () => { if (!busy.current) setMode("listening"); },
        onLevel: setLevel,
        tutorTalking: () => stopVoice.current !== null,
        busy: () => busy.current,
      });
      setMode("listening");
      setReply(latest.current.pausedReason ?? "I'm listening. Ask me anything about what's on your screen.");
    } catch {
      ears.current = null;
      setMode("off");
      setNote("Cogna can't hear you yet. Allow the microphone in your browser, then tap again.");
    }
  }, [answer, quiet]);

  const turnOff = useCallback(() => {
    turn.current++;
    busy.current = false;
    quiet();
    ears.current?.stop();
    ears.current = null;
    setMode("off");
    setLevel(0);
  }, [quiet]);

  useEffect(() => () => { ears.current?.stop(); stopVoice.current?.(); }, []);

  if (!enabled) return null;
  const on = mode !== "off" && mode !== "asking";
  const paused = props.pausedReason;

  return (
    <aside className={styles.tutor} aria-live="polite" data-mode={mode}>
      {(heard || reply || note) && (
        <div className={styles.bubble}>
          {heard && <p className={styles.heard}><span>You</span> {heard}</p>}
          {reply && <p className={styles.reply}><span>Cogna</span> {reply}</p>}
          {note && <p className={styles.note} role="alert">{note}</p>}
        </div>
      )}
      <button
        type="button"
        className={styles.pill}
        data-mode={mode}
        aria-pressed={on}
        onClick={() => (on ? turnOff() : void turnOn())}
        title={paused ?? undefined}
      >
        <span className={styles.orb} style={{ transform: `scale(${1 + (mode === "hearing" ? level * 0.5 : 0)})` }} aria-hidden="true" />
        <span>{paused && on ? "Paused for this check" : LABEL[mode]}</span>
        {on && <span className={styles.stop}>Stop</span>}
      </button>
    </aside>
  );
}
