import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FACTORISATION_SKILLS, FACTORISATION_SLOTS } from "../../src/lotus/lotus-factorisation-catalogue";
import {
  COVERAGE_BASELINE, MISTAKE_OWNER_OVERRIDES, PROPOSED_MERGES, PROPOSED_SKILLS, SHARED_PATTERNS, SKILL_CARDS, SKILL_LINKS, SKILL_MAP_VERSION,
  checkSkillMap, mistakeOwner, ownedMistakes, skillCard, skillMapCoverage, skillMapFingerprint,
} from "../../src/lotus/lotus-skill-map";

describe("Core Skill Map: the map checks itself", () => {
  it("passes every automatic check", () => {
    assert.deepEqual(checkSkillMap(), []);
  });

  it("has a version number and a stable fingerprint", () => {
    assert.match(SKILL_MAP_VERSION, /^factorisation-\d+\.\d+\.\d+$/);
    assert.equal(skillMapFingerprint(), skillMapFingerprint());
    assert.match(skillMapFingerprint(), /^[0-9a-f]{12}$/);
  });

  it("gives every skill a card, and no card without a skill", () => {
    assert.equal(SKILL_CARDS.length, FACTORISATION_SKILLS.length);
    for (const s of FACTORISATION_SKILLS) assert.ok(skillCard(s.id), `${s.id} has a card`);
  });
});

describe("Core Skill Map: one owner for every mistake", () => {
  it("names exactly one owner for each mistake, and the owner lists it", () => {
    const codes = new Set(FACTORISATION_SKILLS.flatMap((s) => s.mistakes));
    for (const code of codes) {
      const owner = mistakeOwner(code);
      assert.ok(owner, `${code} has an owner`);
      assert.ok(FACTORISATION_SKILLS.find((s) => s.id === owner)!.mistakes.includes(code), `${code}'s owner lists it`);
    }
  });

  it("splits the mistakes with no overlap: each is owned by exactly one skill", () => {
    const codes = [...new Set(FACTORISATION_SKILLS.flatMap((s) => s.mistakes))];
    const owned = FACTORISATION_SKILLS.flatMap((s) => ownedMistakes(s.id));
    assert.equal(owned.length, codes.length);
    assert.equal(new Set(owned).size, codes.length);
  });

  it("settles the nine mistakes that sat under more than one skill", () => {
    assert.equal(Object.keys(MISTAKE_OWNER_OVERRIDES).length, 9);
    assert.equal(skillMapCoverage().mistakesListedUnderSeveralSkills.length, 9);
    assert.equal(mistakeOwner("SIGN_PAIR_ERROR"), "FAC_PAIR_PRODUCT_SUM");
    assert.equal(mistakeOwner("COMMON_NOT_HIGHEST"), "FND_GCD_NUMERIC");
  });
});

describe("Core Skill Map: five kinds of link", () => {
  const kinds = (k: string) => SKILL_LINKS.filter((l) => l.kind === k);

  it("keeps every fixed prerequisite as a NEEDS link, except the ones that depend on the question", () => {
    const needs = new Set(kinds("NEEDS").map((l) => `${l.from}>${l.to}`));
    const conditional = new Set(kinds("THIS_QUESTION_ONLY").map((l) => `${l.from}>${l.to}`));
    for (const s of FACTORISATION_SKILLS) for (const d of s.dependsOn) {
      assert.ok(needs.has(`${s.id}>${d}`) || conditional.has(`${s.id}>${d}`), `${s.id} needs ${d}`);
    }
  });

  it("says when a question-only need applies: dividing every term needs powers only for letters with powers", () => {
    const link = kinds("THIS_QUESTION_ONLY").find((l) => l.from === "FAC_DIVIDE_TERMS" && l.to === "FND_EXPONENT_PRODUCT");
    assert.ok(link);
    assert.match(link!.when!, /6x \+ 9/);
  });

  it("gives trinomials two routes", () => {
    const routes = kinds("EITHER_OR").filter((l) => l.group === "trinomial-route");
    assert.deepEqual(routes.map((l) => l.to).sort(), ["FAC_GROUP_TERMS", "FAC_PAIR_PRODUCT_SUM"]);
  });

  it("connects signed numbers in factorisation with the other chapters", () => {
    const across = kinds("ACROSS_CHAPTERS").filter((l) => l.from === "FND_SIGN_MUL_DIV").map((l) => l.to).sort();
    assert.deepEqual(across, ["LE_SIGNED_ARITH", "RN_SIGNED_INT"]);
  });

  it("lets expanding check the factorising skills", () => {
    assert.ok(kinds("CHECKS").some((l) => l.from === "FAC_VERIFY_EXPAND" && l.to === "FAC_MONIC_TRINOMIAL"));
  });
});

describe("Core Skill Map: shared mistake patterns", () => {
  it("names four patterns, each across several skills", () => {
    assert.deepEqual(SHARED_PATTERNS.map((p) => p.id), ["SIGN_HANDLING", "TERMS_AS_FACTORS", "EVERYTHING_DISTRIBUTES", "ROOT_OF_COEFFICIENT"]);
    for (const p of SHARED_PATTERNS) assert.ok(p.skills.length >= 3 && p.directCheck);
  });
});

describe("Core Skill Map: proposed changes stay proposals", () => {
  it("proposes seven new skills and two merges, none live yet", () => {
    assert.equal(PROPOSED_SKILLS.length, 7);
    assert.equal(PROPOSED_MERGES.length, 2);
    const live = new Set(FACTORISATION_SKILLS.map((s) => s.id));
    for (const p of PROPOSED_SKILLS) assert.ok(!live.has(p.id), `${p.id} is not live`);
    assert.equal(FACTORISATION_SKILLS.length - PROPOSED_MERGES.length + PROPOSED_SKILLS.length, 36);
  });

  it("marks the skill we added beyond the book", () => {
    assert.equal(PROPOSED_SKILLS.find((s) => s.id === "FND_EXPONENT_QUOTIENT")!.source, "COGNA");
  });
});

describe("Core Skill Map: coverage today", () => {
  it("measures how much of the map the questions can reach", () => {
    const cov = skillMapCoverage();
    assert.equal(cov.skills, 31);
    assert.equal(cov.skillsWithoutOwnQuestion.length, 14);
    assert.equal(cov.mistakes, 61);
    assert.equal(cov.mistakesNoQuestionTargets.length, 27);
    assert.equal(FACTORISATION_SLOTS.length, 25);
  });

  it("can improve but never slip below the baseline", () => {
    const cov = skillMapCoverage();
    assert.ok(cov.skillsWithoutOwnQuestion.length <= COVERAGE_BASELINE.skillsWithoutOwnQuestion);
    assert.ok(cov.mistakesNoQuestionTargets.length <= COVERAGE_BASELINE.mistakesNoQuestionTargets);
  });
});
