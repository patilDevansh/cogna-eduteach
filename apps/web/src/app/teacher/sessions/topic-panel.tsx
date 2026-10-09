"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type CheckKind, type ClassTopicPlan, type TopicStudentStatus } from "@/lib/api";
import { SAMPLE_ACTION_NOTE, teacherData } from "@/lib/teacher-mode";
import shared from "../teacher.module.css";
import styles from "./pilot.module.css";

const REFRESH_MS = 5_000;

const STATUS_LABEL: Record<TopicStudentStatus, string> = {
  UNDERSTOOD: "Understood",
  STUCK: "Still stuck",
  UNCLEAR: "Not sure yet",
  IN_PROGRESS: "Working on a check",
  NOT_CHECKED: "Not checked",
};

const STEPS: Array<{ key: string; label: string }> = [
  { key: "DIAGNOSTIC", label: "Diagnostic" },
  { key: "TEACH", label: "Teach" },
  { key: "TOPIC_CHECK", label: "Topic check" },
  { key: "CATCH_UP", label: "Catch-up" },
  { key: "MOVE_ON", label: "Move on" },
];

type Topic = ClassTopicPlan["topics"][number];

function shortDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
}

/** Which steps of the topic flow this topic has been through. */
function stepsDone(topic: Topic): Set<string> {
  const kinds = new Set(topic.checks.map((c) => c.kind));
  const done = new Set<string>();
  if (kinds.has("DIAGNOSTIC")) done.add("DIAGNOSTIC");
  if (kinds.has("TOPIC_CHECK")) done.add("TEACH").add("TOPIC_CHECK");
  if (kinds.has("CATCH_UP")) done.add("CATCH_UP");
  if (topic.status === "DONE") STEPS.forEach((s) => done.add(s.key));
  return done;
}

/**
 * The class's topic plan on the Class page: the topic being taught, where every
 * student stands on it, and the one next move (diagnostic, topic check,
 * catch-up for whoever is still stuck, or move on). Checks it starts appear in
 * the live view below.
 */
