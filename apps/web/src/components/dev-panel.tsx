"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { DEV_TOOLS_AVAILABLE, setDevMode, setFakeModel, useDevState } from "@/lib/dev-mode";
import { PILOT_STUDENT_STORIES } from "@/lib/pilot-video-demo";
import { ensureDemoStudentSession, getStudent } from "@/lib/session";
import styles from "./dev-panel.module.css";

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`${styles.switch} ${on ? styles.switchOn : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className={styles.knob} />
    </button>
  );
}

/** Floating developer controls. Renders nothing in production builds. */
export function DevPanel() {
  const { devMode, fakeModel, fakeModelLocked } = useDevState();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState("");
  useEffect(() => {
    if (open) setStudentId(getStudent()?.studentId ?? "");
  }, [open]);
  if (!DEV_TOOLS_AVAILABLE) return null;

  /** Sign in as another pilot student and open their lesson (animated where a recipe exists). */
  async function switchStudent(key: string) {
    const story = PILOT_STUDENT_STORIES[key as keyof typeof PILOT_STUDENT_STORIES];
    if (!story) return;
    const id = `demo_${key}`;
    setSwitching(story.name);
    setSwitchError("");
    try {
      await ensureDemoStudentSession(id, story.name, { forceRefresh: true });
      setStudentId(id);
      const lesson = await api.demoAnimatedLesson(id);
      router.push(`/student/personalized-video?${new URLSearchParams({ studentId: id, video: lesson.id }).toString()}`);
      setOpen(false);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Could not switch student.");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className={styles.root}>
      {open && (
        <div className={styles.card} role="dialog" aria-label="Developer controls">
          <div className={styles.cardHead}>
            <strong>Developer</strong>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close developer controls">
              ×
            </button>
          </div>

          <div className={styles.row}>
            <div>
              <span className={styles.rowTitle}>Dev mode</span>
              <span className={styles.rowHint}>{devMode ? "Dev tools visible on every page." : "Pages look exactly as a student sees them."}</span>
            </div>
            <Switch on={devMode} onChange={setDevMode} label="Dev mode" />
          </div>

          {devMode && (
            <div className={styles.row}>
              <div>
                <span className={styles.rowTitle}>Student</span>
                <span className={styles.rowHint}>
                  {switching ? `Opening ${switching.split(" ")[0]}'s lesson…` : switchError || "Sign in as a pilot student and open their lesson."}
                </span>
              </div>
              <select
                className={styles.select}
                value={studentId.startsWith("demo_") ? studentId.slice(5) : ""}
                disabled={Boolean(switching)}
                onChange={(event) => void switchStudent(event.target.value)}
                aria-label="Switch student"
              >
                {!studentId.startsWith("demo_") && <option value="">Choose…</option>}
                {Object.values(PILOT_STUDENT_STORIES).map((story) => (
                  <option key={story.key} value={story.key}>
                    {story.name.split(" ")[0]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={`${styles.row} ${!devMode ? styles.rowDisabled : ""}`}>
            <div>
              <span className={styles.rowTitle}>Fake model</span>
              <span className={styles.rowHint}>
                {!devMode
                  ? "Needs dev mode."
                  : fakeModelLocked
                    ? "Locked while a diagnostic is running: finish it or start a new one to switch."
                    : fakeModel
                      ? "Free and instant. Lotus uses the fake-model API."
                      : "Off: Lotus uses the live AI models."}
              </span>
            </div>
            <Switch on={fakeModel} disabled={!devMode || fakeModelLocked} onChange={setFakeModel} label="Fake model" />
          </div>

          <p className={styles.foot}>Never shown in production builds.</p>
        </div>
      )}
      <button
        type="button"
        className={`${styles.pill} ${devMode ? styles.pillOn : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={styles.dot} data-state={!devMode ? "off" : fakeModel ? "fake" : "live"} />
        {devMode ? (fakeModel ? "Dev · fake model" : "Dev · live model") : "Student view"}
      </button>
    </div>
  );
}
