import type { LotusPredictedMistake, LotusQuestion } from "@cogna/shared";
import { LOTUS_SELECT_SEPARATOR } from "@cogna/shared";
import { normalizeMathText } from "./lotus-algebra";
import { skillName, type SlotSpec } from "./lotus-factorisation-catalogue";
import { hashOf, seededRandom, shuffled, themedGamesEnabled } from "./lotus-game-core";
import { CANT_BE_FACTORISED, CLAIM_OPTIONS, chunkData, prettyText, rapidRows, REPLAY_LINE_OPTIONS, replayData, validBs } from "./lotus-games-more";
import { checkWrittenItem, type WriteRequest } from "./lotus-question-factory";

/**
 * Questions made for the themed games that need a question of their own (the
 * first set of games dress a question the plan already asked). Built and
 * checked by code like the game probes in lotus-probes.ts: every claim is
 * re-derived with the algebra engine, and anything that does not check out
 * returns null so the slot falls back to the question the plan would have asked.
 *
 * Each one fills a slot the plan already has, for the skill it tests and the
 * mistakes that slot looks for, so the plan itself never changes.
 */

type Item = Omit<LotusQuestion, "id">;
type Builder = (spec: SlotSpec, req: WriteRequest, rand: () => number) => Item | null;

const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;

function base(spec: SlotSpec, req: WriteRequest, prompt: string) {
  return {
    phase: spec.phase,
    subtopic: skillName(spec.skillId),
    prompt,
    purpose: `${req.purpose === "CHECK" ? "Re-check" : "Test"}: ${skillName(spec.skillId)} (game)`,
  };
}

function diagnostics(spec: SlotSpec, itemKind: "CHOICE" | "SELECT" | "FACTORISE", steps: number, predictedMistakes: LotusPredictedMistake[], expression?: string) {
  return {
    itemKind,
    ...(expression ? { expression } : {}),
    skillId: spec.skillId,
    taggedSkills: spec.tagged,
    stepSkills: Array.from({ length: steps }, () => spec.skillId),
    predictedMistakes,
    slot: spec.slot,
    level: spec.level,
    origin: "CODE" as const,
    provenance: "CODE_BUILT_GAME" as const,
  };
}

/** A four-option multiple-choice item whose own options are what the game's answer maps onto. */
function choiceItem(spec: SlotSpec, req: WriteRequest, prompt: string, options: string[], key: string, steps: string[], mistakes: LotusPredictedMistake[], game: NonNullable<LotusQuestion["game"]>): Item {
  return {
    ...base(spec, req, prompt),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options, game,
    answerKey: { kind: "MULTIPLE_CHOICE", canonicalAnswer: key, workedSolution: steps, diagnostics: diagnostics(spec, "CHOICE", steps.length, mistakes) },
  };
}

/** Test the claim: is (x + k)² = x² + k² always, sometimes or never true? (FAC_VERIFY_EXPAND) */
const testClaim: Builder = (spec, req, rand) => {
  const k = pick(rand, [2, 3, 4, 5]);
  const options = shuffled(`${req.variation ?? ""}|${spec.slot}|claim`, [...CLAIM_OPTIONS]);
  const claim = `(x + ${k})^2 = x^2 + ${k * k}`;
  return choiceItem(
    spec, req,
    `Is (x + ${k})² = x² + ${k * k} always true, sometimes true or never true? Try some values of x, then decide.`,
    options, "Sometimes true",
    [`(x + ${k})² = x² + ${2 * k}x + ${k * k}`, `That equals x² + ${k * k} only when ${2 * k}x = 0, so only when x = 0`],
    [{ answer: "Always true", mistake: "EXPAND_CHECK_FAIL" }, { answer: "Never true", mistake: "CHECKED_FIRST_TERM_ONLY" }],
    { version: 1, kind: "TEST_CLAIM", expression: claim, k, min: -6, max: 6, options },
  );
};

