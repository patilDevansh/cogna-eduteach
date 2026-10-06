import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { assembleTileAnswer, formatAllowedAt, type LotusQuestion, type TileBuildInteraction } from "@cogna/shared";
import { buildTileInteraction, splitFactors, splitTerms } from "../../src/interaction-formats/tile-builder";
import { classifyFactorisation, algebraicallyEqual } from "../../src/lotus/lotus-algebra";
import { chooseLotusInteraction, resolveLotusResponse, TileAnswerError, withLotusInteraction } from "../../src/lotus/lotus-interactions";
import { generatePractice } from "../../src/personalized-videos/ai-authoring/practice-generator";
import { checkPracticeAnswer, practiceItemView } from "../../src/personalized-videos/ai-authoring/authoring-pipeline";
import { createPersonalizedVideoMemoryDb } from "../../src/personalized-videos/personalized-videos.memory";
import { exitInteraction, PersonalizedVideosService } from "../../src/personalized-videos/personalized-videos.service";
import { VideoRendererAdapter } from "../../src/personalized-videos/video-renderer.adapter";

process.env.COGNA_SESSION_SECRET = process.env.COGNA_SESSION_SECRET || "test-session-secret";

/** The picks a student who knows the answer would make. */
function rightPicks(interaction: TileBuildInteraction, pieces: string[]): Array<number | null> {
  const picks: Array<number | null> = pieces.map((p) => interaction.tiles.indexOf(p));
  while (picks.length < interaction.slots) picks.push(null);
  return picks;
}

function factoriseItem(overrides: Partial<LotusQuestion> = {}): LotusQuestion {
  return {
    id: "q-1",
    phase: "DIAGNOSE",
    subtopic: "Trinomials",
    prompt: "Factorise x^2 + 2x - 15.",
    type: "CONSTRUCTED_RESPONSE",
    asksForWorking: true,
    purpose: "",
    answerKey: {
      kind: "OPEN_RESPONSE",
      canonicalAnswer: "(x + 5)(x - 3)",
      workedSolution: ["x^2 + 2x - 15", "(x + 5)(x - 3)"],
      diagnostics: {
        itemKind: "FACTORISE",
        expression: "x^2 + 2x - 15",
        skillId: "FAC_MONIC_TRINOMIAL",
        taggedSkills: [],
        stepSkills: ["FAC_MONIC_TRINOMIAL", "FAC_MONIC_TRINOMIAL"],
        predictedMistakes: [{ answer: "(x - 5)(x + 3)", mistake: "SIGN_PAIR_ERROR" }],
        origin: "AI",
      },
    },
    ...overrides,
  };
}

