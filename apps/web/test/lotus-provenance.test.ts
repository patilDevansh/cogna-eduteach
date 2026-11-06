import { it } from "node:test";
import assert from "node:assert/strict";
import { provenanceLabelForQuestion } from "../src/lib/lotus-provenance";

const q = (extra: Record<string, unknown> = {}) => ({ prompt: "Factorise completely: 3x^2y + 9x", answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "", workedSolution: [] }, ...extra }) as never;
const session = (topic: string) => ({ topic, openingAudit: undefined, audits: [] }) as never;

it("uses the provenance the server sent, not a prompt match", () => {
  assert.equal(provenanceLabelForQuestion(q({ provenance: "AI_REUSED_FROM_BANK" }), session("FACTORISATION")), "Question reused from the AI question bank");
  assert.equal(provenanceLabelForQuestion(q({ provenance: "AI_GENERATED_FOR_SESSION" }), session("FACTORISATION")), "New question made for this session");
  assert.equal(provenanceLabelForQuestion(q({ provenance: "CODE_BUILT_GAME" }), session("FACTORISATION")), "Question built by code");
});

it("never says hardcoded for a planned topic, but still does for the brackets test", () => {
  assert.doesNotMatch(provenanceLabelForQuestion(q(), session("FACTORISATION")), /hardcoded/);
  assert.doesNotMatch(provenanceLabelForQuestion(q({ provenance: "HARDCODED_SYSTEM" }), session("FACTORISATION")), /hardcoded/);
  assert.match(provenanceLabelForQuestion(q({ provenance: "HARDCODED_SYSTEM" }), session("BRACKETS")), /hardcoded/);
  assert.match(provenanceLabelForQuestion(q(), session("BRACKETS")), /hardcoded/);
});
