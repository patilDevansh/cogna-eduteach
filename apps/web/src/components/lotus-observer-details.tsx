import React from "react";
import { LOTUS_GAME_TITLES, type LotusQuestionAudit } from "@cogna/shared";

function formatName(value: string | undefined): string {
  if (!value) return "Not recorded";
  return LOTUS_GAME_TITLES[value as keyof typeof LOTUS_GAME_TITLES] ?? value.replaceAll("_", " ").toLowerCase();
}

const SOURCES = {
  AI_GENERATED_FOR_SESSION: "New AI question for this session",
  AI_REUSED_FROM_BANK: "Reused AI question from the bank",
  CODE_BUILT_GAME: "Question built by code",
  HARDCODED_SYSTEM: "Existing system question",
};

/** Uses recorded decisions only, including an explicit missing state for older turns. */
export function LotusObserverDetails({ audit, model, className }: {
  audit: LotusQuestionAudit;
  model?: string;
  className?: string;
}) {
  const format = audit.formatDecision;
  const selection = audit.questionSelection;
  const queuedMs = audit.analysisStartedAt && audit.analysisQueuedAt
    ? new Date(audit.analysisStartedAt).getTime() - new Date(audit.analysisQueuedAt).getTime()
    : null;
  const duration = audit.timingMs?.total;
  const timing = typeof duration === "number" && Number.isFinite(duration) && duration >= 0
    ? `${(duration / 1000).toFixed(1)} seconds`
    : "Not recorded";
  return <section className={className} aria-label="Review timing and question choice">
    {audit.response && <>
      <h4>Answer review</h4>
      {audit.analysisSource === "AI_REVIEW" && audit.analysisStatus === "COMPLETE" ? <>
        <p><strong>Session review model</strong> {model?.replace(/\s*·\s*GPT primary$/, "") ?? "Not recorded"}</p>
        <p><strong>AI response time</strong> {timing}</p>
      </> : <p>{audit.analysisStatus === "PENDING" ? "AI review pending" : audit.analysisStatus === "FAILED" ? "AI review failed" : "Marked directly by Cogna"}</p>}
      {queuedMs !== null && Number.isFinite(queuedMs) && queuedMs >= 0 && <p><strong>Time waiting before review</strong> {(queuedMs / 1000).toFixed(1)} seconds</p>}
    </>}
    <h4>Next question choice</h4>
    <p><strong>Question source</strong> {selection.provenance ? SOURCES[selection.provenance] : "Not recorded"}</p>
    <p><strong>Selection route</strong> {selection.selectedFrom.replaceAll("_", " ").toLowerCase()}</p>
    <p><strong>Why this question</strong> {selection.reason || "Not recorded"}</p>
    <h4>Question format choice</h4>
    {format ? <>
      <p><strong>Chosen by</strong> {format.source === "AI" ? "AI recommendation checked by Cogna" : "Cogna’s evidence rules"}</p>
      <p><strong>Planned question</strong> {format.targetTurn ?? "No placement recorded"}</p>
      {format.proposed && <p><strong>AI requested</strong> {formatName(format.proposed)}</p>}
      <p><strong>Selected format</strong> {formatName(format.chosen)}</p>
      <p><strong>Why this format</strong> {format.reason || "Not recorded"}</p>
      <p><strong>Plan status</strong> {format.status === "APPLIED" ? "Ready in the plan" : format.status === "WAITING_FOR_WRITE" ? "Waiting for a checked question" : "Not applied"}</p>
    </> : <p>No format decision was recorded for this turn.</p>}
  </section>;
}