describe("tile games: building tile sets", () => {
  it("splits products and sums the way the tiles need", () => {
    assert.deepEqual(splitFactors("2(x-3)(x+3)"), ["2", "(x - 3)", "(x + 3)"]);
    assert.deepEqual(splitFactors("3x(x + 2)"), ["3x", "(x + 2)"]);
    assert.equal(splitFactors("x^2 + 2x"), null, "a sum is not a product");
    assert.equal(splitFactors("-(x - 2)(x + 3)"), null, "a bare leading minus stays typed");
    assert.deepEqual(splitTerms("-6x + 12"), ["-6x", "+ 12"]);
  });

  it("makes a bracket bridge whose right tiles build a CORRECT answer and whose mistake tiles are there too", () => {
    const it1 = buildTileInteraction({ stage: "DIAGNOSTIC", task: "factorise", expression: "x^2 + 2x - 15", answer: "(x + 5)(x - 3)", mistakes: ["(x - 5)(x + 3)"], seed: "a" })!;
    assert.equal(it1.format, "BRACKET_BRIDGE");
    assert.equal(it1.slots, 2);
    for (const tile of ["x + 5", "x - 3", "x - 5", "x + 3"]) assert.ok(it1.tiles.includes(tile), `${tile} should be a tile`);
    const built = assembleTileAnswer(it1, rightPicks(it1, ["x + 5", "x - 3"]))!;
    assert.equal(classifyFactorisation(built, "x^2 + 2x - 15"), "CORRECT");
    const swapped = assembleTileAnswer(it1, rightPicks(it1, ["x - 5", "x + 3"]))!;
    assert.equal(classifyFactorisation(swapped, "x^2 + 2x - 15"), "INCORRECT");
  });

  it("lets a full-factorisation builder leave boxes empty, so the unfinished answer can be built (and marked UNFINISHED)", () => {
    const it2 = buildTileInteraction({ stage: "EXIT", task: "factorise", expression: "2x^2 - 18", answer: "2(x - 3)(x + 3)", mistakes: ["2(x^2 - 9)"], seed: "b" })!;
    assert.equal(it2.format, "FACTOR_BUILDER");
    assert.equal(it2.allowEmpty, true);
    const unfinished = assembleTileAnswer(it2, rightPicks(it2, ["2", "(x^2 - 9)"]))!;
    assert.equal(classifyFactorisation(unfinished, "2x^2 - 18"), "UNFINISHED");
    const full = assembleTileAnswer(it2, rightPicks(it2, ["2", "(x - 3)", "(x + 3)"]))!;
    assert.equal(classifyFactorisation(full, "2x^2 - 18"), "CORRECT");
  });

  it("builds expansions from signed terms", () => {
    const it3 = buildTileInteraction({ stage: "EXIT", task: "expand", expression: "-3(2x - 4)", answer: "-6x + 12", mistakes: ["-6x - 12"], seed: "c" })!;
    assert.equal(it3.format, "TERM_BUILDER");
    const built = assembleTileAnswer(it3, rightPicks(it3, ["+ 12", "-6x"]))!;
    assert.ok(algebraicallyEqual(built, "-3(2x - 4)"), `${built} should equal -3(2x - 4) in any order`);
  });

  it("keeps a question typed when tiles can't be made safely", () => {
    assert.equal(buildTileInteraction({ stage: "DIAGNOSTIC", task: "factorise", expression: "x^2 + 2x + 1", answer: "(x + 1)^2", seed: "d" }), null);
    assert.equal(buildTileInteraction({ stage: "DIAGNOSTIC", task: "factorise", expression: "x^2 + 2x - 15", answer: "(x + 5)(x + 3)", seed: "e" }), null, "a wrong key never becomes a tile game");
  });

  it("is stable per seed and never carries the answer key", () => {
    const req = { stage: "DIAGNOSTIC" as const, task: "factorise" as const, expression: "x^2 - 7x + 12", answer: "(x - 3)(x - 4)", mistakes: ["(x + 3)(x + 4)"], seed: "same" };
    assert.deepEqual(buildTileInteraction(req), buildTileInteraction(req));
    const json = JSON.stringify(buildTileInteraction(req));
    assert.doesNotMatch(json, /answer|canonical|mistake/i);
  });

  it("refuses incomplete or tampered picks", () => {
    const it1 = buildTileInteraction({ stage: "DIAGNOSTIC", task: "factorise", expression: "x^2 + 2x - 15", answer: "(x + 5)(x - 3)", seed: "a" })!;
    assert.equal(assembleTileAnswer(it1, [0]), null, "wrong number of boxes");
    assert.equal(assembleTileAnswer(it1, [0, null]), null, "a required box is empty");
    assert.equal(assembleTileAnswer(it1, [0, 0]), null, "a tile used twice");
    assert.equal(assembleTileAnswer(it1, [0, 99]), null, "an index out of range");
    assert.equal(assembleTileAnswer(it1, [0, 1.5]), null, "a non-integer index");
  });

  it("allows only constructed formats at the exit", () => {
    assert.equal(formatAllowedAt("BRACKET_BRIDGE", "EXIT"), true);
    assert.equal(formatAllowedAt("TERM_BUILDER", "PRACTICE"), true);
  });
});