/** Stop the replay: Sam expands (x − p)(x + q) and gets one sign wrong. (FAC_VERIFY_EXPAND) */
const replay: Builder = (spec, req, rand) => {
  const p = -pick(rand, [2, 3, 4, 5, 6]);
  const q = pick(rand, [2, 3, 4, 5, 6]);
  const data = replayData(p, q);
  if (!data) return null;
  return choiceItem(
    spec, req,
    `Sam checks ${data.claim} by expanding. Stop the replay at the first line that goes wrong.`,
    [...REPLAY_LINE_OPTIONS], "Line 3",
    [data.lines[0]!, data.lines[1]!, `Line 3 is wrong: (${p}) × ${q} = ${p * q}, not ${-p * q}`],
    [{ answer: "Line 4", mistake: "EXPAND_CHECK_FAIL" }, { answer: "Line 2", mistake: "CHECKED_FIRST_TERM_ONLY" }],
    { version: 1, kind: "REPLAY", expression: data.claim, claim: data.claim, lines: data.lines, stepMs: 1600 },
  );
};

/** Find every b: pick every whole b for which x² + bx + c factorises. (FAC_PAIR_PRODUCT_SUM) */
const findEveryB: Builder = (spec, req, rand) => {
  const c = pick(rand, [6, 8, 9, 10, 14, 15]);
  const valid = validBs(c);
  if (valid.length !== 4) return null;
  const show = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
  // Decoys: c and −c are never a sum of a pair of its factors here, and are the b students mix with a factor.
  if (valid.includes(c) || valid.includes(-c)) return null;
  const options = [...valid.map(show), show(c), show(-c)];
  const range = Math.max(15, valid[valid.length - 1]! + 2);
  return {
    ...base(spec, req, `x² + bx + ${c} can be factorised into two brackets with whole numbers. Pick every b that works.`),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options,
    game: { version: 1, kind: "FIND_EVERY_B", expression: `x^2 + bx + ${c}`, c, range },
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: valid.map(show).join(LOTUS_SELECT_SEPARATOR),
      workedSolution: [`The pairs that multiply to ${c}, in both signs, are the only ones that work`, `b is the sum of the pair: ${valid.map(show).join(", ")}`],
      diagnostics: diagnostics(spec, "SELECT", 2, [{ answer: show(c), mistake: "WRONG_FACTOR_PAIR_SUM" }, { answer: show(-c), mistake: "WRONG_FACTOR_PAIR_PRODUCT" }]),
    },
  };
};

/** Rapid set: four quick factorisations, the last a look-alike. (FAC_DIFF_SQUARES) */
const rapidSet: Builder = (spec, req, rand) => {
  const rows = rapidRows(`${req.variation ?? ""}|${spec.slot}|${Math.floor(rand() * 1e9)}`);
  if (!rows) return null;
  const trap = rows[3]!;
  const d = Number(/^x\^2 \+ (\d+)$/.exec(trap.q)?.[1]);
  const root = Math.sqrt(d);
  if (!Number.isInteger(root)) return null;
  const options = trap.options;
  return choiceItem(
    spec, req,
    `Four quick ones, ending with ${prettyText(trap.q)}. Factorise each, or say it can't be done.`,
    options, CANT_BE_FACTORISED,
    [`${prettyText(trap.q)} is a sum of two squares, not a difference`, "A sum of two squares has no factors in whole-number brackets"],
    [{ answer: `(x - ${root})(x + ${root})`, mistake: "NOT_DIFF_OF_SQUARES" }, { answer: `(x + ${root})^2`, mistake: "WROTE_PERFECT_SQUARE" }],
    { version: 1, kind: "RAPID_SET", expression: trap.q, rows: rows.map(({ q, options }) => ({ q, options })) },
  );
};

