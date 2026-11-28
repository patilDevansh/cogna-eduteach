import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetBudgetForTests } from "../../src/ai/spend-cap";
import { spokenMath } from "../../src/ai/spoken-math";
import type { OpenAIService } from "../../src/ai/openai.service";
import { checkSpokenMaths } from "../../src/voice-tutor/voice-tutor.maths";
import { readScreen, resetVoiceLinksForTests, tutorMessages, verifyVoiceToken } from "../../src/voice-tutor/voice-tutor.rules";
import { VoiceTutorService } from "../../src/voice-tutor/voice-tutor.service";
import { mathsWords, wordsNote } from "../../src/voice-tutor/voice-tutor.words";
import type { TutorContext } from "../../src/voice-tutor/voice-tutor.context";

describe("voice tutor — saying maths in the student's own words", () => {
  it("picks up the student's correct maths words, in their correct form", () => {
    assert.deepEqual(mathsWords(["1 divides by 2"]), { divide: "divided by" }, "a slip of grammar is mirrored correctly");
    assert.deepEqual(mathsWords(["is it three upon four"]), { divide: "upon" });
    assert.deepEqual(mathsWords(["six into four is twenty four", "x square plus 9"]), { times: "into", square: "square" });
    assert.deepEqual(mathsWords(["x squared", "then 3 multiplied by 4"]), { square: "squared", times: "multiplied by" });
  });

  it("ignores casual talk, sizes and units, and the latest phrasing wins", () => {
    assert.deepEqual(mathsWords(["can you go over it again", "bro this is so hard lol", "24 square centimetres", "square root of 16", "a 2 by 3 box"]), {});
    assert.deepEqual(mathsWords(["1 over 2", "no wait, 1 upon 2"]), { divide: "upon" });
    assert.equal(wordsNote({}), null, "nothing said yet: nothing added");
  });

  it("tells the tutor the words to use, and only maths words", () => {
    const [system] = tutorMessages("1 upon 2 plus 1 upon 2?", readScreen({}), [], { divide: "upon" });
    assert.match(system!.content, /"upon" for a fraction or division \(1\/2 is "one upon two"\)/);
    assert.match(system!.content, /never their slang/);
    assert.doesNotMatch(tutorMessages("hi", readScreen({}), [])[0]!.content, /The student says maths/);
  });

  it("voices symbols the student's way, and leaves everyone else's reading as it was", () => {
    assert.equal(spokenMath("1/2 + 1/2 = 1", { divide: "upon" }), "1 upon 2 plus 1 upon 2 equals 1");
    assert.equal(spokenMath("6 × 4 and x²", { times: "into", square: "square" }), "6 into 4 and x square");
    assert.equal(spokenMath("1/2 × x²"), "1 divided by 2 times x squared");
  });

  it("checks a reply said the student's way like any other: true passes, false fails", () => {
    const facts = { grounded: ["Add 1/2 and 1/4"], answers: ["3/4"], question: "Add 1/2 and 1/4" };
    assert.equal(checkSpokenMaths("One upon two is the same as two upon four. What do you get when you add two upon four and one upon four?", [], facts).ok, true);
    assert.equal(checkSpokenMaths("One over two is the same as one over four.", [], facts).ok, false);
    assert.equal(checkSpokenMaths("Let's go over it again.", [], facts).ok, true, "\"go over it\" is not maths");
  });
});

describe("voice tutor — a turn in the student's words", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    resetBudgetForTests();
    resetVoiceLinksForTests();
    Object.assign(process.env, { COGNA_SESSION_SECRET: "voice-tutor-test-secret-0123456789abcdef", VOICE_TUTOR_SAFETY: "provider" });
  });
  afterEach(() => { process.env = { ...saved }; });

  it("asks in the student's words and speaks the reply in them, on both voices", async () => {
    const calls: Array<{ body: { messages: Array<{ content: string }> } }> = [];
    const openai = {
      isConfigured: true,
      getClient: () => ({ chat: { completions: { create: async (body: unknown) => { calls.push({ body } as never); return { choices: [{ message: { content: '{"say":"Can you write 1/2 as 2/4 first?"}' } }] }; } } } }),
    } as unknown as OpenAIService;
    const ctx: TutorContext = { screen: readScreen({ question: "Add 1/2 and 1/4", helpOnQuestion: true }), facts: { grounded: ["Add 1/2 and 1/4"], answers: ["3/4"], question: "Add 1/2 and 1/4" } };
    const reply = await new VoiceTutorService(openai).talk("stu_w", "how do I add them", ctx, [{ role: "student", text: "is it 1 upon 2 plus 1 upon 4" }, { role: "tutor", text: "Let's see." }]);
    assert.match(calls[0]!.body.messages[0]!.content, /"upon" for a fraction/);
    assert.equal(reply.say, "Can you write 1/2 as 2/4 first?", "the written line keeps its symbols");
    assert.equal(reply.spoken, "Can you write 1 upon 2 as 2 upon 4 first?");
    assert.equal(verifyVoiceToken(reply.voice!)?.text, reply.spoken);
  });
});