describe("tile games in the Lotus diagnostic", () => {
  it("turns turn 1, repurposed turns and every third turn into tile games, and drops the working request", () => {
    assert.ok(chooseLotusInteraction(factoriseItem(), { turn: 1, repurposed: false }, {}));
    assert.ok(chooseLotusInteraction(factoriseItem(), { turn: 7, repurposed: true }, {}));
    assert.ok(chooseLotusInteraction(factoriseItem(), { turn: 6, repurposed: false }, {}));
    assert.equal(chooseLotusInteraction(factoriseItem(), { turn: 2, repurposed: false }, {}), undefined, "plain coverage turns stay typed with working");
    const q = withLotusInteraction(factoriseItem(), { turn: 1, repurposed: false }, {});
    assert.equal(q.asksForWorking, false);
    assert.equal(q.interaction?.format, "BRACKET_BRIDGE");
  });

  it("has one kill switch", () => {
    assert.equal(chooseLotusInteraction(factoriseItem(), { turn: 1, repurposed: false }, { COGNA_GAME_FORMATS: "off" }), undefined);
  });

  it("never turns a multiple-choice item into a tile game", () => {
    const choice = factoriseItem();
    choice.answerKey.diagnostics!.itemKind = "CHOICE";
    assert.equal(chooseLotusInteraction(choice, { turn: 1, repurposed: false }, {}), undefined);
  });

  it("marks the answer the picks build, not the text the browser sent", () => {
    const q = withLotusInteraction(factoriseItem(), { turn: 1, repurposed: false }, {});
    const picks = rightPicks(q.interaction!, ["x - 5", "x + 3"]);
    const resolved = resolveLotusResponse(q, {
      answer: "(x + 5)(x - 3)", // the browser claims the right answer…
      working: "",
      confidence: 80,
      responseTimeMs: 1000,
      didNotKnow: false,
      interaction: { format: "BRACKET_BRIDGE", picks, changes: 2 },
    });
    assert.equal(resolved.answer, "(x - 5)(x + 3)", "…but the server rebuilds the swapped-sign answer from the picks");
    assert.equal(resolved.interaction?.changes, 2);
  });

  it("rejects incomplete picks and tile answers to typed questions, and still accepts typing", () => {
    const q = withLotusInteraction(factoriseItem(), { turn: 1, repurposed: false }, {});
    const base = { answer: "x", working: "", confidence: 60, responseTimeMs: 1, didNotKnow: false };
    assert.throws(() => resolveLotusResponse(q, { ...base, interaction: { format: "BRACKET_BRIDGE", picks: [0, null] } }), TileAnswerError);
    assert.throws(() => resolveLotusResponse(factoriseItem(), { ...base, interaction: { format: "BRACKET_BRIDGE", picks: [0, 1] } }), TileAnswerError);
    assert.equal(resolveLotusResponse(q, { ...base, answer: "(x + 5)(x - 3)" }).answer, "(x + 5)(x - 3)");
    assert.equal(resolveLotusResponse(q, { ...base, didNotKnow: true, interaction: { format: "BRACKET_BRIDGE", picks: [0, null] } }).interaction, undefined);
  });
});

describe("tile games in practice", () => {
  for (const skill of ["FAC_MONIC_TRINOMIAL", "FAC_FACTOR_FULLY", "EXP_EXPAND_SINGLE"]) {
    it(`adds code-built game items for ${skill}, checked by the server`, () => {
      const set = generatePractice(skill, `seed:${skill}`);
      const build = set.items.find((i) => i.format === "build");
      assert.ok(build && build.format === "build", "a build item");
      const view = practiceItemView(build);
      assert.equal("answer" in view, false, "the browser never gets the answer");
      const pieces = build.task === "expand" ? splitTerms(build.answer)! : build.interaction.format === "BRACKET_BRIDGE" ? splitFactors(build.answer)!.map((f) => f.slice(1, -1)) : splitFactors(build.answer)!;
      const right = checkPracticeAnswer(build, { picks: rightPicks(build.interaction, pieces) }, 1);
      assert.equal(right.verdict, "CORRECT");
      assert.equal(checkPracticeAnswer(build, { picks: [] }, 1).verdict, "UNREADABLE");
    });
  }

  it("opens the factor safe only with the right pair, and names the swapped-sign mistake", () => {
    const set = generatePractice("FAC_MONIC_TRINOMIAL", "safe");
    const safe = set.items.find((i) => i.format === "factor-safe");
    assert.ok(safe && safe.format === "factor-safe");
    const [p, q] = safe.answer;
    assert.equal(checkPracticeAnswer(safe, { pair: [q, p] }, 1).verdict, "CORRECT", "either order");
    const swapped = checkPracticeAnswer(safe, { pair: [-p, -q] }, 1);
    assert.equal(swapped.verdict, "INCORRECT");
    assert.match(swapped.feedback, /Flip both signs/);
  });
});

