import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { paymentSignatureValid, webhookSignatureValid } from "../../src/sample/razorpay";
import { lockedCopy } from "../../src/lotus/lotus.service";
import { summarise } from "../../src/sample/sample.service";
import type { LotusSessionView } from "@cogna/shared";

describe("sample test payments and the locked report", () => {
  it("accepts only Razorpay's own signatures", () => {
    const secret = "test_secret";
    const good = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
    assert.equal(paymentSignatureValid(secret, "order_1", "pay_1", good), true);
    assert.equal(paymentSignatureValid(secret, "order_2", "pay_1", good), false, "a signature for another order");
    assert.equal(paymentSignatureValid(secret, "order_1", "pay_1", "nope"), false);
    const body = Buffer.from('{"event":"payment.captured"}');
    assert.equal(webhookSignatureValid("wh", body, createHmac("sha256", "wh").update(body).digest("hex")), true);
    assert.equal(webhookSignatureValid("wh", Buffer.from('{"event":"x"}'), createHmac("sha256", "wh").update(body).digest("hex")), false, "a changed body");
  });

  it("before payment the report and the analysis are held back; the free summary is counts only", () => {
    const audit = {
      question: { id: "q" }, verification: { status: "VERIFIED_CORRECT" }, skillEvidence: [{ skillId: "S", kind: "SECURE" }], questionSelection: { reason: "checks a sign gap" }, adaptiveDecision: { x: 1 },
      gpt: { hypotheses: ["h"], interpretation: "drops the sign" }, debate: { x: 1 },
      conclusion: { conclusion: "The student drops the second sign", mistakeDescription: "sign dropped", acceptedFromGpt: ["sign gap"], acceptedFromChallenger: [], rejectedClaims: [], uncertainty: ["u"], selectionReason: "r", firstWrongStep: 2, report: { outcome: "SOLID_GAP" } },
    };
    const view = {
      sessionId: "s", studentId: "st", status: "COMPLETE", audits: [audit, { ...audit, verification: { status: "VERIFIED_INCORRECT" } }], openingAudit: audit,
      finalReport: { skills: [{ skillId: "A", name: "Common factor", state: "SECURE" }, { skillId: "B", name: "Difference of squares", state: "CONFIRMED" }, { skillId: "C", name: "x", state: "UNTESTED" }] },
      liveProgress: { gpt: {} },
    } as unknown as LotusSessionView;
    const locked = lockedCopy(view);
    assert.equal(locked.finalReport, null);
    assert.equal(locked.liveProgress, null);
    assert.equal(locked.audits[0]!.skillEvidence, undefined);
    assert.equal(locked.audits[0]!.adaptiveDecision, undefined);
    assert.equal(locked.audits[0]!.questionSelection.reason, "");
    assert.equal(locked.audits.length, 2, "the questions and answers stay");
    assert.equal(locked.audits[0]!.gpt, undefined);
    assert.equal(locked.audits[0]!.debate, undefined);
    assert.ok(!JSON.stringify(locked).match(/sign gap|drops|sign dropped|SOLID_GAP/), "nothing of the diagnosis is left anywhere in the locked view");
    assert.equal(locked.audits[0]!.verification.status, "VERIFIED_CORRECT", "right or wrong stays");
    assert.deepEqual(summarise(view), { readable: true, answered: 2, correct: 1, skillsChecked: 2, secure: 1, needWork: 1 });
    assert.ok(!JSON.stringify(summarise(view)).includes("squares"), "no skill names in the free summary");
  });
});
