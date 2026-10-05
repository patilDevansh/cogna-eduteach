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
