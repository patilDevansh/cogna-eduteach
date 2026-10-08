import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOTUS_PLANNED_TOPICS, type LotusQuestion } from "@cogna/shared";
import { classifyExpansion, readNumberAnswer, sameNumber } from "../../src/lotus/lotus-algebra";
import { curriculumFor } from "../../src/lotus/lotus-factorisation-catalogue";
import { CATCH_UP_MAX, buildFactorisationReport, catchUpSlots, foldLedger, instantVerdict } from "../../src/lotus/lotus-factorisation";
import { FakeLotusModelService } from "../../src/lotus/lotus-fake-model.service";
import { LotusQuestionFactory } from "../../src/lotus/lotus-question-factory";

const factory = new LotusQuestionFactory(new FakeLotusModelService());
const drafted = LOTUS_PLANNED_TOPICS.filter((t) => t !== "FACTORISATION");
const answer = (text: string) => ({ answer: text, working: text, confidence: 70 } as never);

describe("marking number and expand answers", () => {
  it("reads numbers the way students write them", () => {
    assert.equal(readNumberAnswer("x = 4"), "4");
    assert.ok(sameNumber("₹9,440", "9440"));
    assert.ok(sameNumber("37.5%", "75/2"));
    assert.ok(sameNumber("−3/2", "-1.5"));
    assert.ok(sameNumber("13 cm", "13"));
    assert.equal(readNumberAnswer("no idea"), null);
  });

  it("an expansion is only finished with no brackets and like terms collected", () => {
    assert.equal(classifyExpansion("x^2 + 7x + 12", "(x + 4)(x + 3)"), "CORRECT");
    assert.equal(classifyExpansion("x^2 + 3x + 4x + 12", "(x + 4)(x + 3)"), "UNFINISHED");
    assert.equal(classifyExpansion("x(x + 7) + 12", "(x + 4)(x + 3)"), "UNFINISHED");
    assert.equal(classifyExpansion("x^2 + 12", "(x + 4)(x + 3)"), "INCORRECT");
    assert.equal(classifyExpansion("-12x^3y^4", "4x^2y * (-3xy^3)"), "CORRECT");
    assert.equal(classifyExpansion("x^5", "x^9 / x^4"), "CORRECT");
  });
});

for (const topic of drafted) {
  describe(`${topic} planned test`, () => {
    const curriculum = curriculumFor(topic);

    it("writes, checks and marks every slot", async () => {
      for (const spec of curriculum.slots) {
        const result = await factory.write({ spec, purpose: "BASE", variation: `t:${spec.slot}`, avoid: [] });
        assert.ok(result.item, `slot ${spec.slot} (${spec.shape}) was rejected: ${result.rejections.join(" | ")}`);
        const item = { ...result.item!, id: `q${spec.slot}` } as LotusQuestion;
        const right = instantVerdict(item, answer(item.answerKey.canonicalAnswer));
        assert.equal(right.verification.status, "VERIFIED_CORRECT", `slot ${spec.slot}: the key isn't marked right`);
        const wrong = item.answerKey.diagnostics!.predictedMistakes[0]!;
        const marked = instantVerdict(item, answer(wrong.answer));
        assert.notEqual(marked.verification.status, "VERIFIED_CORRECT", `slot ${spec.slot}: a predicted wrong answer is marked right`);
        assert.equal(marked.evidence[0]?.mistake, wrong.mistake, `slot ${spec.slot}: the mistake isn't named`);
      }
    });

    it("confirms a gap from two wrong answers on the same skill and names it as the starting point", async () => {
      const spec = curriculum.slots.find((s) => s.kind !== "CHOICE")!;
      const audits = [];
      for (const n of [1, 2]) {
        const item = { ...(await factory.write({ spec, purpose: "BASE", variation: `gap:${n}`, avoid: [] })).item!, id: `g${n}` } as LotusQuestion;
        const wrong = item.answerKey.diagnostics!.predictedMistakes[0]!.answer;
        audits.push({ question: item, response: answer(wrong), skillEvidence: instantVerdict(item, answer(wrong)).evidence } as never);
      }
      const report = buildFactorisationReport({
        ledger: foldLedger(audits),
        state: { topic, planTurn: 2, turns: [], answeredTurns: [1, 2], handledConfirmed: [], handledBroadened: [], fastSkips: 0 },
        pendingAnalyses: 0,
      });
      assert.equal(report.outcome, "SOLID_GAP");
      assert.ok(report.skills?.some((s) => s.state === "CONFIRMED"));
    });
  });
}

