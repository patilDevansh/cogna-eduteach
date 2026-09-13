import type {
  PersonalizedVideoEvidenceObservation,
  PersonalizedVideoEvidenceSnapshot,
} from "@cogna/shared";

const INSUFFICIENT_STATES = new Set([
  "insufficient-evidence",
  "INSUFFICIENT_OR_CONFLICTING",
  "insufficient",
  "conflicting",
]);

export interface EvidenceGateResult {
  eligible: boolean;
  reason: string;
  diagnosticState: string;
}

function isVerifiedObservation(observation: PersonalizedVideoEvidenceObservation): boolean {
  return (
    observation.independent &&
    Boolean(observation.questionText?.trim()) &&
    ["VERIFIED_CORRECT", "VERIFIED_INCORRECT"].includes(observation.verificationStatus)
  );
}

/**
 * Remediation requires at least one independent, deterministically checked
 * question-and-step observation. Insufficient or conflicting evidence must
 * abstain — it is not a proven gap.
 */
export function evaluateRemediationEligibility(
  snapshot: PersonalizedVideoEvidenceSnapshot,
): EvidenceGateResult {
  const diagnosticState = snapshot.diagnosticState || "unknown";
  if (snapshot.lotusOutcome === "ADVANCEMENT") {
    return {
      eligible: false,
      reason:
        "The diagnostic showed advancement, not a supported learning gap. Cogna will not assign remediation from a strength.",
      diagnosticState: "developing",
    };
  }
  if (
    snapshot.lotusOutcome === "INSUFFICIENT_OR_CONFLICTING" ||
    INSUFFICIENT_STATES.has(diagnosticState)
  ) {
    return {
      eligible: false,
      reason:
        "Evidence is insufficient or conflicting. Cogna will not prescribe remediation as if a gap were proven.",
      diagnosticState: "insufficient-evidence",
    };
  }

  const verified = (snapshot.verifiedObservations ?? []).filter(isVerifiedObservation);
  if (verified.length === 0) {
    return {
      eligible: false,
      reason:
        "No independent, deterministically verified question-and-step observation is available.",
      diagnosticState: "insufficient-evidence",
    };
  }

  if (!snapshot.observedEvidence?.length) {
    return {
      eligible: false,
      reason: "A remediation assignment requires exact question-and-step evidence, not a prose claim.",
      diagnosticState: "insufficient-evidence",
    };
  }

  return {
    eligible: true,
    reason: "Trusted independent evidence supports a small learning objective.",
    diagnosticState,
  };
}
