import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthoredLessonDraft, LotusSessionView } from "@cogna/shared";
import { buildLessonBrief, tidyExpression, type LessonBrief } from "../../src/personalized-videos/ai-authoring/lesson-brief";
import { narrationArithmeticErrors, taskVerdict, verifyAuthoredLesson } from "../../src/personalized-videos/ai-authoring/lesson-verifier";
import { AuthorUnavailableError, FakeLessonAuthor, fakeDraft, type LessonAuthorModel } from "../../src/personalized-videos/ai-authoring/author-models";
import { authorLesson } from "../../src/personalized-videos/ai-authoring/lesson-author";
import { generatePractice } from "../../src/personalized-videos/ai-authoring/practice-generator";
import { briefFromPrompt, buildAuthorPrompt } from "../../src/personalized-videos/ai-authoring/lesson-prompt";

const AARAV: LessonBrief = {
  studentFirstName: "Aarav",
  grade: 8,
  topic: "Factorisation",
  targetSkill: { id: "FAC_PAIR_PRODUCT_SUM", name: "Two numbers with a given product and sum" },
  buildsOn: ["Factor pairs of a number"],
  mistakes: ["SIGN_PAIR_ERROR"],
  studentItems: [
    { questionNumber: 10, prompt: "Factorise x^2 - 7x + 12.", expression: "x^2 - 7x + 12", task: "factorise", studentAnswer: "(x + 3)(x + 4)", correctAnswer: "(x - 3)(x - 4)", mistake: "SIGN_PAIR_ERROR" },
  ],
  strengths: ["Difference of two squares"],
};

const ROHAN: LessonBrief = {
  ...AARAV,
  studentFirstName: "Rohan",
  targetSkill: { id: "FAC_FACTOR_FULLY", name: "Factorising fully" },
  mistakes: ["INCOMPLETE_FACTORISATION"],
  studentItems: [
    { questionNumber: 20, prompt: "Factorise 5x^2 - 20 fully.", expression: "5x^2 - 20", task: "factorise", studentAnswer: "5(x^2 - 4)", correctAnswer: "5(x - 2)(x + 2)", mistake: "INCOMPLETE_FACTORISATION" },
  ],
};

