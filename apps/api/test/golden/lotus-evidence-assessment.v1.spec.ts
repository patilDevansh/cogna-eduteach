import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestionAudit } from "@cogna/shared";
import { assessSkillEvidence } from "../../src/lotus/lotus-evidence-assessment";
import { buildFactorisationReport, foldLedger, teachingStart, type FactorisationState } from "../../src/lotus/lotus-factorisation";

const target = "FAC_DIVIDE_TERMS";
const supporting = "FAC_GCF_NUMERIC";
function success(expression: string, skill = target): LotusQuestionAudit {
  return {
    question: { id: `item-${expression}`, prompt: `Factorise ${expression}`, answerKey: { diagnostics: {
      skillId: skill, itemKind: "FACTORISE", expression, taggedSkills: [supporting], stepSkills: [skill, supporting],
    } } },
    response: { answer: "correct", working: "", didNotKnow: false },
    verification: { status: "VERIFIED_CORRECT" },
    skillEvidence: [...new Set([skill, supporting])].map((skillId) => ({ skillId, kind: "SECURE", source: "INSTANT" })),
  } as LotusQuestionAudit;
}
const state: FactorisationState = {
  topic: "FACTORISATION", focusSkills: [target], planTurn: 3, turns: [], answeredTurns: [],
  handledConfirmed: [], handledBroadened: [], fastSkips: 0,
};
function report(audits: LotusQuestionAudit[]) {
  return buildFactorisationReport({ ledger: foldLedger(audits), state, pendingAnalyses: 0, audits });
}

describe("diagnostic evidence qualification", () => {
  it("one correct typed response is an observation, not a demonstrated strength or advancement", () => {
    const r = report([success("6x+9")]);
    assert.equal(r.skills?.find((s) => s.skillId === target)?.state, "OBSERVED");
    assert.deepEqual(r.observedStrengths, []);
    assert.equal(r.outcome, "INSUFFICIENT_OR_CONFLICTING");
    assert.match(r.recommendedNextStep, /fresh direct evidence/);
  });

  it("repeated direct success qualifies the target but never its merely tagged prerequisites", () => {
    const r = report([success("6x+9"), success("8x+12")]);
    assert.equal(r.skills?.find((s) => s.skillId === target)?.state, "SECURE");
    assert.equal(r.skills?.find((s) => s.skillId === supporting)?.state, "OBSERVED");
    assert.equal(r.outcome, "ADVANCEMENT");
    assert.equal(r.observedStrengths.length, 1);
    const a = r.skills?.find((s) => s.skillId === supporting)?.evidenceAssessment;
    assert.deepEqual(a?.supportingSuccessTurns, [1, 2]);
    assert.equal(a?.distinctDirectSuccessCount, 0);
  });

  it("replaying a question or changing only its variable does not create distinct evidence", () => {
    const audits = [success("6x+9"), success("6x+9"), success("6y+9")];
    const a = assessSkillEvidence(audits, target);
    assert.deepEqual(a.directSuccessTurns, [1, 2, 3]);
    assert.equal(a.distinctDirectSuccessCount, 1);
    assert.equal(report(audits).skills?.find((s) => s.skillId === target)?.state, "OBSERVED");
  });

  it("missing response or verifier context cannot certify historical positive evidence", () => {
    const missing = success("6x+9");
    delete missing.response;
    const unverified = success("8x+12");
    unverified.verification!.status = "NOT_DETERMINISTIC";
    const a = assessSkillEvidence([missing, unverified], target);
    assert.deepEqual(a.unscopedSuccessTurns, [1, 2]);
    assert.equal(a.distinctDirectSuccessCount, 0);
  });

  it("does not count a contradictory positive and negative record on the same skill", () => {
    const audit = success("6x+9");
    audit.skillEvidence!.push({ skillId: target, kind: "MISTAKE", source: "ANALYSIS" });
    assert.equal(assessSkillEvidence([audit], target).distinctDirectSuccessCount, 0);
  });

  it("keeps retention unmeasured even after repeated direct successes", () => {
    const a = assessSkillEvidence([success("6x+9"), success("8x+12")], target);
    assert.equal(a.distinctDirectSuccessCount, 2);
    assert.equal(a.retention, "NOT_MEASURED");
  });

  it("cannot synthesize an untested sign prerequisite from errors on different skills", () => {
    const negative = (skillId: string, mistake: string) => ({ skillEvidence: [{ skillId, kind: "MISTAKE", source: "INSTANT", mistake }] }) as LotusQuestionAudit;
    const audits = [
      negative("FAC_GCF_NEGATIVE", "FLIPPED_ONE_SIGN"), negative("FAC_GCF_NEGATIVE", "FLIPPED_ONE_SIGN"),
      negative("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR"), negative("FAC_PAIR_PRODUCT_SUM", "SIGN_PAIR_ERROR"),
    ];
    const ledger = foldLedger(audits);
    const start = teachingStart(ledger);
    assert.ok(start);
    assert.notEqual(start.skillId, "FND_SIGN_MUL_DIV");
    assert.equal(start.rootOf, undefined);
    assert.equal(ledger.has("FND_SIGN_MUL_DIV"), false);
    const r = buildFactorisationReport({ ledger, state, audits, pendingAnalyses: 0 });
    assert.ok(!r.evidenceSummary.some((s) => /One cause/.test(s)));
  });
});
