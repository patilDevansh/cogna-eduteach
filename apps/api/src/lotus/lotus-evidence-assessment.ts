import type { LotusQuestionAudit, LotusSkillEvidenceAssessment } from "@cogna/shared";
import { normalizeMathText } from "./lotus-algebra";

/**
 * Qualify a report's positive evidence independently of the planner's provisional
 * SECURE routing state. Tagged prerequisites are supporting evidence, never direct
 * demonstrations. A correct answer is not evidence of delayed retention.
 */
export function assessSkillEvidence(audits: LotusQuestionAudit[], skillId: string): LotusSkillEvidenceAssessment {
  const result: LotusSkillEvidenceAssessment = {
    policyVersion: "diagnostic-evidence-v1",
    directSuccessTurns: [], supportingSuccessTurns: [], unscopedSuccessTurns: [],
    distinctDirectSuccessCount: 0, retention: "NOT_MEASURED",
  };
  const distinctQuestions = new Set<string>();
  for (const [index, audit] of audits.entries()) {
    const evidence = (audit.skillEvidence ?? []).filter((e) => e.skillId === skillId);
    if (!evidence.some((e) => e.kind === "SECURE") || evidence.some((e) => e.kind !== "SECURE")) continue;
    const diagnostics = audit.question?.answerKey?.diagnostics;
    if (!audit.response || audit.response.didNotKnow || audit.verification?.status !== "VERIFIED_CORRECT" || !diagnostics) {
      result.unscopedSuccessTurns.push(index + 1);
      continue;
    }
    if (diagnostics.skillId !== skillId) {
      result.supportingSuccessTurns.push(index + 1);
      continue;
    }
    result.directSuccessTurns.push(index + 1);
    // New IDs or renamed variables do not turn the same expression into fresh evidence.
    let fingerprint = normalizeMathText(diagnostics.expression ?? audit.question.prompt).toLowerCase();
    if (diagnostics.expression) {
      const letters = new Map<string, string>();
      fingerprint = fingerprint.replace(/[a-z]/g, (letter) => {
        if (!letters.has(letter)) letters.set(letter, String.fromCharCode(97 + letters.size));
        return letters.get(letter)!;
      });
    }
    if (fingerprint) distinctQuestions.add(fingerprint);
  }
  result.distinctDirectSuccessCount = distinctQuestions.size;
  return result;
}