const MEENA: LessonBrief = {
  ...AARAV,
  studentFirstName: "Meena",
  targetSkill: { id: "EXP_EXPAND_SINGLE", name: "Expanding one bracket" },
  studentItems: [
    { questionNumber: 3, prompt: "Simplify 2(3x - 4).", expression: "2(3x - 4)", task: "simplify", studentAnswer: "6x - 4", correctAnswer: "6x - 8" },
  ],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Applies a change to a verified draft and returns the verifier's errors. */
function errorsAfter(brief: LessonBrief, change: (d: AuthoredLessonDraft) => void): string[] {
  const draft = clone(fakeDraft(brief));
  change(draft);
  return verifyAuthoredLesson(draft, brief).errors;
}

describe("the fake author's drafts pass the verifier", () => {
  for (const brief of [AARAV, ROHAN, MEENA]) {
    it(`${brief.studentFirstName} (${brief.targetSkill.id})`, () => {
      const result = verifyAuthoredLesson(fakeDraft(brief), brief);
      assert.deepEqual(result.errors, []);
      assert.ok(result.claimsChecked > 10, `checked ${result.claimsChecked} claims`);
    });
  }
});

describe("the verifier rejects unchecked mathematics", () => {
  it("a step chain with an unequal step", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[1]!.beats[1]!.visual = { type: "steps", steps: ["(x - 3)(x - 4)", "x^2 - 7x + 13"] };
    });
    assert.ok(errors.some((e) => /not equal to the step before/.test(e)), errors.join("\n"));
  });

  it("a distribution arrow with the wrong product", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[0]!.beats[0]!.visual = { type: "distribute", outside: "3", inside: ["2x", "-5"], result: ["6x", "-5"] };
    });
    assert.ok(errors.some((e) => /3 × \(-5\) is not "-5"/.test(e)), errors.join("\n"));
  });

  it("an area-model cell that is wrong", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[0]!.beats[0]!.visual = { type: "area", rows: ["x", "-3"], cols: ["x", "-4"], cells: [["x^2", "-4x"], ["-3x", "-12"]] };
    });
    assert.ok(errors.some((e) => /cells\[1\]\[1\]/.test(e)), errors.join("\n"));
  });

  it("a factor pair that doesn't add up", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[0]!.beats[0]!.visual = { type: "pair-search", product: 12, sum: -7, pairs: [[3, 4], [-3, -4]], answer: [3, 4] };
    });
    assert.ok(errors.some((e) => /must multiply to 12 and add to -7/.test(e)), errors.join("\n"));
  });

  it("a common factor that isn't the whole common factor", () => {
    const errors = errorsAfter(ROHAN, (d) => {
      d.scenes[0]!.beats[0]!.visual = { type: "common-factor", terms: ["6x^2", "9x"], factor: "3", remaining: ["2x^2", "3x"] };
    });
    assert.ok(errors.some((e) => /equal but not finished/.test(e)), errors.join("\n"));
  });

  it("a 'right' answer that is wrong in the mistake panel", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[1]!.beats[0]!.visual = { type: "mistake", expr: "x^2 - 7x + 12", task: "factorise", wrong: "(x + 3)(x + 4)", wrongKind: "incorrect", right: "(x - 2)(x - 6)", note: "…" };
    });
    assert.ok(errors.some((e) => /the right answer/.test(e)), errors.join("\n"));
  });

  it("a mistake described as the wrong kind (unfinished called incorrect)", () => {
    const errors = errorsAfter(ROHAN, (d) => {
      for (const s of d.scenes) for (const b of s.beats) if (b.visual.type === "mistake") b.visual.wrongKind = "incorrect";
    });
    assert.ok(errors.some((e) => /wrongKind must be "unfinished"/.test(e)), errors.join("\n"));
  });

  it("a checkpoint whose 'correct' option is wrong", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.checkpoints[0]!.options[0]!.label = "(x + 3)(x - 4)";
    });
    assert.ok(errors.some((e) => /option marked correct/.test(e)), errors.join("\n"));
  });

  it("maths-looking checkpoint options without a check", () => {
    const errors = errorsAfter(AARAV, (d) => {
      delete d.checkpoints[0]!.check;
    });
    assert.ok(errors.some((e) => /add check/.test(e)), errors.join("\n"));
  });

  it("false arithmetic in the narration, in digits or in words", () => {
    assert.deepEqual(narrationArithmeticErrors("Three times four is twelve."), []);
    assert.equal(narrationArithmeticErrors("3 times 4 is 14").length, 1);
    assert.equal(narrationArithmeticErrors("minus three plus minus four makes minus six").length, 1);
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[0]!.beats[0]!.say = "Remember, 3 times 4 is 13.";
    });
    assert.ok(errors.some((e) => /that is 12/.test(e)), errors.join("\n"));
  });

  it("a number in the narration that no checked maths contains", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[0]!.beats[0]!.say = "The answer has 37 in it.";
    });
    assert.ok(errors.some((e) => /mentions 37/.test(e)), errors.join("\n"));
  });

  it("symbols the narrator would read out", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes[0]!.beats[0]!.say = "Look at x^2.";
    });
    assert.ok(errors.some((e) => /read aloud/.test(e)), errors.join("\n"));
  });

  it("a practice item with two right answers, or a wrong typed answer", () => {
    const errors = errorsAfter(ROHAN, (d) => {
      for (const item of d.practice) {
        if (item.format === "choose") item.answerIndex = (item.answerIndex + 1) % item.options.length;
        if (item.format === "type-answer") item.answer = `${item.answer} + 1`;
      }
    });
    assert.ok(errors.some((e) => /practice\[\d\]\.options/.test(e)), errors.join("\n"));
    assert.ok(errors.some((e) => /practice\[\d\]\.answer/.test(e)), errors.join("\n"));
  });

  it("a spot-the-mistake item whose 'mistake' line is actually fine", () => {
    const errors = errorsAfter(AARAV, (d) => {
      const item = d.practice.find((p) => p.format === "spot-mistake");
      if (item?.format === "spot-mistake") item.lines[1] = item.fix;
    });
    assert.ok(errors.some((e) => /meant to be the mistake/.test(e)), errors.join("\n"));
  });

  it("an exit item that isn't fresh", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.exit = { prompt: "Factorise x^2 - 7x + 12.", expression: "x^2 - 7x + 12", task: "factorise", answer: "(x - 3)(x - 4)" };
    });
    assert.ok(errors.some((e) => /must be fresh/.test(e)), errors.join("\n"));
  });

  it("an exit question that doesn't show its expression", () => {
    const errors = errorsAfter(ROHAN, (d) => {
      d.exit.prompt = "Factorise fully. Remember to keep the common factor outside the brackets.";
    });
    assert.ok(errors.some((e) => /exit\.prompt: must include the expression/.test(e)), errors.join("\n"));
  });

  it("a lesson that never uses the student's own expression", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.scenes = d.scenes.map((s) => ({ ...s, beats: s.beats.map((b) => ({ ...b, visual: { type: "title" as const, text: "Hello" } })) }));
      d.checkpoints = [{ afterScene: 0, afterBeat: 0, prompt: "Ready?", spoken: "Ready?", options: [{ label: "Yes", correct: true, feedback: "Great." }, { label: "No", correct: false, feedback: "Let's look again." }] }];
    });
    assert.ok(errors.some((e) => /student's own expressions/.test(e)), errors.join("\n"));
  });

  it("labelling language", () => {
    const errors = errorsAfter(AARAV, (d) => {
      d.whyThisLesson = "You are slow at signs.";
    });
    assert.ok(errors.some((e) => e.startsWith("language")), errors.join("\n"));
  });

  it("garbage instead of a lesson", () => {
    assert.equal(verifyAuthoredLesson(null as never, AARAV).ok, false);
    assert.equal(verifyAuthoredLesson({} as never, AARAV).ok, false);
  });
});

