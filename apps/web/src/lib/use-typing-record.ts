"use client";
import { useRef } from "react";
import { LOTUS_EDIT_MAX_LENGTH, LOTUS_EDIT_MAX_SAMPLES, type EditHistorySample } from "@cogna/shared";

/**
 * Every change to an ordinary typed answer, timed from when the question appeared:
 * the same record Typing replay keeps, so the server can read drafts and pauses the
 * same way. Starts afresh for each question.
 */
export function useTypingRecord(questionKey: string | undefined, startedAt: number) {
  const ref = useRef<{ key: string | undefined; samples: EditHistorySample[] }>({ key: questionKey, samples: [] });
  if (ref.current.key !== questionKey) ref.current = { key: questionKey, samples: [] };
  const record = (raw: string) => {
    const log = ref.current.samples;
    const value = raw.slice(0, LOTUS_EDIT_MAX_LENGTH);
    const last = log[log.length - 1];
    if (last?.v === value) return;
    // The server refuses a record that runs backwards, and the wall clock can jump.
    const t = Math.max(last?.t ?? 0, Math.round(Date.now() - startedAt));
    const sample = { t: Math.max(0, t), v: value };
    // Past the cap, the newest text overwrites the last slot: the final answer is never lost.
    if (log.length >= LOTUS_EDIT_MAX_SAMPLES) log[log.length - 1] = sample;
    else log.push(sample);
  };
  const history = (): EditHistorySample[] | undefined => (ref.current.samples.length ? [...ref.current.samples] : undefined);
  return { record, history };
}