describe("tile games at the independent exit", () => {
  const actor = { role: "student" as const, studentId: "stu_tile_exit" };

  async function exitReady() {
    const db = createPersonalizedVideoMemoryDb();
    const videos = new PersonalizedVideosService(db as never, new VideoRendererAdapter({}), undefined);
    const created = await videos.createAssignment({ studentId: actor.studentId, studentKey: "aarav" }, { actor, allowDemoSeeds: true, allowTestHooks: true });
    const row = await db.personalizedVideoAssignment.findUnique({ where: { id: created.id } });
    const script = row!.script as Record<string, unknown>;
    await db.personalizedVideoAssignment.update({
      where: { id: created.id },
      data: { status: "READY", script: { ...script, exit: { prompt: "Expand -3(a - 4).", expected: "-3a + 12", evidencePurpose: "test" }, exitCheck: { task: "expand", expression: "-3(a - 4)" } } },
    });
    return { videos, id: created.id };
  }

  it("hides the expected answer until the one attempt, and offers tiles", async () => {
    const { videos, id } = await exitReady();
    const before = await videos.getAssignment(id, actor);
    assert.equal(before.exit?.expected, "", "no answer in the browser before the attempt");
    assert.equal(before.exit?.interaction?.format, "TERM_BUILDER");
    assert.deepEqual(before.exit?.interaction, exitInteraction({ exit: { prompt: "", expected: "-3a + 12", evidencePurpose: "" }, exitCheck: { task: "expand", expression: "-3(a - 4)" } } as never, id));
  });

  it("marks the answer rebuilt from the picks, allows one attempt only, then shows the answer", async () => {
    const { videos, id } = await exitReady();
    const view = await videos.getAssignment(id, actor);
    const interaction = view.exit!.interaction!;
    const picks = rightPicks(interaction, ["-3a", "+ 12"]);
    const done = await videos.recordExit(id, { answer: "nonsense", interaction: { format: interaction.format, picks } }, actor);
    assert.equal(done.exitAttempt?.correct, true);
    assert.equal(done.exitAttempt?.answer, "-3a + 12");
    assert.equal(done.exit?.expected, "-3a + 12", "revealed after the attempt");
    await assert.rejects(() => videos.recordExit(id, { answer: "-3a + 12", working: "again" }, actor), ConflictException);
  });

  it("rejects incomplete picks without using up the attempt", async () => {
    const { videos, id } = await exitReady();
    await assert.rejects(() => videos.recordExit(id, { answer: "x", interaction: { format: "TERM_BUILDER", picks: [0, null] } }, actor), BadRequestException);
    const view = await videos.getAssignment(id, actor);
    assert.equal(view.exitAttempt, null);
  });
});

