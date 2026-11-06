import type { LotusPredictedMistake, LotusQuestion } from "@cogna/shared";
import { LOTUS_SELECT_SEPARATOR } from "@cogna/shared";
import { algebraicallyEqual, classifyFactorisation, expressionCanShowSkill, factorisationDefect, normalizeMathText } from "./lotus-algebra";
import { skillName, type SlotSpec } from "./lotus-factorisation-catalogue";
import { checkWrittenItem, type WriteRequest } from "./lotus-question-factory";
import { isCheckSpec, skillCheckForRequest } from "./lotus-skill-checks";
import { buildTileInteraction, gameFormatsEnabled } from "../interaction-formats/tile-builder";
import { themedGamesEnabled } from "./lotus-game-core";

/**
 * Game questions for the Lotus diagnostic, built and checked by code.
 *
 * Each probe tests the same skill and catches the same named mistakes as the
 * slot it fills, staged as a game: fireflies (pick the pair), spot the
 * impostor (find the form that isn't equal), detective (find the first wrong
 * line), fishing (net every fully factorised expression) and garden fences
 * (a monic trinomial with only positive numbers).
 *
 * Every claim is re-derived with the exact algebra engine before the item is
 * returned; anything that doesn't check out returns null and the slot falls
 * back to the AI writer. Probes never replace the typed questions with
 * working that carry the richest evidence: they fill the specific slots
 * below, and only when the request's purpose and target mistake fit.
 */