describe("lessons for other chapters", () => {
  it("marks calculate answers: a number is finished, working isn't", async () => {
    const { taskVerdict } = await import("../../src/personalized-videos/ai-authoring/lesson-verifier");
    assert.equal(taskVerdict("calculate", "₹2880", "2*(10 + 8)*4*20"), "CORRECT");
    assert.equal(taskVerdict("calculate", "2*18*80", "2*(10 + 8)*4*20"), "UNFINISHED");
    assert.equal(taskVerdict("calculate", "2800", "2*(10 + 8)*4*20"), "INCORRECT");
    assert.equal(readNumberAnswer("2*18*4"), null);
  });

  it("a confirmed mensuration gap becomes a lesson brief on the student's own arithmetic, and a verified lesson passes", async () => {
    const { buildLessonBrief } = await import("../../src/personalized-videos/ai-authoring/lesson-brief");
    const { verifyAuthoredLesson } = await import("../../src/personalized-videos/ai-authoring/lesson-verifier");
    const spec = curriculumFor("MENSURATION").slots.find((s) => s.skillId === "MN_LATERAL")!;
    const audits = [];
    for (const n of [1, 2]) {
      const item = { ...(await factory.write({ spec, purpose: "BASE", variation: `lesson:${n}`, avoid: [] })).item!, id: `l${n}` } as LotusQuestion;
      const wrong = item.answerKey.diagnostics!.predictedMistakes[0]!.answer;
      audits.push({ question: item, response: answer(wrong), skillEvidence: instantVerdict(item, answer(wrong)).evidence } as never);
    }
    const finalReport = buildFactorisationReport({
      ledger: foldLedger(audits),
      state: { topic: "MENSURATION", planTurn: 2, turns: [], answeredTurns: [1, 2], handledConfirmed: [], handledBroadened: [], fastSkips: 0 },
      pendingAnalyses: 0,
    });
    const brief = buildLessonBrief({ topic: "MENSURATION", audits, finalReport } as never, "Meena")!;
    assert.equal(brief.topic, "Mensuration");
    assert.equal(brief.targetSkill.id, "MN_LATERAL");
    assert.equal(brief.studentItems[0]?.task, "calculate");
    assert.equal(brief.studentItems[0]?.expression, "2 * (5 + 4) * 3");

    const say = (text: string) => text;
    const draft = {
      title: "Meena, the four walls",
      objective: "Find the area of four walls without the floor and ceiling.",
      whyThisLesson: "Your answer to question 1 counted more than the walls.",
      learnerDecision: "Add length and width, double it, multiply by the height.",
      teacherDecision: "Give one fresh four-walls question without support.",
      scenes: [
        { title: "Only the walls", beats: [
          { say: say("Meena, you already find the area of a rectangle well. A room has four walls, and each wall is a rectangle."), visual: { type: "title", text: "Four walls, not six faces" } },
          { say: say("Here is your question. The walls go all the way round, so add length and width, double it, then times the height."), visual: { type: "steps", steps: ["2 * (5 + 4) * 3", "2 * 9 * 3", "54"], caption: "The four walls" } },
        ] },
        { title: "Your routine", beats: [
          { say: say("Use this routine every time."), visual: { type: "rule", heading: "Your routine", lines: ["Add length and width", "Double it", "Multiply by the height"] } },
        ] },
      ],
      checkpoints: [
        { afterScene: 1, afterBeat: 0, prompt: "Walls of a room 6 m by 4 m, 3 m high?", spoken: "What is the area of the four walls?",
          check: { task: "calculate", expression: "2 * (6 + 4) * 3" },
          options: [{ label: "60", correct: true, feedback: "Yes: twice 10, times 3." }, { label: "72", correct: false, feedback: "That counts the floor too." }] },
      ],
      practice: [
        { id: "p1", format: "type-answer", prompt: "Four walls: 7 m by 5 m, 3 m high.", expression: "2 * (7 + 5) * 3", task: "calculate", answer: "72", hint: "Add, double, times height.", workedSteps: ["2 * (7 + 5) * 3", "2 * 12 * 3", "72"] },
        { id: "p2", format: "choose", prompt: "Four walls: 8 m by 6 m, 4 m high.", expression: "2 * (8 + 6) * 4", task: "calculate", options: ["112", "192", "56"], answerIndex: 0, feedback: ["Right.", "That adds the floor and ceiling.", "That is only two walls."] },
        { id: "p3", format: "spot-mistake", prompt: "Find the slip.", lines: ["2 * (9 + 6) * 3", "2 * 15 * 3", "45"], wrongLine: 2, fix: "90", explanation: "2 times 15 times 3 is 90." },
        { id: "p4", format: "type-answer", prompt: "Four walls: 10 m by 8 m, 4 m high.", expression: "2 * (10 + 8) * 4", task: "calculate", answer: "144", hint: "Add, double, times height.", workedSteps: ["2 * (10 + 8) * 4", "2 * 18 * 4", "144"] },
      ],
      exit: { prompt: "Work out 2 * (12 + 9) * 5, the walls of a hall.", expression: "2 * (12 + 9) * 5", task: "calculate", answer: "210" },
    };
    const result = verifyAuthoredLesson(draft as never, brief);
    assert.ok(result.ok, result.errors.join("\n"));
  });
});

