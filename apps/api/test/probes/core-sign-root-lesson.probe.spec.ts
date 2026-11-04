/**
 * One cause, many gaps → the lesson follows it (decided Oct 25). When the
 * same sign mistake confirms two or more gaps, teaching starts with signed
 * numbers: the report, the class report's starting point and the lesson all
 * target it, built from the child's sign mistakes across those gaps.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit, LotusSessionView } from "@cogna/shared";
import { foldLedger } from "../../src/lotus/lotus-factorisation";
import * as factorisation from "../../src/lotus/lotus-factorisation";
import { buildLessonBrief } from "../../src/personalized-videos/ai-authoring/lesson-brief";

const item = (skillId: string, expression: string, canonical: string, answer: string, mistake: string) => ({
  question: { prompt: `Factorise completely: ${expression}`, answerKey: { canonicalAnswer: canonical, diagnostics: { itemKind: "FACTORISE", expression, skillId, taggedSkills: [], stepSkills: [skillId], predictedMistakes: [{ answer, mistake }], origin: "AI" } } },
  response: { answer, working: "", confidence: 60, responseTimeMs: 30_000, didNotKnow: false },
  verification: { status: "VERIFIED_INCORRECT", correctAnswer: canonical, method: "DETERMINISTIC_ALGEBRA", explanation: "" },
  skillEvidence: [{ skillId, kind: "MISTAKE", mistake, source: "INSTANT" }],
}) as unknown as LotusQuestionAudit;

const signAudits = [
  item("FAC_GCF_NEGATIVE", "-6x - 18", "-6(x + 3)", "-6(x - 3)", "KEPT_ORIGINAL_SIGNS"),
  item("FAC_GCF_NEGATIVE", "-4x - 12", "-4(x + 3)", "-4(x - 3)", "KEPT_ORIGINAL_SIGNS"),
  item("FAC_GROUP_SIGN", "8xy - 6y - 12x + 9", "(4x - 3)(2y - 3)", "(4x - 3)(2y + 3)", "SIGN_NOT_FLIPPED_IN_GROUP"),
  item("FAC_GROUP_SIGN", "6xy - 4y - 9x + 6", "(3x - 2)(2y - 3)", "(3x - 2)(2y + 3)", "SIGN_NOT_FLIPPED_IN_GROUP"),
];
type Start = { skillId: string; rootOf?: string[] } | undefined;
const teachingStart = (factorisation as unknown as { teachingStart?: (l: unknown) => Start }).teachingStart;

describe("The lesson follows a shared sign cause", () => {
  it("the shared starting point is signed numbers, covering both gaps", () => {
    assert.ok(teachingStart, "lotus-factorisation should export teachingStart");
    const start = teachingStart!(foldLedger(signAudits));
    assert.equal(start?.skillId, "FND_SIGN_MUL_DIV");
    assert.deepEqual([...(start?.rootOf ?? [])].sort(), ["FAC_GCF_NEGATIVE", "FAC_GROUP_SIGN"]);
  });

  it("with one sign gap, the start is that gap as before", () => {
    const start = teachingStart?.(foldLedger(signAudits.slice(0, 2)));
    assert.equal(start?.skillId, "FAC_GCF_NEGATIVE");
  });

  it("the AI-written lesson targets signed numbers and uses sign mistakes from both gaps", () => {
    const session = { topic: "FACTORISATION", audits: signAudits, finalReport: { outcome: "SOLID_GAP", skills: [] } } as unknown as LotusSessionView;
    const brief = buildLessonBrief(session, "Asha");
    assert.equal(brief?.targetSkill.id, "FND_SIGN_MUL_DIV");
    const skillsUsed = new Set(brief!.studentItems.map((s) => s.prompt.includes("xy") ? "group" : "negative"));
    assert.deepEqual([...skillsUsed].sort(), ["group", "negative"], "the lesson should be built from the child's own sign mistakes in both skills");
  });
});
