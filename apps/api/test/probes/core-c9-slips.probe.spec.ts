/**
 * Core problem C9 (Cogna Project Hub): the AI recognises slips, guesses and
 * typing problems, but the code records them as mistakes on a skill, so two
 * slips confirm a gap the child doesn't have.
 *
 * Seen in step 2 (Oct 23): the AI described three copying slips, a guess and
 * an unclosed bracket correctly, yet all five became MISTAKE evidence.
 * Run with: cd apps/api && node --import tsx --test test/probes/*.probe.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LotusQuestion, LotusQuestionAudit } from "@cogna/shared";
import { evidenceFromAnalysis, foldLedger } from "../../src/lotus/lotus-factorisation";

const trinomial = {
  answerKey: {
    workedSolution: ["Find two numbers: product 20, sum -9: -4 and -5", "(x - 4)(x - 5)"],
    diagnostics: { itemKind: "FACTORISE", skillId: "FAC_MONIC_TRINOMIAL", taggedSkills: [], stepSkills: ["FAC_PAIR_PRODUCT_SUM", "FAC_MONIC_TRINOMIAL"], predictedMistakes: [], origin: "AI" },
  },
} as unknown as LotusQuestion;

/** What the gap rules receive from one AI review: step 2 went wrong, of the given kind. */
const reviewed = (kind: string, description: string) =>
  ({ skillEvidence: (evidenceFromAnalysis as (...args: unknown[]) => unknown)(trinomial, [], 2, description, kind) }) as unknown as LotusQuestionAudit;

describe("C9: only a real misunderstanding counts toward a gap", () => {
  it("two copying slips on the same skill don't confirm a gap", () => {
    const ledger = foldLedger([
      reviewed("SLIP", "After correctly choosing -4 and -5, the student wrote x + 5 instead of x - 5."),
      reviewed("SLIP", "After correctly finding 6 and 7, the student wrote 8 instead of 7."),
    ]);
    const state = ledger.get("FAC_MONIC_TRINOMIAL")?.state ?? "UNTESTED";
    assert.notEqual(state, "CONFIRMED", "two slips the AI itself called slips were turned into a confirmed gap");
    assert.notEqual(state, "SUSPECTED", "a slip the AI called a slip still opened a possible gap");
  });

  it("a guess or an unreadable answer gives no gap evidence", () => {
    for (const kind of ["GUESS", "UNREADABLE"]) {
      const evidence = (evidenceFromAnalysis as (...args: unknown[]) => unknown[])(trinomial, [], 1, "no method shown", kind);
      assert.equal(evidence.length, 0, `${kind}: recorded as ${JSON.stringify(evidence)}`);
    }
  });

  it("two real misunderstandings still confirm the gap", () => {
    const ledger = foldLedger([
      reviewed("MISUNDERSTANDING", "Kept the original signs inside the bracket."),
      reviewed("MISUNDERSTANDING", "Kept the original signs inside the bracket again."),
    ]);
    assert.equal(ledger.get("FAC_MONIC_TRINOMIAL")?.state, "CONFIRMED");
  });
});
