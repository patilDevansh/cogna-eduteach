/**
 * Cogna remembers how a student thinks across tests and lessons (src/learner/learner-memory.ts):
 * what a finished test records, how several tests and lessons fold into one picture, and what is said about it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit, LotusSessionView } from "@cogna/shared";
import { PROFILE_SKILL, foldLearnerModel, memoryLines, testEvidence, type EvidenceRow } from "../../src/learner/learner-memory";

let n = 0;
function answer(skillId: string, verdict: "right" | "wrong" | "slip", opts: { mistake?: string; answer?: string; confidence?: number; expression?: string } = {}): LotusQuestionAudit {
  n += 1;
  const wrong = verdict !== "right";
  return {
    question: { id: `q${n}`, prompt: `Factorise ${opts.expression ?? `x^2 + ${n}x`}`, answerKey: { canonicalAnswer: "x", diagnostics: { skillId, taggedSkills: [], stepSkills: [skillId], expression: opts.expression ?? `x^2 + ${n}x`, itemKind: "FACTORISE", predictedMistakes: [] } } },
    response: { answer: opts.answer ?? "a", working: "", confidence: opts.confidence ?? 60, responseTimeMs: 30_000, didNotKnow: false },
    verification: { status: wrong ? "VERIFIED_INCORRECT" : "VERIFIED_CORRECT" },
    skillEvidence: verdict === "right" ? [{ skillId, kind: "SECURE", source: "INSTANT" }]
      : verdict === "wrong" ? [{ skillId, kind: "MISTAKE", mistake: opts.mistake ?? "SIGN_PAIR_ERROR", source: "INSTANT", description: `Wrote ${opts.answer ?? "a"}.` }] : [],
    ...(verdict === "slip" ? { analysisStatus: "COMPLETE", conclusion: { mistakeKind: "SLIP" } } : {}),
    createdAt: new Date(Date.UTC(2026, 10, 1, 10, n)).toISOString(),
  } as unknown as LotusQuestionAudit;
}

function test(id: string, audits: LotusQuestionAudit[], startedAt = "2026-11-01T10:00:00.000Z"): LotusSessionView {
  return { sessionId: id, studentId: "s1", topic: "FACTORISATION", status: "COMPLETE", startedAt, audits, finalReport: { outcome: "SOLID_GAP" } } as unknown as LotusSessionView;
}

const at = (rows: EvidenceRow[], iso: string) => rows.map((r) => ({ ...r, observedAt: new Date(iso) }));

describe("what a finished test is remembered as", () => {
  const rows = testEvidence(test("t1", [
    answer("FAC_MONIC_TRINOMIAL", "wrong", { answer: "(x + 3)(x + 8)", expression: "x^2 - 11x + 24" }),
    answer("FAC_MONIC_TRINOMIAL", "wrong", { answer: "(x + 4)(x + 5)", expression: "x^2 - 9x + 20", confidence: 90 }),
    answer("FAC_DIFF_SQUARES", "right"),
    answer("FAC_DIFF_SQUARES", "right", { confidence: 30 }),
  ]));

  it("a gap keeps the student's own wrong answers and what they were wrong about", () => {
    const gap = rows.find((r) => r.skillId === "FAC_MONIC_TRINOMIAL")!;
    assert.equal(gap.state, "GAP");
    assert.deepEqual(gap.mistakes.map((m) => [m.code, m.question, m.answer]), [
      ["SIGN_PAIR_ERROR", "x^2 - 11x + 24", "(x + 3)(x + 8)"],
      ["SIGN_PAIR_ERROR", "x^2 - 9x + 20", "(x + 4)(x + 5)"],
    ]);
    assert.equal(rows.find((r) => r.skillId === "FAC_DIFF_SQUARES")!.state, "SECURE");
  });

  it("and one row about the student as a whole", () => {
    const profile = rows.find((r) => r.skillId === PROFILE_SKILL)!;
    assert.equal(profile.state, "PROFILE");
    assert.deepEqual([profile.detail.answered, profile.detail.right, profile.detail.confidentButWrong, profile.detail.unsureButRight], [4, 2, 1, 1]);
  });

  it("an unfinished test, or one with no answers, leaves nothing", () => {
    assert.deepEqual(testEvidence({ ...test("t0", [answer("FAC_DIFF_SQUARES", "right")]), status: "ACTIVE" }), []);
    assert.deepEqual(testEvidence(test("t0", [])), []);
  });
});

describe("the student's picture across tests and lessons", () => {
  const first = at(testEvidence(test("t1", [answer("FAC_MONIC_TRINOMIAL", "wrong", { answer: "(x + 3)(x + 8)" }), answer("FAC_MONIC_TRINOMIAL", "wrong", { answer: "(x + 4)(x + 5)" }), answer("FAC_DIFF_SQUARES", "wrong", { mistake: "WROTE_PERFECT_SQUARE" }), answer("FAC_DIFF_SQUARES", "wrong", { mistake: "WROTE_PERFECT_SQUARE" })])), "2026-11-01T10:00:00Z");
  const lesson: EvidenceRow = { studentId: "s1", topic: "FACTORISATION", skillId: "FAC_MONIC_TRINOMIAL", source: "LESSON", sourceId: "l1", state: "LESSON_FAILED", mistakes: [], detail: { format: "SHORT" }, observedAt: new Date("2026-11-02T10:00:00Z") };
  const second = at(testEvidence(test("t2", [answer("FAC_MONIC_TRINOMIAL", "wrong", { answer: "(x + 2)(x + 9)" }), answer("FAC_MONIC_TRINOMIAL", "wrong", { answer: "(x + 1)(x + 6)" }), answer("FAC_DIFF_SQUARES", "right"), answer("FAC_DIFF_SQUARES", "right")])), "2026-11-09T10:00:00Z");

  it("a mistake seen in two tests is a held way of thinking, with the latest example", () => {
    const model = foldLearnerModel("s1", [...first, lesson, ...second]);
    const trinomial = model.skills.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL")!;
    assert.equal(trinomial.status, "GAP");
    assert.equal(trinomial.gapTests, 2);
    assert.deepEqual(trinomial.recurring, ["SIGN_PAIR_ERROR"]);
    assert.equal(trinomial.mistakes[0]!.times, 4);
    assert.equal(trinomial.mistakes[0]!.example.answer, "(x + 1)(x + 6)");
    assert.deepEqual(trinomial.lessons, [{ at: "2026-11-02T10:00:00.000Z", passed: false, format: "SHORT" }]);
  });

  it("a gap that a later test finds secure is remembered as fixed, not just secure", () => {
    const squares = foldLearnerModel("s1", [...first, ...second]).skills.find((s) => s.skillId === "FAC_DIFF_SQUARES")!;
    assert.equal(squares.status, "FIXED");
    assert.deepEqual(squares.recurring, [], "one test's mistakes are not yet a pattern");
  });

  it("a lesson after the latest test says whether teaching worked", () => {
    const afterLesson = foldLearnerModel("s1", [...first, lesson]).skills.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL")!;
    assert.equal(afterLesson.status, "TAUGHT_NOT_YET");
    const passed = foldLearnerModel("s1", [...first, { ...lesson, state: "LESSON_PASSED" }]).skills.find((s) => s.skillId === "FAC_MONIC_TRINOMIAL")!;
    assert.equal(passed.status, "TAUGHT");
  });

  it("says it in plain lines: the pattern, the student's own answer, what's fixed and what teaching didn't work", () => {
    const lines = memoryLines(foldLearnerModel("s1", [...first, lesson, ...second]));
    assert.ok(lines.some((l) => /Factorising x² \+ bx \+ c: the same mistake in 2 tests or lessons.*wrote \(x \+ 1\)\(x \+ 6\)/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /Difference of two squares: had trouble before, secure since/.test(l)), lines.join("\n"));
    const pending = memoryLines(foldLearnerModel("s1", [...first, lesson]));
    assert.ok(pending.some((l) => /taught on .* \(short lesson\), but the final check was still wrong/.test(l)), pending.join("\n"));
    assert.ok(lines.some((l) => /Factorising x² \+ bx \+ c: taught on .* \(short lesson\), but still a gap in a later test/.test(l)), "a lesson that didn't stick is remembered after the next test too");
    assert.deepEqual(memoryLines(foldLearnerModel("s1", [...first, lesson, ...second]), { only: ["FAC_DIFF_SQUARES"] }).length, 1);
  });

  it("with no history there is nothing to say", () => {
    assert.deepEqual(foldLearnerModel("s1", []), { studentId: "s1", skills: [], profile: null });
    assert.deepEqual(memoryLines(foldLearnerModel("s1", [])), []);
  });
});