/** Chunk it: (x + a)² − b² by treating (x + a) as one chunk, expanding, or square-rooting each part. (FAC_DIFF_SQUARES) */
const chunkIt: Builder = (spec, req, rand) => {
  const a = pick(rand, [2, 3, 4, 5]);
  const b = pick(rand, [2, 3, 4, 5, 6]);
  const data = chunkData(a, b);
  if (!data) return null;
  const expression = `(x + ${a})^2 - ${b * b}`;
  const lo = a - b;
  const mistakes: LotusPredictedMistake[] = [
    { answer: `x ${lo < 0 ? "-" : "+"} ${Math.abs(lo)}`, mistake: "NOT_DIFF_OF_SQUARES" },
    { answer: `(x ${lo < 0 ? "-" : "+"} ${Math.abs(lo)})^2`, mistake: "WROTE_PERFECT_SQUARE" },
  ];
  const routes = shuffled(`${req.variation ?? ""}|${spec.slot}|chunk`, data.routes).map(({ id, lines }) => ({ move: id === "BLOCK" ? ("CHUNK" as const) : id, lines }));
  return {
    ...base(spec, req, `Factorise completely: ${prettyText(expression)}. What's your first move?`),
    type: "CONSTRUCTED_RESPONSE", asksForWorking: false,
    game: { version: 1, kind: "CHUNK_IT", expression, chunk: data.chunk, routes },
    answerKey: {
      kind: "OPEN_RESPONSE", canonicalAnswer: data.answer,
      workedSolution: [`Treat (${data.chunk}) as one chunk: A² − ${b}²`, `(A − ${b})(A + ${b})`, data.answer],
      diagnostics: diagnostics(spec, "FACTORISE", 3, mistakes, expression),
    },
  };
};

const verifyWhen = (req: WriteRequest) => !req.targetMistake || req.targetMistake === "EXPAND_CHECK_FAIL" || req.targetMistake === "CHECKED_FIRST_TERM_ONLY";

interface GameProbe {
  skillId: string;
  build: Builder;
  when: (req: WriteRequest) => boolean;
}

const GAME_PROBES: GameProbe[] = [
  { skillId: "FAC_VERIFY_EXPAND", build: testClaim, when: verifyWhen },
  { skillId: "FAC_VERIFY_EXPAND", build: replay, when: verifyWhen },
  { skillId: "FAC_PAIR_PRODUCT_SUM", build: findEveryB, when: () => true },
  { skillId: "FAC_DIFF_SQUARES", build: rapidSet, when: (req) => req.purpose === "BASE" && req.spec.level === "medium" },
  // A widening to the harder difference-of-squares shape arrives here as a BASE request for that slot.
  { skillId: "FAC_DIFF_SQUARES", build: chunkIt, when: (req) => (req.purpose === "BASE" && req.spec.level === "medium") || (req.purpose === "CHECK" && req.targetMistake === "NOT_DIFF_OF_SQUARES") },
];

/**
 * A checked game question for this request, or null to let the question the
 * plan would have asked (a firefly, an impostor, the AI writer) take it. About
 * half of the requests a game fits go to a game, and which game depends only on
 * the request, never on the student's theme.
 */
export function codeGameProbeFor(req: WriteRequest, env: NodeJS.ProcessEnv = process.env): Item | null {
  if (!themedGamesEnabled(env) || req.requiredExpression) return null;
  const fits = GAME_PROBES.filter((p) => p.skillId === req.spec.skillId && p.when(req));
  if (!fits.length) return null;
  const h = hashOf(`${req.variation ?? ""}|${req.spec.slot}|${req.purpose}|game-probe`);
  const everything = (env.COGNA_THEMED_GAMES ?? "").toLowerCase() === "all";
  const index = h % (everything ? fits.length : fits.length + 1);
  const probe = fits[index];
  if (!probe) return null;
  const avoid = new Set(req.avoid.map((a) => normalizeMathText(a).toLowerCase()));
  for (let attempt = 0; attempt < 8; attempt++) {
    const rand = seededRandom(`${req.variation ?? ""}|${req.spec.slot}|${req.purpose}|${probe.skillId}|${attempt}`);
    const item = probe.build(req.spec, req, rand);
    if (!item) continue;
    const print = normalizeMathText(item.answerKey.diagnostics?.expression ?? item.prompt).toLowerCase();
    if (avoid.has(print)) continue;
    if (req.targetMistake && !item.answerKey.diagnostics!.predictedMistakes.some((m) => m.mistake === req.targetMistake)) continue;
    if (checkWrittenItem(req, item).length) continue;
    return item;
  }
  return null;
}