describe("write → verify → rewrite", () => {
  /** A model that returns the given drafts in order and records the prompts it saw. */
  function scripted(...drafts: Array<AuthoredLessonDraft | Error>) {
    const prompts: string[] = [];
    const model: LessonAuthorModel = {
      label: "scripted",
      async author(prompt) {
        prompts.push(prompt);
        const next = drafts.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    };
    return { model, prompts };
  }

  it("sends the verifier's errors back and accepts the fixed draft", async () => {
    const bad = clone(fakeDraft(AARAV));
    bad.scenes[1]!.beats[1]!.visual = { type: "steps", steps: ["(x - 3)(x - 4)", "x^2 - 7x - 12"] };
    const { model, prompts } = scripted(bad, fakeDraft(AARAV));
    const outcome = await authorLesson(AARAV, model);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.attempts.length, 2);
    assert.match(prompts[1]!, /REJECTED BY THE CHECKER/);
    assert.match(prompts[1]!, /not equal to the step before/);
  });

  it("never returns a draft that keeps failing", async () => {
    const bad = clone(fakeDraft(AARAV));
    bad.scenes[0]!.beats[0]!.say = "3 times 4 is 13.";
    const { model } = scripted(bad, bad, bad);
    const outcome = await authorLesson(AARAV, model);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.attempts.length, 3);
  });

  it("keeps a sound lesson and swaps in code practice when only the practice fails", async () => {
    const bad = clone(fakeDraft(AARAV));
    bad.practice = bad.practice.map((p) => (p.format === "type-answer" ? { ...p, answer: "(x + 1)(x + 1)" } : p));
    const { model } = scripted(bad, bad, bad);
    const outcome = await authorLesson(AARAV, model);
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.equal(outcome.practiceFromCode, true);
  });

  it("stops at once when the account refuses (no credits)", async () => {
    const { model, prompts } = scripted(new AuthorUnavailableError("The AI author is unavailable: no credits"));
    const outcome = await authorLesson(AARAV, model);
    assert.equal(outcome.ok, false);
    assert.equal(prompts.length, 1);
  });

  it("the fake author reads the brief back out of the real prompt", async () => {
    assert.deepEqual(briefFromPrompt(buildAuthorPrompt(ROHAN)), ROHAN);
    const outcome = await authorLesson(ROHAN, new FakeLessonAuthor());
    assert.equal(outcome.ok, true);
  });
});