describe("catch-up tests", () => {
  it("asks two questions per open skill, foundations first, topped up to five, never more than eight", () => {
    const one = catchUpSlots("ALGEBRAIC_EXPRESSIONS", ["AE_BINOMIAL_BINOMIAL"]);
    assert.equal(one.length, 5, "two on the skill, topped up with what it builds on");
    assert.deepEqual(one.slice(-2).map((s) => s.skillId), ["AE_BINOMIAL_BINOMIAL", "AE_BINOMIAL_BINOMIAL"]);
    assert.deepEqual(one.slice(0, 3).map((s) => s.skillId), ["AE_TERMS", "AE_MONO_MONO", "AE_MONO_POLY"], "deepest first");
    const many = catchUpSlots("ALGEBRAIC_EXPRESSIONS", ["AE_IDENTITY_SQ_PLUS", "AE_TERMS", "AE_IDENTITY_DIFF", "AE_EVALUATE", "AE_ADD_SUB"]);
    assert.equal(many.length, CATCH_UP_MAX);
    assert.equal(many[0]!.skillId, "AE_TERMS", "most foundational first");
    assert.deepEqual(catchUpSlots("ALGEBRAIC_EXPRESSIONS", ["FAC_MEANING"]), [], "another topic's skill gives no catch-up");
  });

  it("a catch-up is judged only on its own skills: secure twice means caught up", async () => {
    const spec = curriculumFor("ALGEBRAIC_EXPRESSIONS").slots.find((s) => s.skillId === "AE_BINOMIAL_BINOMIAL")!;
    const audits = [];
    for (const n of [1, 2]) {
      const item = { ...(await factory.write({ spec, purpose: "BASE", variation: `cu:${n}`, avoid: [] })).item!, id: `c${n}` } as LotusQuestion;
      const right = item.answerKey.canonicalAnswer;
      audits.push({ question: item, response: answer(right), skillEvidence: instantVerdict(item, answer(right)).evidence } as never);
    }
    const report = buildFactorisationReport({
      ledger: foldLedger(audits),
      state: { topic: "ALGEBRAIC_EXPRESSIONS", focusSkills: ["AE_BINOMIAL_BINOMIAL"], planTurn: 2, turns: [], answeredTurns: [1, 2], handledConfirmed: [], handledBroadened: [], fastSkips: 0 },
      pendingAnalyses: 0,
    });
    assert.equal(report.outcome, "ADVANCEMENT");
    assert.match(report.startingPoint, /Caught up: multiplying two binomials is now secure/);
  });
});