type Item = Omit<LotusQuestion, "id">;

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
function shuffle<T>(rand: () => number, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Student-facing signed number: −3, 4. */
const shown = (n: number) => (n < 0 ? `−${-n}` : `${n}`);
/** ASCII algebra pieces the engine reads. */
const lin = (n: number, v = "x") => (n < 0 ? `${v} - ${-n}` : `${v} + ${n}`);
const termAfter = (n: number, body = "") => (n === 0 ? "" : ` ${n < 0 ? "-" : "+"} ${Math.abs(n) === 1 && body ? "" : Math.abs(n)}${body}`);
const trinomial = (b: number, c: number) => `x^2${termAfter(b, "x")}${termAfter(c)}`;
const pretty = (text: string) => text.replace(/\^2/g, "²").replace(/ - /g, " − ").replace(/^-/, "−").replace(/\(-/g, "(−");

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function base(spec: SlotSpec, req: WriteRequest, prompt: string) {
  return {
    phase: spec.phase,
    subtopic: skillName(spec.skillId),
    prompt,
    purpose: `${req.purpose === "CHECK" ? "Re-check" : "Test"}: ${skillName(spec.skillId)} (game)`,
  };
}

function diagnostics(spec: SlotSpec, itemKind: "CHOICE" | "SELECT" | "FACTORISE", steps: number, predictedMistakes: LotusPredictedMistake[], expression?: string, taggedFor?: string) {
  // A slot's static tags assume its usual expression: drop a tag the expression actually built can't exercise.
  const shape = expression ?? taggedFor;
  return {
    itemKind,
    ...(expression ? { expression } : {}),
    skillId: spec.skillId,
    taggedSkills: spec.tagged.filter((s) => expressionCanShowSkill(s, shape)),
    stepSkills: Array.from({ length: steps }, () => spec.skillId),
    predictedMistakes,
    slot: spec.slot,
    level: spec.level,
    origin: "CODE" as const,
    provenance: "CODE_BUILT_GAME" as const,
  };
}

function freshPair(rand: () => number, positiveOnly = false): { p: number; q: number } {
  for (let tries = 0; tries < 60; tries++) {
    const p = pick(rand, [1, 2, 3, 4, 5, 6, 7]) * (positiveOnly ? 1 : pick(rand, [1, -1]));
    const q = pick(rand, [2, 3, 4, 5, 6, 8, 9]) * (positiveOnly ? 1 : pick(rand, [1, -1]));
    if (p !== q && p + q !== 0) return { p, q };
  }
  return { p: 3, q: 4 };
}

/** Fireflies: which two numbers have this product and sum? (FAC_PAIR_PRODUCT_SUM) */
function firefly(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const { p, q } = freshPair(rand);
  const P = p * q, S = p + q;
  const pair = (a: number, b: number) => `${shown(a)} and ${shown(b)}`;
  const options: Array<{ text: string; mistake?: string }> = [{ text: pair(p, q) }, { text: pair(-p, -q), mistake: "SIGN_PAIR_ERROR" }];
  for (let r = 1; r <= Math.abs(P); r++) {
    if (P % r !== 0) continue;
    for (const [a, b] of [[r, P / r], [-r, -P / r]] as const) {
      if (options.length >= 3) break;
      if (a + b !== S && a + b !== -S) options.push({ text: pair(a, b), mistake: "WRONG_FACTOR_PAIR_SUM" });
    }
  }
  const a = p + 1, b = q - 1;
  if (a !== 0 && b !== 0 && a * b !== P) options.push({ text: pair(a, b), mistake: "WRONG_FACTOR_PAIR_PRODUCT" });
  if (options.length !== 4 || new Set(options.map((o) => normalizeMathText(o.text))).size !== 4) return null;
  const shuffled = shuffle(rand, options);
  return {
    ...base(spec, req, `Catch the firefly: which two numbers multiply to ${shown(P)} and add to ${shown(S)}?`),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options: shuffled.map((o) => o.text), presentation: "FIREFLY",
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: pair(p, q),
      workedSolution: [`${shown(p)} × ${shown(q)} = ${shown(P)}`, `${shown(p)} + ${shown(q)} = ${shown(S)}`],
      diagnostics: diagnostics(spec, "CHOICE", 2, shuffled.filter((o) => o.mistake).map((o) => ({ answer: o.text, mistake: o.mistake! }))),
    },
  };
}

/** Spot the impostor: three forms equal the trinomial, one only matches its first and last terms. (FAC_VERIFY_EXPAND) */
function impostor(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const { p, q } = freshPair(rand);
  const expr = trinomial(p + q, p * q);
  const impostorForm = `(${lin(-p)})(${lin(-q)})`;
  const equalForms = [`(${lin(p)})(${lin(q)})`, `(${lin(q)})(${lin(p)})`, `x^2${termAfter(p, "x")}${termAfter(q, "x")}${termAfter(p * q)}`];
  // Re-derive every claim: the three are equal to the expression, the impostor is not, yet shares x² and the constant.
  if (!equalForms.every((f) => algebraicallyEqual(f, expr)) || algebraicallyEqual(impostorForm, expr)) return null;
  const options = shuffle(rand, [impostorForm, ...equalForms]).map(pretty);
  return {
    ...base(spec, req, `Three of these are ${pretty(expr)} in disguise. Which one is the odd one out?`),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options, presentation: "IMPOSTOR",
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: pretty(impostorForm),
      workedSolution: [`${pretty(impostorForm)} = ${pretty(trinomial(-(p + q), p * q))}`, `That is not ${pretty(expr)}: the middle sign is wrong`],
      // Picking a genuinely equal form means the student couldn't check by expanding. All four forms
      // share x² and the constant, so it is also exactly the "checked the first and last terms only" trap:
      // a check of that mistake records it by name.
      diagnostics: diagnostics(spec, "CHOICE", 2, equalForms.map((f) => ({ answer: pretty(f), mistake: req.targetMistake === "CHECKED_FIRST_TERM_ONLY" ? "CHECKED_FIRST_TERM_ONLY" : "EXPAND_CHECK_FAIL" }))),
    },
  };
}