describe("code-generated practice is always right", () => {
  for (const skill of ["FAC_MONIC_TRINOMIAL", "FAC_COMMON_MONOMIAL", "EXP_EXPAND_SINGLE"]) {
    it(`${skill}: 40 seeds, every item verified`, () => {
      for (let i = 0; i < 40; i++) {
        const brief: LessonBrief = { ...AARAV, targetSkill: { id: skill, name: skill } };
        const set = generatePractice(skill, `seed-${i}`, brief.studentItems.map((item) => item.expression));
        const draft = { ...fakeDraft(brief), practice: set.items, exit: set.exit };
        const result = verifyAuthoredLesson(draft, brief);
        assert.deepEqual(result.errors, [], `seed-${i}`);
      }
    });
  }

  it("verdicts: finished, unfinished and wrong are told apart", () => {
    assert.equal(taskVerdict("factorise", "3x(2x - 3)", "6x^2 - 9x"), "CORRECT");
    assert.equal(taskVerdict("factorise", "3(2x^2 - 3x)", "6x^2 - 9x"), "UNFINISHED");
    assert.equal(taskVerdict("factorise", "3x(2x + 3)", "6x^2 - 9x"), "INCORRECT");
    assert.equal(taskVerdict("expand", "6x - 8", "2(3x - 4)"), "CORRECT");
    assert.equal(taskVerdict("expand", "2(3x - 4) + 0", "2(3x - 4)"), "UNFINISHED");
  });
});

describe("the brief", () => {
  const audit = (skillId: string, expression: string, answer: string, canonical: string, mistake?: string) => ({
    question: { prompt: `Factorise ${expression}.`, answerKey: { canonicalAnswer: canonical, diagnostics: { itemKind: "FACTORISE", expression, skillId, taggedSkills: [], stepSkills: [], predictedMistakes: [], origin: "AI" } } },
    response: { answer },
    skillEvidence: [{ skillId, kind: mistake ? "MISTAKE" : "SECURE", mistake, source: "INSTANT" }],
  });

  it("carries the student's own wrong answers on the starting skill, and nothing identifying", () => {
    const session = {
      topic: "FACTORISATION",
      studentId: "demo_aarav",
      finalReport: { outcome: "SOLID_GAP", skills: [{ skillId: "FAC_DIFF_SQUARES", name: "Difference of two squares", state: "SECURE" }] },
      audits: [
        audit("FAC_MONIC_TRINOMIAL", "x^2 + 5x + 6", "(x + 2)(x + 3)", "(x + 2)(x + 3)"),
        audit("FAC_MONIC_TRINOMIAL", "x^2 - 7x + 12", "(x + 3)(x + 4)", "(x - 3)(x - 4)", "SIGN_PAIR_ERROR"),
        audit("FAC_MONIC_TRINOMIAL", "x^2 - x - 12", "(x - 3)(x + 4)", "(x - 4)(x + 3)", "SIGNS_SWAPPED"),
      ],
    } as unknown as LotusSessionView;
    const brief = buildLessonBrief(session, "Aarav Choudhury");
    assert.ok(brief);
    assert.equal(brief.studentFirstName, "Aarav");
    assert.equal(brief.targetSkill.id, "FAC_MONIC_TRINOMIAL");
    assert.deepEqual(brief.studentItems.map((i) => i.questionNumber), [2, 3]);
    assert.ok(!JSON.stringify(brief).includes("demo_aarav"));
  });
});