describe("game questions in the Lotus diagnostic (code-built probes)", async () => {
  const { codeProbeFor } = await import("../../src/lotus/lotus-probes");
  const { checkWrittenItem } = await import("../../src/lotus/lotus-question-factory");
  const { FACTORISATION_SLOTS } = await import("../../src/lotus/lotus-factorisation-catalogue");
  const { instantVerdict } = await import("../../src/lotus/lotus-factorisation");
  const { spokenMath } = await import("../../src/ai/spoken-math");
  const slot = (n: number) => FACTORISATION_SLOTS.find((s) => s.slot === n)!;
  const respond = (answer: string) => ({ answer, working: "", confidence: 60, responseTimeMs: 1, didNotKnow: false });
  const cases = [
    { name: "fireflies", slot: 12, purpose: "BASE" as const, presentation: "FIREFLY" },
    { name: "spot the impostor", slot: 18, purpose: "BASE" as const, presentation: "IMPOSTOR" },
    { name: "detective", slot: 5, purpose: "CHECK" as const, targetMistake: "KEPT_ORIGINAL_SIGNS", presentation: "DETECTIVE" },
    { name: "fishing (what factorised means)", slot: 6, purpose: "BASE" as const, presentation: "FISHING" },
    { name: "fishing (factorise fully)", slot: 20, purpose: "CHECK" as const, targetMistake: "INCOMPLETE_FACTORISATION", presentation: "FISHING" },
    { name: "garden fences", slot: 13, purpose: "BASE" as const, presentation: "GARDEN" },
  ];
  for (const c of cases) {
    it(`${c.name}: passes the writer's own checks, marks right as SECURE and a predicted wrong pick as its mistake`, () => {
      const req = { spec: slot(c.slot), purpose: c.purpose, targetMistake: c.targetMistake, variation: `test-${c.slot}`, avoid: [] };
      const item = codeProbeFor(req, {})!;
      assert.ok(item, "a probe is built");
      assert.equal(item.presentation, c.presentation);
      assert.equal(item.answerKey.diagnostics?.origin, "CODE");
      assert.deepEqual(checkWrittenItem(req, item), []);
      const q = { ...item, id: "probe" };
      const right = instantVerdict(q, respond(item.answerKey.canonicalAnswer));
      assert.equal(right.verification.status, "VERIFIED_CORRECT");
      assert.ok(right.evidence.every((e) => e.kind === "SECURE"));
      const predicted = item.answerKey.diagnostics!.predictedMistakes[0]!;
      const wrong = instantVerdict(q, respond(predicted.answer));
      assert.notEqual(wrong.verification.status, "VERIFIED_CORRECT");
      assert.ok(wrong.evidence.some((e) => e.mistake === predicted.mistake), `logs ${predicted.mistake}`);
      if (c.targetMistake) assert.ok(item.answerKey.diagnostics!.predictedMistakes.some((m) => m.mistake === c.targetMistake), "a CHECK catches the suspected mistake again");
    });
  }

  it("fishing accepts the netted fish in any order, and leaving one out is not correct", () => {
    const item = codeProbeFor({ spec: slot(6), purpose: "BASE", variation: "order", avoid: [] }, {})!;
    const q = { ...item, id: "fish" };
    const keyParts = item.answerKey.canonicalAnswer.split(" | ");
    assert.equal(instantVerdict(q, respond([...keyParts].reverse().join(" | "))).verification.status, "VERIFIED_CORRECT");
    const missing = instantVerdict(q, respond(keyParts.slice(1).join(" | ")));
    assert.equal(missing.verification.status, "VERIFIED_INCORRECT");
    assert.equal(missing.needsAnalysis, true, "leaving one out has no named mistake: the review decides");
  });

  it("leaves the medium and hard trinomials and every opener to the AI writer, and has the kill switch", () => {
    assert.equal(codeProbeFor({ spec: slot(14), purpose: "BASE", variation: "v", avoid: [] }, {}), null);
    assert.equal(codeProbeFor({ spec: slot(12), purpose: "BASE", variation: "v", avoid: [], requiredExpression: "x^2 + 5x + 6" }, {}), null);
    assert.equal(codeProbeFor({ spec: slot(12), purpose: "BASE", variation: "v", avoid: [] }, { COGNA_GAME_FORMATS: "off" }), null);
  });

  it("never puts the answer in what the student is sent", () => {
    for (const c of cases) {
      const item = codeProbeFor({ spec: slot(c.slot), purpose: c.purpose, targetMistake: c.targetMistake, variation: "leak", avoid: [] }, {})!;
      const shown = JSON.stringify({ prompt: item.prompt, options: item.options, lines: item.lines, interaction: item.interaction });
      if (c.presentation !== "FISHING" && c.presentation !== "GARDEN") assert.ok(item.options?.includes(item.answerKey.canonicalAnswer), "the key is one of the options, like any choice");
      assert.doesNotMatch(shown, /canonical|predicted|mistake/i);
    }
  });

  it("reads maths the way a voice should say it", () => {
    assert.equal(spokenMath("Factorise x² − 7x + 12."), "Factorise x squared minus 7 x plus 12.");
    assert.equal(spokenMath("(x − 3)(x + 4)"), "x minus 3, times x plus 4");
  });
});

