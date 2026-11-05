import type { LotusQuestionAudit } from "@cogna/shared";

/** Related by recorded skill, not a claim that the errors or causes match. */
export function relatedEvidence(audits: LotusQuestionAudit[], index: number) {
  const current = audits[index];
  if (!current?.response) return [];
  const skills = new Set((current.skillEvidence ?? []).map((item) => item.skillId));
  if (!skills.size) return [];
  return audits.slice(0, index + 1).flatMap((audit, questionNumber) => {
    if (!audit.response) return [];
    const shared = (audit.skillEvidence ?? []).filter((item) => skills.has(item.skillId));
    return shared.length ? [{ audit, questionNumber, shared }] : [];
  });
}

/** Prefer the saved, turn-specific uncertainty over an invented generic verdict. */
export function recordedUncertainty(audit: LotusQuestionAudit, alternatives: string[]) {
  if (audit.analysisStatus === "PENDING") return "The AI review is still running. Lotus has not made an interpretation or final decision.";
  if (audit.analysisStatus === "FAILED") return audit.analysisFailureReason ?? "The AI review failed before it could make an interpretation.";
  if (audit.analysisSource === "SUPPORT_SIGNAL") return "Why the student needs support is not known from this response.";
  const uncertainty = audit.conclusion?.uncertainty?.filter(Boolean) ?? [];
  if (uncertainty.length) return uncertainty.join(" ");
  if (alternatives.length) return `Lotus is still distinguishing: ${alternatives.join("; ")}`;
  return "No specific uncertainty was recorded for this response.";
}