export function TopicPanel({ classroomId, sample, onCheckStarted }: { classroomId: string; sample: boolean; onCheckStarted: () => void }) {
  const [plan, setPlan] = useState<ClassTopicPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [catchUp, setCatchUp] = useState<Set<string>>(new Set());
  const shownFor = useRef("");

  const load = useCallback(() => {
    const key = `${sample}:${classroomId}`;
    shownFor.current = key;
    teacherData(sample).getClassTopics(classroomId)
      .then((p) => { if (shownFor.current === key) setPlan(p); })
      .catch((cause) => { if (shownFor.current === key) setError(cause instanceof ApiError ? cause.message : "Could not load the topic plan."); });
  }, [classroomId, sample]);

  useEffect(() => {
    setPlan(null);
    setError("");
    setShowPlan(false);
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const current = plan?.topics.find((t) => t.status === "TEACHING") ?? null;
  const readiness = plan?.current?.readiness;
  const next = plan?.topics.find((t) => t.topicId === plan.next) ?? null;
  const recommended = readiness?.recommendation.studentIds?.join(",") ?? "";

  // The catch-up list starts as everyone the recommendation names; the teacher can untick anyone.
  useEffect(() => setCatchUp(new Set(recommended ? recommended.split(",") : [])), [recommended]);

  async function act(label: string, run: () => Promise<ClassTopicPlan>, startsCheck = false) {
    if (sample) return setError(SAMPLE_ACTION_NOTE);
    setBusy(label);
    setError("");
    try {
      setPlan(await run());
      if (startsCheck) onCheckStarted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "That didn't work. Please try again.");
    } finally {
      setBusy("");
    }
  }

  const sendCheck = (topicId: string, kind: CheckKind, studentIds?: string[]) =>
    act(kind, () => api.startTopicCheck(classroomId, topicId, kind, studentIds), true);
  const startTopic = (topicId: string) => act(`start:${topicId}`, () => api.setTopicStatus(classroomId, topicId, "start"));
  const moveOn = (topicId: string, then?: string) =>
    act("done", async () => {
      const done = await api.setTopicStatus(classroomId, topicId, "done");
      return then ? api.setTopicStatus(classroomId, then, "start") : done;
    });

  if (!plan) {
    return error ? <section className={shared.emptyCard}><p>{error}</p></section> : null;
  }
  if (!plan.topics.length) {
    return (
      <section className={styles.topicCard}>
        <p className={styles.eyebrow}>Topic</p>
        <p className={styles.muted}>Cogna has a topic plan for Grade 8 so far. You can still run checks from the live view.</p>
      </section>
    );
  }

  const done = current ? stepsDone(current) : new Set<string>();
  const action = readiness?.recommendation.action;
  const catchUpIds = [...catchUp];

  return (
    <section className={styles.topicCard} aria-label="Topic">
      <div className={styles.topicHead}>
        <div>
          <p className={styles.eyebrow}>{current ? `Teaching now · chapter ${current.chapter}` : "Topic"}</p>
          <h2>{current ? current.name : "What are you teaching in this class?"}</h2>
          {current?.startedAt && <p className={styles.muted}>Since {shortDate(current.startedAt)}{current.checks.length ? ` · ${current.checks.length} check${current.checks.length === 1 ? "" : "s"}` : ""}</p>}
        </div>
        <button type="button" className={styles.planButton} onClick={() => setShowPlan((v) => !v)} aria-expanded={showPlan}>
          {showPlan ? "Hide topic plan" : `Topic plan · ${plan.topics.filter((t) => t.status === "DONE").length} of ${plan.topics.length} done`}
        </button>
      </div>

      {error && <p className={styles.formError} role="alert">{error}</p>}

      {!current ? (
        <div className={styles.topicNext}>
          {next ? (
            <>
              <p>Next in your plan: <strong>{next.name}</strong> (chapter {next.chapter}).</p>
              <button type="button" className={shared.primary} disabled={Boolean(busy)} onClick={() => void startTopic(next.topicId)}>
                {busy === `start:${next.topicId}` ? "Starting…" : `Start teaching ${next.name.toLowerCase()}`}
              </button>
              <button type="button" className={shared.secondary} onClick={() => setShowPlan(true)}>Pick another topic</button>
            </>
          ) : (
            <p>Every topic in the plan is done.</p>
          )}
        </div>
      ) : (
        <>
          {current.available && <ol className={styles.topicSteps} aria-label="Topic steps">
            {STEPS.map((s) => (
              <li key={s.key} data-state={done.has(s.key) ? "done" : s.key === (action === "TOPIC_CHECK" ? "TEACH" : action) ? "now" : undefined}>{s.label}</li>
            ))}
          </ol>}

          {!current.available ? (
            <div className={styles.topicNext}>
              <p>Cogna doesn&apos;t have checks for {current.name.toLowerCase()} yet. Teach it as usual and move on when the class is ready.</p>
              <button type="button" className={shared.primary} disabled={Boolean(busy)} onClick={() => void moveOn(current.topicId, next?.topicId)}>
                {busy === "done" ? "Moving on…" : next ? `Done: move on to ${next.name.toLowerCase()}` : "Mark it done"}
              </button>
            </div>
          ) : readiness ? (
            <>
              <p className={styles.topicAdvice}>{readiness.recommendation.text}</p>
              <div className={styles.topicCounts}>
                {(Object.keys(STATUS_LABEL) as TopicStudentStatus[]).filter((k) => readiness.counts[k]).map((k) => (
                  <span key={k} data-status={k}><b>{readiness.counts[k]}</b> {STATUS_LABEL[k].toLowerCase()}</span>
                ))}
              </div>
              {plan.current?.growth && (
                <p className={styles.muted}>
                  Growth so far: {plan.current.growth.before} → {plan.current.growth.after} skills secure on average ({plan.current.growth.students} student{plan.current.growth.students === 1 ? "" : "s"} checked twice).
                </p>
              )}

              {(action === "CATCH_UP" || action === "MOVE_ON") && recommended && (
                <fieldset className={styles.catchUp}>
                  <legend>Still need help</legend>
                  <p className={styles.muted}>A catch-up gives each student a few questions (up to 8) on only their own open skills.</p>
                  {readiness.students.filter((s) => recommended.split(",").includes(s.studentId)).map((s) => (
                    <label key={s.studentId}>
                      <input
                        type="checkbox"
                        checked={catchUp.has(s.studentId)}
                        onChange={(e) => setCatchUp((prev) => { const n = new Set(prev); if (e.target.checked) n.add(s.studentId); else n.delete(s.studentId); return n; })}
                      />
                      {s.name}{s.need ? <small> · {s.need}</small> : null}
                    </label>
                  ))}
                </fieldset>
              )}

              <div className={styles.topicActions}>
                {action === "DIAGNOSTIC" && (
                  <>
                    <button type="button" className={shared.primary} disabled={Boolean(busy)} onClick={() => void sendCheck(current.topicId, "DIAGNOSTIC")}>{busy === "DIAGNOSTIC" ? "Sending…" : "Send the diagnostic"}</button>
                    <button type="button" className={shared.secondary} disabled={Boolean(busy)} onClick={() => void sendCheck(current.topicId, "TOPIC_CHECK")}>Already taught it: send the topic check</button>
                  </>
                )}
                {action === "TOPIC_CHECK" && (
                  <button type="button" className={shared.primary} disabled={Boolean(busy)} onClick={() => void sendCheck(current.topicId, "TOPIC_CHECK")}>{busy === "TOPIC_CHECK" ? "Sending…" : "I've taught it: send the topic check"}</button>
                )}
                {(action === "CATCH_UP" || action === "MOVE_ON") && catchUpIds.length > 0 && (
                  <button type="button" className={action === "CATCH_UP" ? shared.primary : shared.secondary} disabled={Boolean(busy)} onClick={() => void sendCheck(current.topicId, "CATCH_UP", catchUpIds)}>
                    {busy === "CATCH_UP" ? "Sending…" : `Send a catch-up to ${catchUpIds.length}`}
                  </button>
                )}
                {(action === "MOVE_ON" || action === "CATCH_UP" || (action === "TOPIC_CHECK" && done.has("TOPIC_CHECK"))) && (
                  <button type="button" className={action === "MOVE_ON" ? shared.primary : shared.secondary} disabled={Boolean(busy)} onClick={() => void moveOn(current.topicId, next?.topicId)}>
                    {busy === "done" ? "Moving on…" : next ? `Move on to ${next.name.toLowerCase()}` : "Mark the topic done"}
                    {action !== "MOVE_ON" ? " anyway" : ""}
                  </button>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      {showPlan && (
        <ol className={styles.topicPlan} aria-label="Topic plan">
          {plan.topics.map((t) => (
            <li key={t.topicId} data-status={t.status}>
              <span className={styles.chapter}>{t.chapter}</span>
              <span className={styles.planName}>
                {t.name}
                <small>
                  {t.status === "DONE" ? `Done ${shortDate(t.doneAt)}` : t.status === "TEACHING" ? "Teaching now" : "Upcoming"}
                  {t.available ? " · Cogna checks" : ""}
                  {t.checks.length ? ` · ${t.checks.length} check${t.checks.length === 1 ? "" : "s"}` : ""}
                </small>
              </span>
              {t.status !== "TEACHING" && (
                <button type="button" className={styles.planButton} disabled={Boolean(busy)} onClick={() => void startTopic(t.topicId)}>
                  {busy === `start:${t.topicId}` ? "Starting…" : t.status === "DONE" ? "Teach again" : "Teach this now"}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