describe("tidying generated expressions", () => {
  it("drops + N - N padding, and only when the result is exactly equal", () => {
    assert.equal(tidyExpression("(5x^2 - 20) + 7932 - 7932"), "5x^2 - 20");
    assert.equal(tidyExpression("(x^2 - x - 12) - 3091 + 3091"), "x^2 - x - 12");
    assert.equal(tidyExpression("(x^2 - 1) + 5 - 4"), "(x^2 - 1) + 5 - 4");
    assert.equal(tidyExpression("2y(x + 1) + 3(x + 1)"), "2y(x + 1) + 3(x + 1)");
  });
});


describe("the authoring job runs once", () => {
  it("two workers picking up the same job write one lesson, not two", async () => {
    const { createPersonalizedVideoMemoryDb } = await import("../../src/personalized-videos/personalized-videos.memory");
    const { PersonalizedVideosService } = await import("../../src/personalized-videos/personalized-videos.service");
    const { VideoRendererAdapter } = await import("../../src/personalized-videos/video-renderer.adapter");
    const db = createPersonalizedVideoMemoryDb();
    const videos = new PersonalizedVideosService(db as never, new VideoRendererAdapter({}));
    const assignment = await db.personalizedVideoAssignment.create({
      data: {
        studentId: "walk_aarav",
        status: "PREPARING",
        diagnosticState: "supported-gap",
        conceptId: "FAC",
        learningObjective: "x",
        evidenceSnapshot: {},
        script: {
          name: "Aarav",
          learnerDecision: "",
          teacherDecision: "",
          uncertainty: "Moderate",
          statusLabel: "Targeted bridge",
          lesson: { title: "placeholder", duration: "", objective: "", generationReason: "", verification: "", scenes: [] },
          exit: null,
          authoring: { status: "pending", brief: AARAV, author: "fake" },
        },
      },
    });
    const job = await db.job.create({ data: { jobType: "PERSONALIZED_VIDEO_RENDER", idempotencyKey: `k:${assignment.id}`, payload: { assignmentId: assignment.id } } });

    const results = await Promise.all([videos.processRenderJob(job.id as string), videos.processRenderJob(job.id as string)]);

    const finished = await db.job.findUnique({ where: { id: job.id as string } });
    assert.equal(finished?.attemptCount, 1, "only one worker claimed the job");
    assert.ok(results.some((r) => r.status === "RUNNING"), "the second worker backed off");
    const row = await db.personalizedVideoAssignment.findUnique({ where: { id: assignment.id as string } });
    assert.equal((row?.script as { authoring: { status: string } }).authoring.status, "done");
  });
});

describe("slides for an AI-written lesson", () => {
  it("each slide shows its scene's maths, and slides that already have maths keep it", async () => {
    const { withBeatEquations } = await import("../../src/personalized-videos/ai-authoring/authoring-pipeline");
    const slide = { eyebrow: "Your lesson", headline: "", narration: "", durationSeconds: 6, accent: "green" as const };
    const lesson = {
      title: "t", duration: "1 min", objective: "o", generationReason: "g", verification: "v",
      scenes: [{ ...slide, equation: [] }, { ...slide, equation: [] }, { ...slide, equation: [{ text: "kept" }] }],
    };
    const animation = {
      scenes: [
        { beats: [{ visual: { type: "title", text: "Factorising fully" } }, { visual: { type: "expression", expr: "5x^2 - 20" } }] },
        { beats: [{ visual: { type: "mistake", expr: "5x^2 - 20", task: "factorise", wrong: "5(x^2 - 4)", wrongKind: "unfinished", right: "5(x - 2)(x + 2)", note: "" } }] },
        { beats: [{ visual: { type: "rule", heading: "h", lines: ["a"] } }] },
      ],
    };
    const out = withBeatEquations(lesson, animation as never);
    assert.deepEqual(out.scenes[0]!.equation.map((e) => e.text), ["5x² − 20"]);
    assert.equal(out.scenes[1]!.equation.length, 2);
    assert.ok(out.scenes[1]!.equation[0]!.text.endsWith("✗") && out.scenes[1]!.equation[1]!.text.endsWith("✓"));
    assert.deepEqual(out.scenes[2]!.equation, [{ text: "kept" }]);
  });
});
