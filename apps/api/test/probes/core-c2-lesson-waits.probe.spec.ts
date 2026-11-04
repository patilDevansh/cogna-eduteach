/**
 * Core problem C2 (Cogna Project Hub): the lesson could be chosen while AI
 * reviews were still running, and once chosen it is kept. Lesson creation
 * now waits while any review is still running and not past its deadline;
 * the classroom already retries for two minutes.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusSessionView } from "@cogna/shared";
import * as factorisation from "../../src/lotus/lotus-factorisation";

const reviewsStillRunning = (factorisation as unknown as { reviewsStillRunning?: (s: LotusSessionView, now?: number) => boolean }).reviewsStillRunning;
const NOW = Date.parse("2026-10-25T10:00:00Z");
const session = (audits: Array<{ status: string; deadlineInMs?: number }>) => ({
  audits: audits.map((a) => ({ analysisStatus: a.status, ...(a.deadlineInMs !== undefined ? { analysisDeadlineAt: new Date(NOW + a.deadlineInMs).toISOString() } : {}) })),
}) as unknown as LotusSessionView;

describe("C2: the lesson waits for the AI reviews", () => {
  it("a review still running before its deadline holds the lesson back", () => {
    assert.ok(reviewsStillRunning, "lotus-factorisation should export reviewsStillRunning");
    assert.equal(reviewsStillRunning!(session([{ status: "COMPLETE" }, { status: "PENDING", deadlineInMs: 30_000 }]), NOW), true);
  });
  it("finished, failed or overdue reviews don't hold it back", () => {
    assert.equal(reviewsStillRunning?.(session([{ status: "COMPLETE" }, { status: "FAILED" }, { status: "NOT_REQUIRED" }]), NOW), false);
    assert.equal(reviewsStillRunning?.(session([{ status: "PENDING", deadlineInMs: -61_000 }]), NOW), false, "a review a minute past its deadline isn't waited for");
  });
});
