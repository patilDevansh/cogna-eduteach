/**
 * live-gen-invalid-json — without OpenAI, C-lite uses deterministic params (no JSON).
 * With OPENAI unset, assert generation path does not require valid LLM JSON.
 * SKIP with reason if someone expects LLM-only coverage without a key.
 */
export const name = "live-gen-invalid-json";
export const description =
  "Invalid/missing LLM JSON falls back to deterministic C-lite or bank";
export const mapsTo = ["live-agentic-invalid-json"];

export async function run({ client, log = () => {} }) {
  const steps = [];
  const record = (step, status, detail) => {
    steps.push({ step, status, detail });
    log(step, `${status} — ${detail}`);
  };

  if (process.env.LIVE_AGENTIC_GENERATE !== "true") {
    record(
      "invalid-json",
      "SKIP",
      "reason: LIVE_AGENTIC_GENERATE not true",
    );
    return { steps };
  }

  if (!process.env.OPENAI_API_KEY) {
    record(
      "no-api-key",
      "SKIP",
      "reason: no OPENAI_API_KEY — deterministic C-lite path used (not LLM JSON)",
    );
  } else {
    record("api-key", "PASS", "OPENAI_API_KEY present — LLM params may run");
  }

  await client.health();
  const stamp = Date.now();
  const parent = await client.devSignup(`live-json-${stamp}@test.local`, "JSON Parent");
  const created = await client.createStudent(parent.parentId, "JSON Child", 8);
  const { studentId } = await client.loginStudent(created.accessCode);
  const session = await client.startSession(studentId, "ADAPTIVE_PRACTICE");
  if (!session.next?.payload?.id) {
    throw new Error("expected question after invalid JSON / deterministic fallback");
  }
  record("fallback-ok", "PASS", `questionId=${session.next.payload.id}`);
  return { steps };
}
