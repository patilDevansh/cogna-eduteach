import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { factorisationStopReason, MIN_ANSWERS_FOR_EARLY_STOP } from "../../src/lotus/lotus-factorisation";
import { autoAdvanceEnabled, nextStage, stagesAfterDiagnostic } from "../../src/classrooms/pilot-flow";
import { buildClassReport, type StudentEvidence } from "../../src/classrooms/class-report";

/** An audit carrying only the code-marked skill evidence the ledger reads. */
const ev = (skillId: string, ok: boolean, mistake = "PARTIAL_GCF") =>
  ({ skillEvidence: [{ skillId, kind: ok ? "SECURE" : "MISTAKE", ...(ok ? {} : { mistake }), source: "INSTANT" }] }) as unknown as LotusQuestionAudit;

// FAC_COMMON_MONOMIAL depends on FAC_DIVIDE_TERMS.
const prerequisiteSecure = [ev("FAC_DIVIDE_TERMS", true), ev("FAC_DIVIDE_TERMS", true)];

describe("diagnostic stopping rule", () => {
  it("stops at the time limit", () => {
    const stop = factorisationStopReason([ev("FND_FACTOR_PAIRS", true)], 15 * 60, 15 * 60);
    assert.equal(stop?.reason, "TIME_LIMIT");
    assert.match(stop!.note, /15-minute/);
  });

  it("keeps going before the time limit with nothing confirmed", () => {
    const audits = Array.from({ length: 12 }, () => ev("FND_FACTOR_PAIRS", true));
    assert.equal(factorisationStopReason(audits, 300, 900), null);
  });

  it("stops early once a confirmed gap's prerequisites are all secure", () => {
    const audits = [
      ...prerequisiteSecure,
      ev("FND_FACTOR_PAIRS", true), ev("FND_FACTOR_PAIRS", true), ev("FND_SIGN_MUL_DIV", true), ev("FND_SIGN_MUL_DIV", true),
      ev("FAC_COMMON_MONOMIAL", false), ev("FAC_COMMON_MONOMIAL", false),
    ];
    assert.equal(audits.length, MIN_ANSWERS_FOR_EARLY_STOP);
    const stop = factorisationStopReason(audits, 300, 900);
    assert.equal(stop?.reason, "STARTING_POINT_FOUND");
    assert.equal(stop?.reason === "STARTING_POINT_FOUND" && stop.skillId, "FAC_COMMON_MONOMIAL");
  });

  it("does not stop while a prerequisite of the gap is untested", () => {
    const audits = [
      ...Array.from({ length: 6 }, () => ev("FND_FACTOR_PAIRS", true)),
      ev("FAC_COMMON_MONOMIAL", false), ev("FAC_COMMON_MONOMIAL", false),
    ];
    assert.equal(factorisationStopReason(audits, 300, 900), null);
  });

  it("does not stop on a gap confirmed too early", () => {
    const audits = [...prerequisiteSecure, ev("FAC_COMMON_MONOMIAL", false), ev("FAC_COMMON_MONOMIAL", false)];
    assert.equal(factorisationStopReason(audits, 300, 900), null);
  });
});

describe("pilot auto-advance", () => {
  it("is on unless the run turns it off", () => {
    assert.equal(autoAdvanceEnabled({}), true);
    assert.equal(autoAdvanceEnabled(null), true);
    assert.equal(autoAdvanceEnabled({ autoAdvance: false }), false);
  });

  it("goes diagnostic → teaching → exit → done", () => {
    assert.equal(nextStage("DIAGNOSTIC"), "TEACHING");
    assert.equal(nextStage("TEACHING"), "INDEPENDENT_EXIT");
    assert.equal(nextStage("INDEPENDENT_EXIT"), null);
  });

  it("skips teaching and exit when there's nothing to teach", () => {
    assert.equal(stagesAfterDiagnostic({ outcome: "SOLID_GAP", lessonStatus: "PREPARING" }).kind, "CONTINUE");
    assert.equal(stagesAfterDiagnostic({ outcome: "ADVANCEMENT", lessonStatus: "ABSTAINED" }).kind, "SKIP_REST");
    assert.equal(stagesAfterDiagnostic({ outcome: "SOLID_GAP", lessonStatus: "ABSTAINED" }).kind, "SKIP_REST");
  });
});