describe("the lantern gate: a two-question independent exit", () => {
  const actor = { role: "student" as const, studentId: "stu_lantern" };

  async function gateReady() {
    const db = createPersonalizedVideoMemoryDb();
    const videos = new PersonalizedVideosService(db as never, new VideoRendererAdapter({}), undefined);
    const created = await videos.createAssignment({ studentId: actor.studentId, studentKey: "aarav" }, { actor, allowDemoSeeds: true, allowTestHooks: true });
    const row = await db.personalizedVideoAssignment.findUnique({ where: { id: created.id } });
    await db.personalizedVideoAssignment.update({
      where: { id: created.id },
      data: {
        status: "READY",
        script: {
          ...(row!.script as Record<string, unknown>),
          exit: { prompt: "Expand -3(a - 4).", expected: "-3a + 12", evidencePurpose: "test" },
          exitCheck: { task: "expand", expression: "-3(a - 4)" },
          transfer: { prompt: "Expand 5(-x + 2).", expression: "5(-x + 2)", task: "expand", answer: "-5x + 10" },
        },
      },
    });
    return { videos, id: created.id };
  }

  it("offers both questions as tile games, and keeps both results closed until both are sealed", async () => {
    const { videos, id } = await gateReady();
    const view = await videos.getAssignment(id, actor);
    assert.ok(view.exit?.interaction && view.exit.transfer?.interaction, "both questions are tile games");
    const first = await videos.recordExit(id, { answer: "x", interaction: { format: view.exit!.interaction!.format, picks: rightPicks(view.exit!.interaction!, ["-3a", "+ 12"]) } }, actor);
    assert.equal(first.exitAttempt?.correct, undefined, "no result after the first lantern");
    assert.equal(first.exit?.expected, "", "no answer either");
    const t = first.exit!.transfer!.interaction!;
    const both = await videos.recordExit(id, { item: 1, answer: "x", interaction: { format: t.format, picks: rightPicks(t, ["5x", "+ 10"]) } }, actor);
    assert.equal(both.exitAttempt?.correct, true);
    assert.equal(both.exitTransferAttempt?.correct, false, "5x + 10 is not 5(−x + 2): the sign slip shows up on the transfer question");
    assert.equal(both.exit?.expected, "-3a + 12");
  });

  it("allows one attempt per question and refuses a question that doesn't exist", async () => {
    const { videos, id } = await gateReady();
    await videos.recordExit(id, { item: 1, answer: "-5x + 10", working: "5 × −x" }, actor);
    await assert.rejects(() => videos.recordExit(id, { item: 1, answer: "-5x + 10", working: "again" }, actor), ConflictException);
    await assert.rejects(() => videos.recordExit(id, { item: 2, answer: "x", working: "w" }, actor), BadRequestException);
  });

  it("generates a transfer question of a different form for every practice family", () => {
    for (const skill of ["FAC_MONIC_TRINOMIAL", "FAC_FACTOR_FULLY", "EXP_EXPAND_SINGLE"]) {
      for (const seed of ["a", "b", "c"]) {
        const set = generatePractice(skill, seed);
        assert.notEqual(set.transfer.expression, set.exit.expression);
        assert.equal(taskVerdictOf(set.transfer.task, set.transfer.answer, set.transfer.expression), "CORRECT", `${set.transfer.answer} is right for ${set.transfer.expression}`);
      }
    }
  });
});

import { taskVerdict as taskVerdictOf } from "../../src/personalized-videos/ai-authoring/lesson-verifier";

