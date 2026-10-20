import type { LotusSessionView } from "@cogna/shared";
import type { PersonalizedVideoEvidenceSnapshot } from "@cogna/shared";

const INDEPENDENT_STATUSES = new Set(["VERIFIED_CORRECT", "VERIFIED_INCORRECT"]);
/** An explicit "I don't know this yet": no maths to check, but the student's own answer. */
export const SAID_NOT_KNOWN = "SAID_NOT_KNOWN";

/**
 * Build assignment evidence only from a persisted Lotus session. Client-supplied
 * snapshots are never trusted as the source of a learning-gap claim.
 */
export function snapshotFromLotusSession(
  session: LotusSessionView,
): PersonalizedVideoEvidenceSnapshot {
  const verifiedObservations = session.audits.flatMap((audit) => {
    if (!audit.response || !audit.verification) return [];
    // The student's own "I don't know this yet" on a real question is direct
    // evidence too: it lets a student who doesn't know a skill be taught it.
    if (audit.response.didNotKnow) {
      return [{
        questionText: audit.question.prompt,
        submittedText: "I don't know this yet",
        verificationStatus: SAID_NOT_KNOWN,
        independent: true,
      }];
    }
    if (!INDEPENDENT_STATUSES.has(audit.verification.status)) return [];
    return [
      {
        questionText: audit.question.prompt,
        submittedText: [audit.response.working, audit.response.answer].filter(Boolean).join("\n"),
        verificationStatus: audit.verification.status,
        independent: true,
      },
    ];
  });

  const observedEvidence =
    session.finalReport?.evidenceSummary?.length
      ? session.finalReport.evidenceSummary
      : verifiedObservations.map(
          (observation) =>
            `${observation.questionText} → ${observation.submittedText} (${observation.verificationStatus})`,
        );

  const lotusOutcome = session.finalReport?.outcome;
  const diagnosticState =
    lotusOutcome === "INSUFFICIENT_OR_CONFLICTING"
      ? "insufficient-evidence"
      : lotusOutcome === "SOLID_GAP"
        ? "supported-gap"
        : lotusOutcome === "ADVANCEMENT"
          ? "developing"
          : verifiedObservations.length
            ? "developing"
            : "insufficient-evidence";

  return {
    diagnosticState,
    observedEvidence,
    verifiedObservations,
    lotusOutcome,
    lotusSessionId: session.sessionId,
    evidenceSource: "LOTUS_SESSION",
  };
}