/** Detective: where does taking out a negative factor first go wrong? (FAC_GCF_NEGATIVE) */
function detective(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const g = pick(rand, [2, 3, 4, 5]);
  const a = pick(rand, [1, 2, 3]), b = pick(rand, [1, 2, 3, 5]);
  if (gcd(a, b) !== 1) return null;
  const expr = `-${g * a === 1 ? "" : g * a}x - ${g * b}`;
  const inner = `${a === 1 ? "" : a}x`;
  const lines = [
    expr,
    `(-${g})(${inner}) + (-${g})(${b})`,
    `-${g}(${inner} - ${b})`, // KEPT_ORIGINAL_SIGNS: the sign inside should flip to +
    `-${g * a === 1 ? "" : g * a}x + ${g * b}`,
  ];
  if (!algebraicallyEqual(lines[1]!, lines[0]!) || algebraicallyEqual(lines[2]!, lines[1]!) || !algebraicallyEqual(lines[3]!, lines[2]!)) return null;
  const options = ["Line 1", "Line 2", "Line 3", "Nothing is wrong"];
  return {
    ...base(spec, req, "This working takes out a negative factor. Which line is the first one that goes wrong?"),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options, presentation: "DETECTIVE", lines: lines.map(pretty),
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: "Line 2",
      workedSolution: [`${pretty(lines[1]!)} is right`, `Line 2 should be ${pretty(`-${g}(${inner} + ${b})`)}: −${g} × ${b} must give −${g * b}`],
      diagnostics: diagnostics(spec, "CHOICE", 2, [
        { answer: "Nothing is wrong", mistake: "KEPT_ORIGINAL_SIGNS" },
        { answer: "Line 3", mistake: "KEPT_ORIGINAL_SIGNS" },
      ]),
    },
  };
}

/** Fishing: net every fully factorised expression. (FAC_MEANING, FAC_FACTOR_FULLY) */
function fishing(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const k = pick(rand, [2, 3, 5]);
  const { p, q } = freshPair(rand, true);
  const m = pick(rand, [2, 3]);
  const sumsAllowed = spec.skillId === "FAC_MEANING";
  const finished = [
    `${k}(${lin(-p)})(${lin(p)})`,
    `(${lin(p)})(${lin(q)})`,
    `${m}x(${lin(q)})`,
  ];
  const unfinished: Array<{ text: string; mistake: string }> = [
    { text: `${k}(x^2 - ${p * p})`, mistake: "INCOMPLETE_FACTORISATION" },
    { text: `(${m}x + ${m * q})(${lin(p)})`, mistake: "INCOMPLETE_FACTORISATION" },
  ];
  if (sumsAllowed) unfinished.push({ text: `${m}y(${lin(q)}) + ${k}(${lin(q)})`, mistake: "SUM_ACCEPTED_AS_FACTORISED" });
  // Re-derive which are finished with the engine itself.
  if (!finished.every((f) => factorisationDefect(f) === null) || !unfinished.every((u) => factorisationDefect(u.text) !== null && factorisationDefect(u.text) !== "UNREADABLE")) return null;
  const fish = shuffle(rand, [...finished.map((t) => ({ text: t, mistake: undefined as string | undefined })), ...unfinished]);
  const options = fish.map((f) => pretty(f.text));
  const key = finished.map(pretty).sort().join(LOTUS_SELECT_SEPARATOR);
  return {
    ...base(spec, req, "Pick every expression that is fully factorised. Leave the others."),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options, presentation: "FISHING",
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: key,
      workedSolution: [`Fully factorised: ${finished.map(pretty).join(", ")}`, `Not finished: ${unfinished.map((u) => pretty(u.text)).join(", ")}`],
      diagnostics: diagnostics(spec, "SELECT", 2, fish.filter((f) => f.mistake).map((f) => ({ answer: pretty(f.text), mistake: f.mistake! }))),
    },
  };
}

