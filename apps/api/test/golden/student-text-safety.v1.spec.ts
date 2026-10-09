import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { openAiStudentTextModerator, studentStrings } from "../../src/ai/student-text-safety";

const clientReturning = (create: (input: { input: string[] }) => Promise<unknown>) =>
  ({ moderations: { create } }) as unknown as OpenAI;

describe("AI text a student will read is safety-checked", () => {
  it("collects every string in a nested AI reply", () => {
    assert.deepEqual(studentStrings({ prompt: "Work out 2/3 + 1/4.", options: ["11/12", " "], n: 3, deep: [{ line: "x" }] }), [
      "Work out 2/3 + 1/4.",
      "11/12",
      "x",
    ]);
  });

  it("passes clean text and names the categories of flagged text", async () => {
    const clean = openAiStudentTextModerator(clientReturning(async () => ({ results: [{ flagged: false, categories: {} }] })));
    assert.equal(await clean(["Work out 2/3 + 1/4."]), null);
    const flagged = openAiStudentTextModerator(
      clientReturning(async () => ({ results: [{ flagged: false, categories: {} }, { flagged: true, categories: { harassment: true, violence: false } }] })),
    );
    assert.match((await flagged(["a", "b"]))!, /harassment/);
  });

  it("fails closed when the check cannot run", async () => {
    const down = openAiStudentTextModerator(clientReturning(async () => { throw new Error("429"); }));
    assert.match((await down(["Work out 2/3 + 1/4."]))!, /unavailable/);
  });
});
