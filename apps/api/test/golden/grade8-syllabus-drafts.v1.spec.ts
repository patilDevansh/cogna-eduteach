import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { topicsForGrade } from "../../src/classrooms/topic-catalogue";
import { checkProves, classifyExpansion } from "../../src/lotus/lotus-algebra";
import { GRADE_8_DRAFTS } from "../../src/lotus/syllabus";

describe("Class 8 syllabus drafts", () => {
  it("covers every chapter in the topic plan except factorisation", () => {
    const planned = topicsForGrade(8).filter((t) => t.id !== "factorisation").map((t) => `${t.chapter}:${t.id}`);
    assert.deepEqual(GRADE_8_DRAFTS.map((c) => `${c.chapter}:${c.topicId}`), planned);
  });

  for (const chapter of GRADE_8_DRAFTS) {
    describe(chapter.topicId, () => {
      const skills = new Map(chapter.skills.map((s) => [s.id, s]));

      it("has a skill map that only builds on earlier skills, with every mistake explained", () => {
        assert.equal(skills.size, chapter.skills.length, "skill ids are unique");
        chapter.skills.forEach((skill, i) => {
          for (const dep of skill.dependsOn) assert.ok(chapter.skills.slice(0, i).some((s) => s.id === dep), `${skill.id} depends on later or unknown ${dep}`);
          for (const m of skill.mistakes) assert.ok(chapter.mistakes[m], `${m} has no description`);
        });
      });

      it("has 25 slots (13 explore, 6 diagnose, 6 confirm) whose mistakes belong to their skills", () => {
        assert.equal(chapter.slots.length, 25);
        const phases = chapter.slots.map((s) => s.phase);
        assert.deepEqual([phases.filter((p) => p === "EXPLORE").length, phases.filter((p) => p === "DIAGNOSE").length, phases.filter((p) => p === "CONFIRM").length], [13, 6, 6]);
        for (const slot of chapter.slots) {
          const owners = [slot.skillId, ...slot.tagged].map((id) => skills.get(id));
          assert.ok(owners.every(Boolean), `slot ${slot.slot}: unknown skill`);
          for (const m of slot.mistakes) assert.ok(owners.some((s) => s!.mistakes.includes(m)), `slot ${slot.slot}: ${m} isn't caught by its skills`);
          assert.ok(slot.mistakes.length, `slot ${slot.slot}: no mistakes`);
        }
        assert.equal(new Set(chapter.slots.map((s) => s.prompt)).size, 25, "prompts are unique");
      });

      it("has right answers: four distinct options per choice, and every check agrees with its answer", () => {
        for (const slot of chapter.slots) {
          if (slot.kind === "CHOICE") {
            assert.equal(new Set(slot.options).size, 4, `slot ${slot.slot}: needs four distinct options`);
            continue;
          }
          assert.ok(!slot.options, `slot ${slot.slot}: only choices have options`);
          if (!slot.check) continue;
          const ok = slot.kind === "EXPRESSION" ? classifyExpansion(slot.answer, slot.check) === "CORRECT" : checkProves(slot.check, slot.answer);
          assert.ok(ok, `slot ${slot.slot}: ${slot.check} doesn't give ${slot.answer}`);
        }
      });
    });
  }
});