/** Garden fences: a monic trinomial with only positive numbers, built as the garden's two sides. (FAC_MONIC_TRINOMIAL) */
function garden(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const { p, q } = freshPair(rand, true);
  // A pair containing 1 can have no alternative positive product pair.
  // Those instances lack the second required misconception and were being
  // discarded at installation, making the garden unexpectedly rare.
  if (p === 1 || q === 1) return null;
  const expr = trinomial(p + q, p * q);
  const answer = `(${lin(p)})(${lin(q)})`;
  const mistakes: LotusPredictedMistake[] = [];
  for (let r = 1; r <= p * q; r++) {
    if ((p * q) % r || r === p || r === q || r > (p * q) / r) continue;
    mistakes.push({ answer: `(${lin(r)})(${lin((p * q) / r)})`, mistake: "WRONG_FACTOR_PAIR_SUM" });
    break;
  }
  // Numbers that multiply to the middle and add to the end: the product and sum swapped.
  for (let r = 1; r < p + q; r++) {
    const s = (p + q) / r;
    if (Number.isInteger(s) && r <= s && r + s !== p + q && (r !== p || s !== q)) {
      mistakes.push({ answer: `(${lin(r)})(${lin(s)})`, mistake: "PRODUCT_SUM_SWAPPED" });
      break;
    }
  }
  if (classifyFactorisation(answer, expr) !== "CORRECT" || mistakes.some((m) => classifyFactorisation(m.answer, expr) === "CORRECT")) return null;
  const item: Item = {
    ...base(spec, req, `Garden fences: the garden is ${pretty(expr)}. Which fence goes along the top, and which down the side?`),
    type: "CONSTRUCTED_RESPONSE", asksForWorking: false, presentation: "GARDEN",
    answerKey: {
      kind: "OPEN_RESPONSE", canonicalAnswer: answer,
      workedSolution: [`${p} × ${q} = ${p * q} and ${p} + ${q} = ${p + q}`, answer],
      diagnostics: diagnostics(spec, "FACTORISE", 2, mistakes, expr),
    },
  };
  const interaction = buildTileInteraction({ stage: "DIAGNOSTIC", task: "factorise", expression: expr, answer, mistakes: mistakes.map((m) => m.answer), seed: `${req.variation ?? ""}|garden|${spec.slot}` });
  if (!interaction || interaction.format !== "BRACKET_BRIDGE") return null;
  return { ...item, interaction };
}

/** Division probe: divides every term by the common factor vs dividing only the first term. (FAC_DIVIDE_TERMS) */
function divisionProbe(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const g = pick(rand, [2, 3, 4, 5]);
  const a = pick(rand, [1, 2, 3]);
  const b = pick(rand, [1, 2, 3, 5]);
  if (gcd(a, b) !== 1) return null;
  const expr = `${g * a === 1 ? "" : g * a}x + ${g * b}`;
  const correct = `${g}(${a === 1 ? "" : a}x + ${b})`;
  const wrongDivFirstOnly = `${g}(${a === 1 ? "" : a}x + ${g * b})`;
  const wrongCommonNotHighest = g >= 4 && g % 2 === 0 ? `2(${a * (g / 2) === 1 ? "" : a * (g / 2)}x + ${b * (g / 2)})` : `${g}(${a === 1 ? "" : a}x + ${b + 1})`;
  const options = shuffle(rand, [
    { text: pretty(correct) },
    { text: pretty(wrongDivFirstOnly), mistake: "DIVIDED_FIRST_TERM_ONLY" },
    { text: pretty(wrongCommonNotHighest), mistake: "COMMON_NOT_HIGHEST" },
    { text: pretty(`${g}(${a === 1 ? "" : a}x)`), mistake: "DIVIDED_FIRST_TERM_ONLY" },
  ]);
  if (new Set(options.map((o) => o.text)).size !== 4) return null;
  if (req.purpose === "CHECK") {
    return {
      ...base(spec, req, `Factorise completely: divide every term by the common factor in ${pretty(expr)}.`),
      type: "CONSTRUCTED_RESPONSE", asksForWorking: true,
      answerKey: {
        kind: "OPEN_RESPONSE", canonicalAnswer: pretty(correct),
        workedSolution: [`The common factor is ${g}`, `Divide both terms by ${g}: ${g * a}x/${g} = ${a === 1 ? "" : a}x, and ${g * b}/${g} = ${b}`, pretty(correct)],
        diagnostics: diagnostics(spec, "FACTORISE", 3, options.filter((o) => o.mistake).map((o) => ({ answer: o.text, mistake: o.mistake! })), expr),
      },
    };
  }
  return {
    ...base(spec, req, `Factorise completely: divide every term by the common factor in ${pretty(expr)}.`),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options: options.map((o) => o.text), presentation: "WORKSHOP",
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: pretty(correct),
      workedSolution: [`The common factor is ${g}`, `Divide both terms by ${g}: ${g * a}x/${g} = ${a === 1 ? "" : a}x, and ${g * b}/${g} = ${b}`, pretty(correct)],
      diagnostics: diagnostics(spec, "CHOICE", 3, options.filter((o) => o.mistake).map((o) => ({ answer: o.text, mistake: o.mistake! })), undefined, expr),
    },
  };
}