describe("class report", () => {
  const skills = (gap: string) => [
    { skillId: gap, name: gap === "FAC_FACTOR_FULLY" ? "Factorising fully" : "Two numbers with a given product and sum", state: "CONFIRMED" },
    { skillId: "FND_FACTOR_PAIRS", name: "Factor pairs of a number", state: "SECURE" },
  ];
  const student = (name: string, gap: string | null, stages: Array<[StudentEvidence["assignments"][number]["kind"], string]>, exitCorrect?: boolean): StudentEvidence => ({
    studentId: name.toLowerCase(),
    name,
    assignments: stages.map(([kind, status]) => ({ kind, status })),
    diagnostic: gap === undefined ? null : gap
      ? { outcome: "SOLID_GAP", startingSkillId: gap, skills: skills(gap), answered: 10, correct: 6 }
      : { outcome: "ADVANCEMENT", skills: [{ skillId: "FND_FACTOR_PAIRS", name: "Factor pairs of a number", state: "SECURE" }], answered: 25, correct: 25 },
    exit: exitCorrect === undefined ? null : { correct: exitCorrect },
  });

  const report = buildClassReport([
    student("Aarav", "FAC_PAIR_PRODUCT_SUM", [["DIAGNOSTIC", "COMPLETE"], ["TEACHING", "COMPLETE"], ["INDEPENDENT_EXIT", "COMPLETE"]], true),
    student("Meena", "FAC_FACTOR_FULLY", [["DIAGNOSTIC", "COMPLETE"], ["TEACHING", "IN_PROGRESS"]]),
    student("Rohan", "FAC_FACTOR_FULLY", [["DIAGNOSTIC", "COMPLETE"], ["TEACHING", "COMPLETE"], ["INDEPENDENT_EXIT", "COMPLETE"]], false),
    student("Divya", null, [["DIAGNOSTIC", "COMPLETE"], ["TEACHING", "SKIPPED"], ["INDEPENDENT_EXIT", "SKIPPED"]]),
    { studentId: "kabir", name: "Kabir", assignments: [{ kind: "DIAGNOSTIC", status: "IN_PROGRESS" }], diagnostic: null },
  ]);

  it("groups students by starting point, largest first", () => {
    assert.deepEqual(report.gapGroups.map((g) => [g.name, g.students]), [
      ["Factorising fully", ["Meena", "Rohan"]],
      ["Two numbers with a given product and sum", ["Aarav"]],
    ]);
    assert.equal(report.gapGroups[0]!.exitDone, 1);
  });

  it("knows where every student is", () => {
    const stage = Object.fromEntries(report.students.map((s) => [s.name, s.stage]));
    assert.deepEqual(stage, { Aarav: "DONE", Meena: "LESSON", Rohan: "DONE", Divya: "DONE", Kabir: "DIAGNOSTIC" });
  });

  it("counts progress only from the independent exit", () => {
    const progress = Object.fromEntries(report.students.map((s) => [s.name, s.progress]));
    assert.deepEqual(progress, { Aarav: "IMPROVED", Meena: "PENDING", Rohan: "NOT_YET", Divya: "NO_GAP", Kabir: "PENDING" });
    assert.equal(report.totals.improved, 1);
  });

  it("totals and headline", () => {
    assert.deepEqual(report.totals, { enrolled: 5, diagnosticDone: 4, gapFound: 3, noGap: 1, unclear: 0, lessonDone: 2, exitDone: 2, improved: 1 });
    assert.match(report.headline, /Most common need: factorising fully \(2 of the 4 who finished\)/);
    assert.equal(report.skills[0]!.skillId, "FAC_FACTOR_FULLY");
  });
});