describe("practice games: rectangle, marker's desk, bracket rush", () => {
  it("make it a rectangle: fits only when the corner holds every small square", () => {
    const set = generatePractice("FAC_MONIC_TRINOMIAL", "rect");
    const rect = set.items.find((i) => i.format === "rectangle");
    assert.ok(rect && rect.format === "rectangle");
    const [side, bottom] = rect.answer;
    assert.equal(checkPracticeAnswer(rect, { pair: [side, bottom] }, 1).verdict, "CORRECT");
    const off = checkPracticeAnswer(rect, { pair: [side + 1, bottom - 1] }, 1);
    if (bottom > 1) {
      assert.equal(off.verdict, "INCORRECT");
      assert.match(off.feedback, /spaces/);
    }
    assert.equal(checkPracticeAnswer(rect, { pair: [side, bottom + 1] }, 1).verdict, "UNREADABLE", "every strip has to be used");
    assert.equal("answer" in practiceItemView(rect), false);
  });

  for (const skill of ["FAC_MONIC_TRINOMIAL", "FAC_FACTOR_FULLY", "EXP_EXPAND_SINGLE"]) {
    it(`marker's desk (${skill}): Bit's papers are judged by the engine, and the mistake must be named`, () => {
      const set = generatePractice(skill, `desk:${skill}`);
      const desk = set.items.find((i) => i.format === "mark-it");
      assert.ok(desk && desk.format === "mark-it");
      const view = practiceItemView(desk) as { papers: Array<Record<string, unknown>> };
      assert.ok(view.papers.every((p) => !("verdict" in p) && !("reasons" in p) && !("learn" in p)), "the browser never learns which papers are wrong");
      desk.papers.forEach((paper, i) => {
        if (paper.verdict === "right") {
          assert.equal(checkPracticeAnswer(desk, { paper: i, mark: "right" }, 1).verdict, "CORRECT");
          assert.equal(checkPracticeAnswer(desk, { paper: i, mark: "wrong" }, 1).verdict, "INCORRECT");
        } else {
          assert.equal(checkPracticeAnswer(desk, { paper: i, mark: "right" }, 1).verdict, "INCORRECT");
          assert.equal(checkPracticeAnswer(desk, { paper: i, mark: "wrong" }, 1).verdict, "UNFINISHED", "stamped wrong, now name it");
          assert.equal(checkPracticeAnswer(desk, { paper: i, mark: "wrong", reason: paper.reasons[0] }, 1).verdict, "CORRECT");
          const other = (["sign", "forgot", "unfinished", "pair"] as const).find((r) => !paper.reasons.includes(r))!;
          assert.equal(checkPracticeAnswer(desk, { paper: i, mark: "wrong", reason: other }, 1).verdict, "INCORRECT");
        }
      });
    });

    it(`bracket rush (${skill}): every round has one right option, marked on the server`, () => {
      const set = generatePractice(skill, `rush:${skill}`);
      const rush = set.items.find((i) => i.format === "rush");
      assert.ok(rush && rush.format === "rush");
      assert.ok(rush.rounds.length >= 8);
      const view = practiceItemView(rush) as { rounds: Array<Record<string, unknown>> };
      assert.ok(view.rounds.every((r) => !("answerIndex" in r) && !("why" in r)));
      rush.rounds.forEach((round, i) => {
        assert.equal(checkPracticeAnswer(rush, { round: i, option: round.answerIndex }, 1).verdict, "CORRECT");
        const wrong = checkPracticeAnswer(rush, { round: i, option: (round.answerIndex + 1) % round.options.length }, 1);
        assert.equal(wrong.verdict, "INCORRECT");
        assert.equal(wrong.reveal?.answer, round.options[round.answerIndex], "a miss shows the answer so it can come back");
      });
    });
  }
});

describe("AI-written practice gets the games too", async () => {
  const { withPracticeGames } = await import("../../src/personalized-videos/personalized-videos.service");
  it("adds the code-built games after an AI set, renumbers, and doesn't add them twice", () => {
    const ai = generatePractice("FAC_FACTOR_FULLY", "ai").items.filter((i) => i.format === "choose" || i.format === "type-answer" || i.format === "spot-mistake");
    const merged = withPracticeGames(ai, "FAC_FACTOR_FULLY", "a1", []);
    assert.ok(merged.some((i) => i.format === "mark-it") && merged.some((i) => i.format === "rush"));
    assert.deepEqual(merged.map((i) => i.id), merged.map((_, i) => `p${i + 1}`));
    assert.equal(withPracticeGames(merged, "FAC_FACTOR_FULLY", "a1", []).length, merged.length);
  });
});