/** Difference of squares probe: distinguishes (a+b)(a-b) from (a-b)² identity confusion. (FAC_DIFF_SQUARES) */
function identityProbe(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const k = pick(rand, [2, 3, 4, 5, 6, 7, 8, 9]);
  const expr = `x^2 - ${k * k}`;
  const correct = `(${lin(-k)})(${lin(k)})`;
  const wrongSquareMinus = `(${lin(-k)})^2`;
  const wrongSquarePlus = `(${lin(k)})^2`;
  const wrongDroppedSquare = `(${lin(-k)})`;
  const options = shuffle(rand, [
    { text: pretty(correct) },
    { text: pretty(wrongSquareMinus), mistake: "WROTE_PERFECT_SQUARE" },
    { text: pretty(wrongSquarePlus), mistake: "WROTE_PERFECT_SQUARE" },
    { text: pretty(wrongDroppedSquare), mistake: "DROPPED_SQUARE" },
  ]);
  if (new Set(options.map((o) => o.text)).size !== 4) return null;
  return {
    ...base(spec, req, `Factorise using identity: which form correctly factorises ${pretty(expr)}?`),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options: options.map((o) => o.text), presentation: "IMPOSTOR",
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: pretty(correct),
      workedSolution: [`This matches a² - b² = (a - b)(a + b) with a = x and b = ${k}`, pretty(correct)],
      diagnostics: diagnostics(spec, "CHOICE", 2, options.filter((o) => o.mistake).map((o) => ({ answer: o.text, mistake: o.mistake! }))),
    },
  };
}

/** Cancellation probe: cancels factors, never additive terms. (FAC_CANCEL_COMMON_FACTOR) */
function cancellationProbe(spec: SlotSpec, req: WriteRequest, rand: () => number): Item | null {
  const g = pick(rand, [2, 3, 4, 5]);
  const a = pick(rand, [2, 3]);
  const b = pick(rand, [1, 5, 7]);
  const num = `${g * a}x + ${g * b}`;
  const correct = `${a}x + ${b}`;
  const wrongCancelOne = `${a}x + ${g * b}`;
  const wrongCancelSecond = `${g * a}x + ${b}`;
  const wrongSubtract = `${a}x + ${g * b - g}`;
  const options = shuffle(rand, [
    { text: pretty(correct) },
    { text: pretty(wrongCancelOne), mistake: "DIVIDED_ONE_TERM_ONLY" },
    { text: pretty(wrongCancelSecond), mistake: "TERMS_VS_FACTORS" },
    { text: pretty(wrongSubtract), mistake: "DIVIDED_ONE_TERM_ONLY" },
  ]);
  if (new Set(options.map((o) => o.text)).size !== 4) return null;
  return {
    ...base(spec, req, `Simplify (${pretty(num)}) / ${g}. Which working is mathematically valid?`),
    type: "MULTIPLE_CHOICE", asksForWorking: false, options: options.map((o) => o.text), presentation: "DETECTIVE",
    answerKey: {
      kind: "MULTIPLE_CHOICE", canonicalAnswer: pretty(correct),
      workedSolution: [`Factor the numerator first: ${g}(${a}x + ${b}) / ${g}`, `Cancel the common factor ${g}: ${pretty(correct)}`],
      diagnostics: diagnostics(spec, "CHOICE", 2, options.filter((o) => o.mistake).map((o) => ({ answer: o.text, mistake: o.mistake! }))),
    },
  };
}

type Builder = (spec: SlotSpec, req: WriteRequest, rand: () => number) => Item | null;

