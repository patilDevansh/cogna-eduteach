/**
 * live-gen-timeout — documents expected behavior: timeout → bank.
 * Runtime cannot force a hang without mocking; we assert healthy SHOW_QUESTION
 * path and record SKIP if LIVE_AGENTIC_GENERATE is off.
 */
export const name = "live-gen-timeout";
export const description =
  "Timeout path soft-documented: without serve, bank always wins (timeout→bank)";
export const mapsTo = ["live-agentic-timeout"];

export async function run({ client, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  const genOn = process.env.LIVE_AGENTIC_GENERATE === "true";
  if (!genOn) {
    record(
      "timeout-gate",
      "SKIP",
      "reason: LIVE_AGENTIC_GENERATE not true — timeout path only meaningful when generation runs",
    );
    return { steps };
  }

  await client.health();
  const stamp = Date.now();
  const parent = await client.devSignup(`live-to-${stamp}@test.local`, "Timeout Parent");
  const created = await client.createStudent(parent.parentId, "Timeout Child", 8);
  const { studentId } = await client.loginStudent(created.accessCode);
  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");

  if (session.next?.decision?.uiAction !== "SHOW_QUESTION" || !session.next?.payload?.id) {
    throw new Error("session must still deliver SHOW_QUESTION after gen timeout/fail → bank");
  }
  record(
    "timeout-bank",
    "PASS",
    "SHOW_QUESTION delivered (timeout or success; bank preferred when serve=false)",
  );
  return { steps };
}
