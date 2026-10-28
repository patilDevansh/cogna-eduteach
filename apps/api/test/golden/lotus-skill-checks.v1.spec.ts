import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FACTORISATION_SKILLS, FACTORISATION_SLOTS } from "../../src/lotus/lotus-factorisation-catalogue";
import { normalizeMathText } from "../../src/lotus/lotus-algebra";
import { codeProbeFor } from "../../src/lotus/lotus-probes";
import { checkWrittenItem, type WriteRequest } from "../../src/lotus/lotus-question-factory";
import { CHECK_SLOT_BASE, SKILL_FAMILIES, buildSkillCheck, checkSpecFor, skillFamily, skillsWithFamily } from "../../src/lotus/lotus-skill-checks";

const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`);
const listed = (skillId: string) => new Set(FACTORISATION_SKILLS.find((s) => s.id === skillId)!.mistakes);
const minus = (text: string) => text.replace(/−/g, "-");

describe("Skill question families: coverage", () => {
  it("gives a family to every skill that has no question of its own in the live test", () => {
    const hasSlot = new Set(FACTORISATION_SLOTS.map((s) => s.skillId));
    const without = FACTORISATION_SKILLS.filter((s) => !hasSlot.has(s.id)).map((s) => s.id);
    assert.equal(without.length, 14);
    assert.deepEqual(without.filter((id) => !skillFamily(id)), []);
  });

  it("only builds families for real skills, each with at least two conditions", () => {
    const real = new Set(FACTORISATION_SKILLS.map((s) => s.id));
    for (const f of SKILL_FAMILIES) {
      assert.ok(real.has(f.skillId), `${f.skillId} is a skill`);
      assert.ok(f.conditions.length >= 2, `${f.skillId} has two or more conditions`);
    }
    assert.equal(skillsWithFamily().length, new Set(skillsWithFamily()).size);
  });
});

describe("Skill question families: every variant checks out", () => {
  for (const family of SKILL_FAMILIES) {
    for (const condition of family.conditions) {
      it(`${family.skillId} / ${condition}: 60 seeds, all valid, own skill, listed mistakes only`, () => {
        const prompts = new Set<string>();
        for (const seed of SEEDS) {
          const item = buildSkillCheck(family.skillId, seed, condition);
          assert.ok(item, `${seed} builds`);
          const d = item.answerKey.diagnostics!;
          assert.equal(d.skillId, family.skillId);
          assert.equal(d.origin, "CODE");
          assert.equal(item.condition, condition);
          assert.ok(!item.asksForWorking, "short check: no working asked");
          const key = item.answerKey.canonicalAnswer;
          const seen = new Set<string>([key]);
          for (const p of d.predictedMistakes) {
            assert.ok(listed(family.skillId).has(p.mistake), `${p.mistake} is listed under ${family.skillId}`);
            assert.ok(!seen.has(p.answer), `wrong answer ${p.answer} is new and not the key`);
            seen.add(p.answer);
          }
          assert.equal(d.stepSkills.length, item.answerKey.workedSolution.length);
          prompts.add(`${item.prompt}|${[...(item.options ?? [])].sort().join("|")}`);
        }
        assert.ok(prompts.size >= 4, `${prompts.size} different variants`);
      });
    }
  }

  it("builds the same question for the same seed and different ones for different seeds", () => {
    const a = buildSkillCheck("FND_SIGN_MUL_DIV", "kid-1", "multiply, same signs");
    const b = buildSkillCheck("FND_SIGN_MUL_DIV", "kid-1", "multiply, same signs");
    assert.deepEqual(a, b);
    const variants = new Set(SEEDS.map((s) => buildSkillCheck("FND_SIGN_MUL_DIV", s, "multiply, same signs")!.prompt));
    assert.ok(variants.size > 5);
  });

  it("returns nothing for a skill without a family or a condition it doesn't have", () => {
    assert.equal(buildSkillCheck("FAC_FACTOR_FULLY", "x"), null);
    assert.equal(buildSkillCheck("FND_SIGN_MUL_DIV", "x", "no such condition"), null);
  });
});

describe("Skill question families: in the live test", () => {
  const request = (skillId: string, extra: Partial<WriteRequest> = {}): WriteRequest => ({ spec: checkSpecFor(skillId)!, purpose: "BASE", avoid: [], variation: "kid-7", ...extra });

  it("makes a check spec for each skill the 25 slots have no question for, and none for the others", () => {
    const hasSlot = new Set(FACTORISATION_SLOTS.map((s) => s.skillId));
    for (const s of FACTORISATION_SKILLS) {
      const spec = checkSpecFor(s.id);
      if (hasSlot.has(s.id)) continue; // slot skills keep their own slot for the base plan; the check slot is also available
      assert.ok(spec, `${s.id} has a check spec`);
      assert.ok(spec!.slot >= CHECK_SLOT_BASE && spec!.slot < CHECK_SLOT_BASE + 100);
      assert.deepEqual(spec!.mistakes, []);
    }
    assert.equal(checkSpecFor("NOT_A_SKILL"), undefined);
    assert.ok(FACTORISATION_SLOTS.every((s) => s.slot < CHECK_SLOT_BASE), "the base plan never uses a check slot");
    assert.equal(new Set(SKILL_FAMILIES.map((f) => checkSpecFor(f.skillId)!.slot)).size, SKILL_FAMILIES.length, "check slots are unique");
  });

  it("the live writer path builds a checked question for a check slot, without the game switch", () => {
    for (const skillId of skillsWithFamily()) {
      const req = request(skillId);
      const item = codeProbeFor(req, {});
      assert.ok(item, `${skillId} builds`);
      assert.deepEqual(checkWrittenItem(req, item!), []);
      assert.equal(item!.answerKey.diagnostics!.slot, req.spec.slot);
      assert.equal(item!.answerKey.diagnostics!.skillId, skillId);
    }
  });

  it("a re-check of one mistake gets a question that can show that mistake", () => {
    const cases: Array<[string, string]> = [["FND_SIGN_MUL_DIV", "ADDED_INSTEAD"], ["FND_FACTOR_PAIRS", "NO_NEGATIVE_PAIRS"], ["FAC_READ_ABC_SIGNS", "DROPPED_SIGN"], ["FND_MIN_EXP_COMMON", "TOOK_HIGHEST_POWER"], ["EXP_EXPAND_BINOMIALS", "SWAPPED_PRODUCT_SUM"]];
    for (const [skillId, targetMistake] of cases) {
      for (const variation of ["a", "b", "c", "d", "e"]) {
        const item = codeProbeFor(request(skillId, { purpose: "CHECK", targetMistake, variation }), {});
        assert.ok(item, `${skillId} / ${targetMistake} builds`);
        assert.ok(item!.answerKey.diagnostics!.predictedMistakes.some((p) => p.mistake === targetMistake));
      }
    }
  });

  it("never repeats a question already in the test", () => {
    const first = codeProbeFor(request("FND_SIGN_ADD_SUB"), {})!;
    const second = codeProbeFor(request("FND_SIGN_ADD_SUB", { avoid: [first.prompt] }), {})!;
    assert.notEqual(second.prompt, first.prompt);
  });

  it("is a different question for different children", () => {
    const prompts = new Set(["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"].map((v) => codeProbeFor(request("FND_FACTOR_PAIRS", { variation: v }), {})!.prompt));
    assert.ok(prompts.size >= 4);
  });

  it("can be switched off, putting the test back to passing over foundations with no slot", () => {
    process.env.LOTUS_DISABLE_SKILL_CHECKS = "true";
    try { assert.equal(checkSpecFor("FND_SIGN_MUL_DIV"), undefined); } finally { delete process.env.LOTUS_DISABLE_SKILL_CHECKS; }
    assert.ok(checkSpecFor("FND_SIGN_MUL_DIV"));
  });
});

describe("Skill question families: answers re-derived independently", () => {
  it("counts factor pairs by brute force", () => {
    for (const seed of SEEDS) {
      const item = buildSkillCheck("FND_FACTOR_PAIRS", seed, "count the pairs")!;
      const n = Number(/multiply to (\d+)\?/.exec(item.prompt)![1]);
      let pairs = 0;
      for (let a = 1; a <= n; a++) if (n % a === 0 && a <= n / a) pairs += 2; // each positive pair has a negative twin
      assert.equal(item.answerKey.canonicalAnswer, String(pairs));
      assert.equal(new Set(item.options).size, 4);
      assert.ok(item.options!.includes(item.answerKey.canonicalAnswer));
    }
  });

  it("reads b and c with their signs from the expression shown", () => {
    for (const condition of ["negative b", "negative c", "negative b and c", "positive b and c"]) {
      for (const seed of SEEDS) {
        const item = buildSkillCheck("FAC_READ_ABC_SIGNS", seed, condition)!;
        const text = normalizeMathText(minus(/In (.+?), what/.exec(item.prompt)![1]!));
        const m = /^x\^2([+-]\d+)x([+-]\d+)$/.exec(text)!;
        assert.ok(m, `parses ${text}`);
        const show = (v: number) => (v < 0 ? `−${-v}` : `${v}`);
        assert.equal(item.answerKey.canonicalAnswer, `b = ${show(Number(m[1]))}, c = ${show(Number(m[2]))}`);
        if (condition.includes("negative b")) assert.ok(Number(m[1]) < 0);
        if (condition.endsWith("negative c") || condition === "negative b and c") assert.ok(Number(m[2]) < 0);
      }
    }
  });

  it("names the identity from the expression's own coefficients", () => {
    const readTerms = (text: string) => {
      const t = normalizeMathText(minus(text));
      const m = /^(\d*)x\^2(?:([+-]\d*)x)?([+-]\d+)$/.exec(t)!;
      return { A: Number(m[1] || 1), B: m[2] === undefined ? 0 : Number(m[2] === "+" ? 1 : m[2] === "-" ? -1 : m[2]), C: Number(m[3]) };
    };
    const isSq = (n: number) => Number.isInteger(Math.sqrt(n));
    for (const seed of SEEDS) {
      for (const condition of ["three terms, plus", "three terms, minus", "two terms", "not an identity"]) {
        const item = buildSkillCheck("ID_REVERSE_PATTERN", seed, condition)!;
        const { A, B, C } = readTerms(/does (.+?) match/.exec(item.prompt)![1]!);
        let expected: string;
        if (B === 0 && C < 0 && isSq(A) && isSq(-C)) expected = "a² − b²";
        else if (B !== 0 && isSq(A) && isSq(C) && B * B === 4 * A * C) expected = B > 0 ? "a² + 2ab + b²" : "a² − 2ab + b²";
        else expected = "none of these";
        assert.equal(item.answerKey.canonicalAnswer, expected);
      }
    }
  });

  it("takes the square root of the number and the letter", () => {
    for (const seed of SEEDS) {
      const item = buildSkillCheck("FND_RECOGNISE_SQUARE", seed, "square root of a number and letter")!;
      const sq = Number(/root of (\d+)a/.exec(item.prompt)![1]);
      assert.equal(item.answerKey.canonicalAnswer, `${Math.sqrt(sq)}a`);
      const spot = buildSkillCheck("FND_RECOGNISE_SQUARE", seed, "spot the perfect square")!;
      const n = Number(/^(\d+)a²$/.exec(spot.answerKey.canonicalAnswer)![1]);
      assert.ok(Number.isInteger(Math.sqrt(n)));
      for (const o of spot.options!.filter((o) => o !== spot.answerKey.canonicalAnswer)) {
        const m = /^(\d+)a(.)$/.exec(o)!;
        assert.ok(!(Number.isInteger(Math.sqrt(Number(m[1]))) && m[2] === "²"), `${o} is not a perfect square`);
      }
    }
  });

  it("finds the HCF and the highest common number", () => {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    for (const seed of SEEDS) {
      const h = buildSkillCheck("FND_GCD_NUMERIC", seed, "three numbers")!;
      const nums = /of ([\d, ]+)\./.exec(h.prompt)![1]!.split(",").map(Number);
      assert.equal(h.answerKey.canonicalAnswer, String(nums.reduce(gcd)));
      const g = buildSkillCheck("FAC_GCF_NUMERIC", seed, "three terms")!;
      const coeffs = normalizeMathText(minus(/of (.+)\?$/.exec(g.prompt)![1]!)).split(/[+-]/).map((t) => parseInt(t, 10));
      assert.equal(g.answerKey.canonicalAnswer, String(coeffs.reduce(gcd)));
    }
  });
});
