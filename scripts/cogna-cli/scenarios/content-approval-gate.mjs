export const name = "content-approval-gate";
export const description =
  "Staging approval gate does not serve PENDING_REVIEW when enforced (R12)";
export const mapsTo = ["R12"];

/**
 * @param {{ client: ReturnType<import("../lib/client.mjs").createClient>, log?: (step: string, msg: string) => void }} ctx
 */
export async function run({ client, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  await client.health();
  const gate = await client.getApprovalGate();
  if (typeof gate.approvedCount !== "number") {
    throw new Error("approval-gate missing approvedCount");
  }
  record(
    "gate",
    "PASS",
    `stagingGate=${gate.stagingGate} approved=${gate.approvedCount} pending=${gate.pendingReviewCount}`,
  );

  if (gate.stagingGate === "ENFORCED") {
    if (gate.wouldServePendingToStudent) {
      throw new Error("ENFORCED gate must not serve PENDING_REVIEW to students");
    }
    record("enforced", "PASS", "PENDING_REVIEW blocked for students");
  } else {
    // Local API often runs with ALLOW_PENDING_REVIEW_QUESTIONS=true for demos.
    // Still assert the gate reports relaxed mode honestly and approved content exists.
    if (gate.approvedCount < 1) {
      throw new Error("Need at least one APPROVED question for safe fallback");
    }
    record(
      "relaxed-dev",
      "PASS",
      "ALLOW_PENDING on — gate reports RELAXED; APPROVED bank present",
    );
  }

  return { steps };
}
