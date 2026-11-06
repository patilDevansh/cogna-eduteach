import { isPlannedLotusTopic, type LotusQuestion, type LotusQuestionSelection, type LotusSessionView } from "@cogna/shared";

/** Where a question came from: what the server stated with it, else the selection that served it (older sessions). */
export function matchingProvenanceForQuestion(question: LotusQuestion, session: Pick<LotusSessionView, "openingAudit" | "audits">) {
  if (question.provenance) return question.provenance;
  const selections = [session.openingAudit?.questionSelection, ...session.audits.map((audit) => audit.questionSelection)].filter(Boolean) as LotusQuestionSelection[];
  const matching = [...selections].reverse().find((selection) => selection.selectedQuestion?.prompt === question.prompt);
  return matching?.provenance;
}

export function provenanceLabelForQuestion(question: LotusQuestion, session: Pick<LotusSessionView, "openingAudit" | "audits" | "topic">): string {
  const provenance = matchingProvenanceForQuestion(question, session);
  const planned = isPlannedLotusTopic(session.topic);
  if (provenance === "CODE_BUILT_GAME") return "Question built by code";
  if (provenance === "AI_GENERATED_FOR_SESSION") return "New question made for this session";
  if (provenance === "AI_REUSED_FROM_BANK") return "Question reused from the AI question bank";
  // Planned topics (factorisation and the rest) have no fixed bank, so an unknown source is never "hardcoded".
  if (provenance === "HARDCODED_SYSTEM") return planned ? "Question prepared for this session" : "This is a hardcoded question already present in our system";
  if (question.answerKey.diagnostics?.origin === "AI") return "New question made for this session";
  return planned ? "Question prepared for this session" : "This is a hardcoded question already present in our system";
}

/** Reused-from-bank is the one provenance worth a glance: it's the only case where this exact item may have already been seen by another student. */
export function isReusedFromBank(question: LotusQuestion, session: Pick<LotusSessionView, "openingAudit" | "audits">): boolean {
  const provenance = matchingProvenanceForQuestion(question, session);
  return provenance ? provenance === "AI_REUSED_FROM_BANK" : question.answerKey.diagnostics?.provenance === "AI_REUSED_FROM_BANK";
}