/** Which slot gets which game, and for which requests. Everything else stays with the AI writer. */
const PROBES: Array<{ skillId: string; build: Builder; when: (req: WriteRequest) => boolean }> = [
  { skillId: "FAC_PAIR_PRODUCT_SUM", build: firefly, when: () => true },
  // The only direct evidence for checking by expanding (nobody writes the check out): the base question and every re-check.
  { skillId: "FAC_VERIFY_EXPAND", build: impostor, when: (req) => !req.targetMistake || req.targetMistake === "EXPAND_CHECK_FAIL" || req.targetMistake === "CHECKED_FIRST_TERM_ONLY" },
  { skillId: "FAC_GCF_NEGATIVE", build: detective, when: (req) => (req.purpose === "BASE" || req.purpose === "CHECK") && (!req.targetMistake || req.targetMistake === "KEPT_ORIGINAL_SIGNS") },
  { skillId: "FAC_MEANING", build: fishing, when: (req) => req.spec.mistakes.includes("SUM_ACCEPTED_AS_FACTORISED") && (!req.targetMistake || req.targetMistake === "SUM_ACCEPTED_AS_FACTORISED") },
  { skillId: "FAC_FACTOR_FULLY", build: fishing, when: (req) => req.purpose === "CHECK" && (!req.targetMistake || req.targetMistake === "INCOMPLETE_FACTORISATION") },
  // An easy trinomial, or one rewritten to avoid a sign gap: positive numbers only.
  { skillId: "FAC_MONIC_TRINOMIAL", build: garden, when: (req) => (req.purpose === "BASE" && req.spec.level === "easy") || (req.purpose === "AVOID" && /SIGN/.test(req.avoidSkill ?? "")) },
  // Discriminating probes for CUR-003:
  { skillId: "FAC_DIVIDE_TERMS", build: divisionProbe, when: (req) => !req.targetMistake || req.targetMistake === "DIVIDED_FIRST_TERM_ONLY" || req.targetMistake === "COMMON_NOT_HIGHEST" },
  { skillId: "FAC_DIFF_SQUARES", build: identityProbe, when: (req) => !req.targetMistake || req.targetMistake === "WROTE_PERFECT_SQUARE" || req.targetMistake === "DROPPED_SQUARE" },
  { skillId: "FAC_CANCEL_COMMON_FACTOR", build: cancellationProbe, when: () => true },
  { skillId: "FAC_MEANING", build: cancellationProbe, when: (req) => req.spec.mistakes.includes("TERMS_VS_FACTORS") || req.spec.mistakes.includes("DIVIDED_ONE_TERM_ONLY") },
];

/** A checked game question for this request, or null to let the AI writer handle it. */
export function codeProbeFor(req: WriteRequest, env: NodeJS.ProcessEnv = process.env): Item | null {
  // A direct check of a foundation skill the 25-slot plan has no question for: a short
  // code-made check (lotus-skill-checks.ts). Independent of the game-format switch.
  if (isCheckSpec(req.spec)) {
    const check = skillCheckForRequest(req);
    return check && !checkWrittenItem(req, check).length ? check : null;
  }
  if (!gameFormatsEnabled(env) || req.requiredExpression) return null;
  // With the new games on, the fireflies and the garden are retired: the plan's request goes to a new game or the writer.
  const retired = themedGamesEnabled(env) ? [firefly, garden] : [];
  const probe = PROBES.find((p) => p.skillId === req.spec.skillId && p.when(req) && !retired.includes(p.build));
  if (!probe) return null;
  const avoid = new Set(req.avoid.map((a) => normalizeMathText(a).toLowerCase()));
  for (let attempt = 0; attempt < 6; attempt++) {
    const rand = seeded(`${req.variation ?? ""}|${req.spec.slot}|${req.purpose}|${attempt}`);
    const item = probe.build(req.spec, req, rand);
    if (!item) continue;
    const print = normalizeMathText(item.answerKey.diagnostics?.expression ?? item.prompt).toLowerCase();
    if (avoid.has(print)) continue;
    if (req.targetMistake && !item.answerKey.diagnostics!.predictedMistakes.some((m) => m.mistake === req.targetMistake)) continue;
    // Retry a different instance if it cannot pass the same gate the writer
    // queue uses, including its minimum number of predicted mistakes.
    if (checkWrittenItem(req, item).length) continue;
    return item;
  }
  return null;
}
