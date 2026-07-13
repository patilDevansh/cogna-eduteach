export const name = "retention-review-due";
export const description =
  "Seed retention fixture → revision plan includes RETENTION_REVIEW (R01/R03)";
export const mapsTo = ["R01", "R03"];

/**
 * @param {{ client: ReturnType<import("../lib/client.mjs").createClient>, uuid: () => string, log?: (step: string, msg: string) => void }} ctx
 */
export async function run({ client, uuid, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  await client.health();
  const email = `retention-${uuid().slice(0, 8)}@example.com`;
  const parent = await client.devSignup(email, "Retention Parent");
  const student = await client.createStudent(parent.parentId, "Retention Kid");
  const studentId = student.studentId;
  record("setup", "PASS", `studentId=${studentId}`);

  // R01: mastery 0.70, daysSinceSuccess 7 → estimate 0.42
  const fixture = await client.post(`/students/${studentId}/dev/retention-fixture`, {
    conceptId: "C2_ONE_STEP_SUBTRACTION",
    mastery: 0.7,
    daysSinceSuccess: 7,
    completedRevisionsLast14Days: 0,
  });
  if (fixture.status !== 200 && fixture.status !== 201) {
    throw new Error(`retention fixture failed: HTTP ${fixture.status}`);
  }
  const estimate = fixture.body?.estimate;
  if (Math.abs(Number(estimate) - 0.42) > 0.001) {
    throw new Error(`Expected retentionEstimate 0.42, got ${estimate}`);
  }
  record("r01-estimate", "PASS", `estimate=${estimate}`);

  const retention = await client.getRetention(studentId);
  const row = retention.estimates?.find((e) => e.conceptId === "C2_ONE_STEP_SUBTRACTION");
  if (!row?.reviewEligible) {
    throw new Error("Expected reviewEligible retention row");
  }
  record("retention-get", "PASS", `reviewEligible=${row.reviewEligible}`);

  const plan = await client.getRevisionPlan(studentId);
  const retentionItems = (plan.daily?.items ?? []).filter((i) => i.type === "RETENTION_REVIEW");
  if (retentionItems.length === 0) {
    throw new Error("revision-plan daily items missing RETENTION_REVIEW");
  }
  record("revision-plan", "PASS", `${retentionItems.length} retention item(s)`);

  // R03 high-priority band
  const high = await client.post(`/students/${studentId}/dev/retention-fixture`, {
    conceptId: "C2_ONE_STEP_SUBTRACTION",
    mastery: 0.55,
    daysSinceSuccess: 10,
    completedRevisionsLast14Days: 0,
  });
  if (Math.abs(Number(high.body?.estimate) - 0.15) > 0.001) {
    throw new Error(`Expected high-priority estimate 0.15, got ${high.body?.estimate}`);
  }
  if (!high.body?.highPriority) {
    throw new Error("Expected highPriority=true for estimate 0.15");
  }
  record("r03-high-priority", "PASS", `estimate=${high.body.estimate}`);

  return { steps };
}
