export const name = "email-report-delivery";
export const description =
  "Email delivery idempotent via report_deliveries + jobs (R18)";
export const mapsTo = ["R18"];

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
  const email = `email-rpt-${uuid().slice(0, 8)}@example.com`;
  const parent = await client.devSignup(email, "Email Parent");
  const student = await client.createStudent(parent.parentId, "Email Kid");
  const studentId = student.studentId;

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekly = await client.postWeeklyReport(studentId, {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });
  if (!weekly.reportId) throw new Error("missing weekly reportId");
  record("weekly", "PASS", `reportId=${weekly.reportId}`);

  const first = await client.postEmailReport(studentId, {
    reportId: weekly.reportId,
    parentId: parent.parentId,
    channel: "EMAIL",
  });
  if (!first.deliveryId) throw new Error("missing deliveryId");
  if (first.status !== "SENT" && first.status !== "PENDING") {
    throw new Error(`unexpected delivery status ${first.status}`);
  }
  record("email-1", "PASS", `deliveryId=${first.deliveryId} status=${first.status}`);

  const second = await client.postEmailReport(studentId, {
    reportId: weekly.reportId,
    parentId: parent.parentId,
    channel: "EMAIL",
  });
  if (second.deliveryId !== first.deliveryId) {
    throw new Error(
      `duplicate email created new delivery: ${first.deliveryId} vs ${second.deliveryId}`,
    );
  }
  record("email-2", "PASS", "same deliveryId — no double send");

  return { steps };
}
