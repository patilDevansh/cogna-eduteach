"use client";

import { useEffect, useRef, useState } from "react";
import { voiceTutor, type VoiceTutorRef, type VoiceTutorScreen } from "@/lib/api";
import { createAudioContext, openEars, silentWavDataUrl } from "./ears";
import { createVoicePlayer, type AudioLike, type SpeechLike, type UtteranceLike } from "./voice-player";
import { INITIAL_VIEW, TutorSession, type Mode, type TutorDeps, type TutorView } from "./tutor-session";
import styles from "./voice-tutor.module.css";

export interface VoiceTutorProps {
  surface: VoiceTutorScreen["surface"];
  /** Display text for the tutor (title, first name), read each time the student speaks. Never evidence. */
  getScreen: () => Omit<VoiceTutorScreen, "surface">;
  /** Where the student is (a practice question, a lesson run): the server reads the rest from its records. */
  getRef?: () => VoiceTutorRef | undefined;
  /** When set, the tutor waits with this reason (a check on their own): nothing is sent anywhere. */
  pausedReason?: string | null;
  /**
   * Changes whenever the student moves on (answers, a new question, the next lesson step). The tutor then
   * stops talking at once and drops any reply still on its way: it never talks about a part the student has left.
   */
  contextKey?: string;
}

const LABEL: Record<Mode, string> = {
  off: "Talk to Cogna",
  asking: "Asking for the mic…",
  listening: "Listening",
  hearing: "Hearing you…",
  thinking: "Thinking…",
  speaking: "Speaking",
};

function browserDeps(): TutorDeps {
  const timers = {
    setTimeout: (fn: () => void, ms: number): unknown => window.setTimeout(fn, ms),
    clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
  };
  return {
    hear: (wav, ref, signal) => voiceTutor.hear(wav, ref, signal),
    talk: (said, screen, ref, history, signal) => voiceTutor.talk(said, screen, ref, history, signal),
    voiceUrl: voiceTutor.voiceUrl,
    createAudioContext,
    openEars,
    voice: createVoicePlayer({
      makeAudio: () => (typeof Audio === "undefined" ? null : (new Audio() as unknown as AudioLike)),
      speech: () => (typeof window !== "undefined" && "speechSynthesis" in window ? (window.speechSynthesis as unknown as SpeechLike) : null),
      makeUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
      silentUrl: silentWavDataUrl,
      ...timers,
    }),
    ...timers,
  };
}

/**
 * The live voice tutor: tap once to allow the mic, then just talk. It hears the student, answers out loud
 * and in writing, and stops when interrupted, when the student moves on, or when the page goes away.
 * Hidden unless the API's voice tutor switch is on (VOICE_TUTOR_ENABLED). The turn rules live in
 * tutor-session.ts; this component only shows them.
 */
export function VoiceTutor(props: VoiceTutorProps) {
  const latest = useRef(props);
  latest.current = props;
  const session = useRef<TutorSession | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [view, setView] = useState<TutorView>(INITIAL_VIEW);
  const [closedBubble, setClosedBubble] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    voiceTutor.status().then((s) => { if (live) setEnabled(s.enabled); }).catch(() => { if (live) setEnabled(false); });
    return () => { live = false; };
  }, []);

  // One session per mount. Leaving the page stops the microphone, the voice and any request on its way.
  useEffect(() => {
    const created = new TutorSession(browserDeps(), () => latest.current, setView);
    session.current = created;
    return () => {
      created.dispose();
      if (session.current === created) session.current = null;
    };
  }, []);

  // The student moved on: stop mid-sentence and drop any reply still on its way.
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) { firstKey.current = false; return; }
    session.current?.contextChanged();
  }, [props.contextKey]);

  // A hidden tab is no place for an open microphone.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) session.current?.hidden(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!enabled) return null;
  const { mode, heard, reply, note, level } = view;
  const on = mode !== "off" && mode !== "asking";
  const paused = on ? props.pausedReason ?? null : null;
  // Paused for a check: the reason is shown in the bubble, not only in a tooltip.
  const shownReply = reply ?? paused;
  const bubbleKey = `${heard ?? ""}|${shownReply ?? ""}|${note ?? ""}`;
  const showBubble = Boolean(heard || shownReply || note) && closedBubble !== bubbleKey;

  return (
    <aside className={styles.tutor} aria-label="Cogna, your voice tutor" data-mode={mode}>
      {/* Only Cogna's reply is announced; the state of the button is not. */}
      <p className={styles.srOnly} aria-live="polite">{reply ?? ""}</p>
      <p className={styles.srOnly} role="status">{note ?? ""}</p>
      {showBubble && (
        <div className={styles.bubble}>
          <button type="button" className={styles.close} aria-label="Hide Cogna's words" onClick={() => setClosedBubble(bubbleKey)}>
            <span aria-hidden="true">×</span>
          </button>
          <div className={styles.words}>
            {heard && <p className={styles.heard}><span>You</span> {heard}</p>}
            {shownReply && <p className={styles.reply}><span>Cogna</span> {shownReply}</p>}
            {note && <p className={styles.note}>{note}</p>}
          </div>
        </div>
      )}
      <button
        type="button"
        className={styles.pill}
        data-mode={mode}
        aria-pressed={on}
        // Disabled while the mic is being asked for (a second tap does nothing), without dropping keyboard focus.
        aria-disabled={mode === "asking"}
        onClick={() => {
          if (mode === "asking") return;
          if (on) session.current?.turnOff();
          else void session.current?.turnOn();
        }}
      >
        <span className={styles.orb} style={{ transform: `scale(${1 + (mode === "hearing" ? level * 0.5 : 0)})` }} aria-hidden="true" />
        <span>{paused ? "Paused for this check" : LABEL[mode]}</span>
        {on && <span className={styles.stop}>Stop</span>}
      </button>
    </aside>
  );
}
