/**
 * Root-cause inputs to the selector: the prerequisite graph, the misconception
 * code, and what teaching has already happened.
 *
 * All three existed in the system and none reached the model. A live 15-case
 * run showed the consequence: after repeated failures on LIN_DISTRIBUTE_NEG the
 * selector kept serving variations of the same composite skill and never once
 * probed FND_SIGN_MUL_DIV — the far smaller question of what (-2) x (-5) is —
 * because it could not see that a prerequisite existed. It also could not tell
 * a student who had never been taught the rule from one who had been taught it
 * and still failed, so it could not avoid re-teaching the same thing.
 *
 * These assert on the *prompt* rather than on the model's answer: what the
 * model does with the information varies, but whether it is told at all is
 * deterministic and is what regressed before.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSelectorPrompts,
  formatSkillLine,
  type SelectorSkillLine,
} from "../../src/engines/diagnostic-v2/diagnostic-v2-ai-selector.service";
import { ASSISTANCE_RANK } from "../../src/engines/diagnostic-v2/diagnostic-v2.formulas";
import { findMicroSkill } from "../../src/engines/diagnostic-v2/micro-skills.catalog";

function line(over: Partial<SelectorSkillLine> = {}): SelectorSkillLine {
  return {
    microSkillId: "LIN_DISTRIBUTE_NEG",
    status: "LIKELY_GAP",
    independentSuccessCount: 0,
    independentFailureCount: 2,
    assistedSuccessCount: 0,
    observedContextStrengths: [],
    observedContextGaps: ["INDEPENDENT"],
    scope: "this session",
    prerequisites: [],
    ...over,
  };
}

describe("prerequisites reach the prompt", () => {
  it("renders each prerequisite with its own status", () => {
    const rendered = formatSkillLine(
      line({
        prerequisites: [
          { microSkillId: "FND_SIGN_MUL_DIV", status: "UNKNOWN" },
          { microSkillId: "LIN_DISTRIBUTE_POS", status: "RELIABLE" },
        ],
      }),
    );
    assert.match(rendered, /built on:/);
    assert.match(rendered, /FND_SIGN_MUL_DIV\(UNKNOWN\)/);
    assert.match(rendered, /LIN_DISTRIBUTE_POS\(RELIABLE\)/);
  });

  it("says nothing when a skill has no prerequisites", () => {
    assert.ok(!formatSkillLine(line({ prerequisites: [] })).includes("built on:"));
  });

  it("survives a caller that omits the list entirely", () => {
    // A throw here would mean no next question for the student at all.
    const bare = { ...line() } as Partial<SelectorSkillLine>;
    delete bare.prerequisites;
    assert.doesNotThrow(() => formatSkillLine(bare as SelectorSkillLine));
  });

  it("the graph it draws from is real, not empty", () => {
    // Guards against the prompt faithfully rendering an empty catalogue.
    const skill = findMicroSkill("LIN_DISTRIBUTE_NEG");
    assert.deepEqual(skill?.prerequisiteMicroSkillIds, ["FND_SIGN_MUL_DIV", "LIN_DISTRIBUTE_POS"]);
  });

  it("instructs the model to probe the prerequisite, not just restate it", () => {
    const { system } = buildSelectorPrompts({
      studentId: "s",
      sessionId: "x",
      ruleSelectedIndex: 0,
      ruleStageId: "NEG_DIST_MAIN",
      serveOrdinal: 1,
      candidates: [],
      skillLines: [line()],
      alreadyServed: [],
    } as never);
    assert.match(system, /built on:/);
    assert.match(system, /prerequisite/i);
    assert.match(system, /root cause/i);
  });
});

describe("what has already been taught reaches the prompt", () => {
  it("flags a skill that has already been explained", () => {
    const rendered = formatSkillLine(line({ highestAssistanceGiven: "RULE_PROMPT" }));
    assert.match(rendered, /ALREADY TAUGHT/);
    assert.match(rendered, /RULE_PROMPT/);
  });

  it("does not flag a skill that has only ever been attempted alone", () => {
    assert.ok(!formatSkillLine(line({ highestAssistanceGiven: "NONE" })).includes("ALREADY TAUGHT"));
    assert.ok(!formatSkillLine(line()).includes("ALREADY TAUGHT"));
  });

  it("distinguishes taught-and-failing from never-taught-and-failing", () => {
    // The two cases the selector could not tell apart before.
    const untaught = formatSkillLine(line());
    const taught = formatSkillLine(line({ highestAssistanceGiven: "RULE_PROMPT" }));
    assert.notEqual(untaught, taught);
  });

  it("tells the model not to simply repeat the same explanation", () => {
    const { system } = buildSelectorPrompts({
      studentId: "s",
      sessionId: "x",
      ruleSelectedIndex: 0,
      ruleStageId: "NEG_DIST_MAIN",
      serveOrdinal: 1,
      candidates: [],
      skillLines: [line({ highestAssistanceGiven: "RULE_PROMPT" })],
      alreadyServed: [],
    } as never);
    assert.match(system, /ALREADY TAUGHT/);
    assert.match(system, /repeat the same explanation/i);
  });

  it("ranks the ladder so 'more help than before' is comparable", () => {
    assert.ok(ASSISTANCE_RANK.indexOf("RULE_PROMPT") > ASSISTANCE_RANK.indexOf("REVIEW_OPPORTUNITY"));
    assert.ok(ASSISTANCE_RANK.indexOf("FULL_EXPLANATION") > ASSISTANCE_RANK.indexOf("RULE_PROMPT"));
    assert.equal(ASSISTANCE_RANK[0], "NONE");
  });
});

describe("the misconception code reaches the prompt, not only the sentence", () => {
  it("includes the stable code alongside the description", () => {
    const rendered = formatSkillLine(
      line({
        recentErrorCode: "NEGATIVE_SIGN_PRODUCT",
        recentErrorDescription: "(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10",
      }),
    );
    assert.match(rendered, /\[NEGATIVE_SIGN_PRODUCT\]/);
    assert.match(rendered, /signs gives 10/);
  });

  it("still renders the description when no code was recorded", () => {
    const rendered = formatSkillLine(line({ recentErrorDescription: "something went wrong" }));
    assert.match(rendered, /recent error: something went wrong/);
    assert.ok(!rendered.includes("[]"));
  });
});