describe("shape, chart and grid pictures", () => {
  const brief = { studentFirstName: "Asha", grade: 8, topic: "Understanding quadrilaterals", targetSkill: { id: "QD_QUAD_ANGLES", name: "Angles of a quadrilateral add to 360°" }, buildsOn: [], mistakes: [], studentItems: [], strengths: [] };
  const lesson = (visuals: unknown[]) => ({
    title: "Asha, angles in a quadrilateral",
    objective: "Find a missing angle in a quadrilateral.",
    whyThisLesson: "Your diagnostic pointed here.",
    learnerDecision: "Add the angles you know and take them from 360.",
    teacherDecision: "Give one fresh missing-angle question.",
    scenes: [
      { title: "Four corners", beats: visuals.map((visual) => ({ say: "Look at the picture.", visual })) },
      { title: "Your routine", beats: [{ say: "Use this routine every time.", visual: { type: "rule", heading: "Your routine", lines: ["Add the angles you know", "Take the total from 360"] } }] },
    ],
    checkpoints: [{ afterScene: 1, afterBeat: 0, prompt: "Angles 90, 90 and 100. The fourth?", spoken: "What is the fourth angle?", check: { task: "calculate", expression: "360 - 90 - 90 - 100" }, options: [{ label: "80", correct: true, feedback: "Yes." }, { label: "100", correct: false, feedback: "Add them first." }] }],
    practice: [
      { id: "p1", format: "type-answer", prompt: "Angles 80, 95, 110. The fourth?", expression: "360 - 80 - 95 - 110", task: "calculate", answer: "75", hint: "Take from 360.", workedSteps: ["360 - 80 - 95 - 110", "360 - 285", "75"] },
      { id: "p2", format: "choose", prompt: "Angles 70, 110, 70. The fourth?", expression: "360 - 70 - 110 - 70", task: "calculate", options: ["110", "70", "180"], answerIndex: 0, feedback: ["Right.", "Check the sum.", "That's a triangle's total."] },
      { id: "p3", format: "spot-mistake", prompt: "Find the slip.", lines: ["360 - 100 - 90 - 80", "360 - 270", "100"], wrongLine: 2, fix: "90", explanation: "360 take away 270 is 90." },
      { id: "p4", format: "type-answer", prompt: "Angles 60, 120, 60. The fourth?", expression: "360 - 60 - 120 - 60", task: "calculate", answer: "120", hint: "Take from 360.", workedSteps: ["360 - 60 - 120 - 60", "360 - 240", "120"] },
    ],
    exit: { prompt: "Work out 360 - 85 - 95 - 100 for the fourth angle.", expression: "360 - 85 - 95 - 100", task: "calculate", answer: "80" },
  });
  const shape = { type: "shape", angles: [75, 90, 120, null], sides: ["5 cm", "6 cm", "5 cm", "4 cm"], caption: "One angle to find" };
  const pie = { type: "chart", kind: "pie", labels: ["Tea", "Coffee", "Milk"], values: [180, 120, 60], caption: "Slices in degrees" };
  const grid = { type: "grid", points: [{ label: "A", x: 1, y: 3 }, { label: "B", x: 2, y: 5 }], line: { m: 2, c: 1 } };

  it("a geometry lesson with a shape, a pie chart and a grid passes", async () => {
    const { verifyAuthoredLesson } = await import("../../src/personalized-videos/ai-authoring/lesson-verifier");
    const result = verifyAuthoredLesson(lesson([shape, pie, grid]) as never, brief as never);
    assert.ok(result.ok, result.errors.join("\n"));
  });

  it("rejects angles that don't add up, a degree pie that isn't 360, and a point off its line", async () => {
    const { verifyAuthoredLesson } = await import("../../src/personalized-videos/ai-authoring/lesson-verifier");
    const errors = (v: unknown) => verifyAuthoredLesson(lesson([v]) as never, brief as never).errors.join(" | ");
    assert.match(errors({ ...shape, angles: [75, 90, 120, 80] }), /add to 365°/);
    assert.match(errors({ ...shape, angles: [75, null, 120, null] }), /at most one angle/);
    assert.match(errors({ ...pie, values: [180, 120, 50] }), /add to 350°/);
    assert.match(errors({ ...grid, points: [{ label: "A", x: 1, y: 3 }, { label: "B", x: 2, y: 6 }] }), /B\(2, 6\) is not on y = 2x \+ 1/);
  });
});

describe("fake author on other chapters", () => {
  it("writes a verified arithmetic lesson for a rational-numbers gap, with no factorisation in it", async () => {
    const { fakeDraft } = await import("../../src/personalized-videos/ai-authoring/author-models");
    const { verifyAuthoredLesson } = await import("../../src/personalized-videos/ai-authoring/lesson-verifier");
    const brief = { studentFirstName: "QA", grade: 8, topic: "Rational numbers", targetSkill: { id: "RN_ADD_DIFF", name: "Adding with different denominators" }, buildsOn: [], mistakes: [], strengths: [],
      studentItems: [{ questionNumber: 2, prompt: "Work out 2/3 + 1/4.", expression: "2/3 + 1/4", task: "calculate", studentAnswer: "11/121", correctAnswer: "11/12" }] };
    const draft = fakeDraft(brief as never);
    const result = verifyAuthoredLesson(draft, brief as never);
    assert.ok(result.ok, result.errors.join("\n"));
    assert.doesNotMatch(JSON.stringify(draft), /factoris|multiply.*back/i);
  });
});
