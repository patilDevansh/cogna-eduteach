/**
 * The factorisation skill tracker. Pure functions, no AI calls:
 *
 *  - instantVerdict: what an answer tells us the moment it arrives
 *  - foldLedger:     each skill's state, rebuilt from every turn's evidence in order
 *  - planAdjustments: which unseen questions to check, swap, remove, or repurpose to go down
 *  - buildFactorisationReport: the teacher-facing result
 *
 * The rules (COGNA 10.0/FACTORISATION_SKILL_MAP.md §5): one mistake makes a
 * skill SUSPECTED, never confirmed; it's CONFIRMED when the same skill fails
 * again on a later question and CLEARED when a later question using it is
 * right; only confirmed skills prune later questions; the question that
 * checks a suspicion is never pruned; nothing the student can already see is
 * ever changed; removed questions are reported as "not tested", never failed.
 */
import type {
  LotusFinalReport,
  LotusItemDiagnostics,
  LotusMathVerification,
  LotusQuestion,
  LotusQuestionAudit,
  LotusSessionView,
  LotusSkillEvidence,
  LotusSkillState,
  LotusPlannedTopic,
  LotusSkillSummary,
  LotusStudentResponse,
} from "@cogna/shared";
import { LOTUS_SELECT_SEPARATOR, assembleTileAnswer } from "@cogna/shared";
import {
  algebraicallyEqual,
  classifyExpansion,
  classifyFactorisation,
  classifySimplification,
  factorisationDefect,
  nonConstantFactorCount,
  normalizeMathText,
  readNumberAnswer,
  sameFactorisation,
  sameNumber,
} from "./lotus-algebra";
import {
  type SlotSpec,
  curriculumFor,
  dependsOnTransitively,
  findSkill,
  ownerOfMistake,
  skillName,
  skillsUsedBy,
} from "./lotus-factorisation-catalogue";

/** An explicit "I don't know" is always a learning signal, regardless of response speed. */
export const FAST_SKIP_MS = 15_000;

export interface FactorisationTurn {
  turn: number;
  /** The base slot this turn came from. */
  slot: number;
  status: "PLANNED" | "SKIPPED" | "REPURPOSED";
  purpose?: "CHECK" | "AVOID" | "DESCENT" | "WIDEN";
  forSkill?: string;
  reason?: string;
  /** Bumped on every change, so a background result for an older version is thrown away. */
  version: number;
}

export interface FactorisationState {
  /** The planned topic this test follows. Missing on sessions from before other topics existed: those are factorisation. */
  topic?: LotusPlannedTopic;
  /** A catch-up: only these skills are planned, and the result is judged on them alone. */
  focusSkills?: string[];
  /** The plan turn currently on the student's screen. */
  planTurn: number;
  turns: FactorisationTurn[];
  /** Plan turn of each answered audit, in answer order. */
  answeredTurns: number[];
  handledConfirmed: string[];
  /** Skills already offered a BROADEN check (found a target or not) — never revisited, so one secure skill never claims two slots. */
  handledBroadened: string[];
  fastSkips: number;
}

// ---------- instant verdict ----------

function sameChoice(a: string, b: string): boolean {
  return normalizeMathText(a).toLowerCase() === normalizeMathText(b).toLowerCase();
}

function unfinishedCode(answer: string): string {
  switch (factorisationDefect(answer)) {
    case "NOT_A_PRODUCT": return "SUM_ACCEPTED_AS_FACTORISED";
    case "LETTER_LEFT_INSIDE": return "PARTIAL_GCF";
    case "FACTOR_SPLITS_FURTHER": return "INCOMPLETE_FACTORISATION";
    case "NUMBER_LEFT_INSIDE":
      // (2x + 4)(x + 3) — split first, common factor never taken out — is a method mistake; 2(6x + 9) is not the highest factor.
      return nonConstantFactorCount(answer) >= 2 ? "SKIPPED_COMMON_FACTOR_CHECK" : "COMMON_NOT_HIGHEST";
    default: return "INCOMPLETE_FACTORISATION";
  }
}

function secureAll(d: LotusItemDiagnostics): LotusSkillEvidence[] {
  return skillsUsedBy(d).map((skillId) => ({ skillId, kind: "SECURE" as const, source: "INSTANT" as const }));
}

export interface InstantVerdict {
  verification: LotusMathVerification;
  evidence: LotusSkillEvidence[];
  fastSkip: boolean;
  /** True when code alone couldn't say what went wrong — the background analysis has to. */
  needsAnalysis: boolean;
}

export function instantVerdict(question: LotusQuestion, response: LotusStudentResponse): InstantVerdict {
  const d = question.answerKey.diagnostics!;
  const key = question.answerKey.canonicalAnswer;
  const verification = (status: LotusMathVerification["status"], explanation: string): LotusMathVerification => ({
    status, correctAnswer: key, method: d.itemKind === "CHOICE" ? (d.origin === "CODE" ? "DETERMINISTIC_ALGEBRA" : "AI_AUTHORED_REFERENCE") : d.itemKind === "SELECT" ? "DETERMINISTIC_ALGEBRA" : "DETERMINISTIC_ALGEBRA", explanation,
  });

  if (response.didNotKnow) {
    return {
      verification: verification("NO_ANSWER", "The student said they don't know this yet; this is recorded as a support signal."),
      evidence: [{ skillId: d.skillId, kind: "DID_NOT_KNOW", source: "INSTANT", description: "Student explicitly said they don't know this yet." }],
      fastSkip: false,
      needsAnalysis: false,
    };
  }

  const answer = response.answer;
  if (question.interaction?.format === "FACTOR_CROSSWORD") {
    // Rebuild again at this boundary: caller-supplied text cannot override tile picks.
    const built = response.interaction ? assembleTileAnswer(question.interaction, response.interaction.picks) : answer;
    const answers = built?.split(" | ") ?? [];
    const clues = question.interaction.crossword ?? [];
    const correct = clues.length === 4 && answers.length === 4
      && clues.every((clue, i) => classifyFactorisation(answers[i]!, clue.expression) === "CORRECT");
    return {
      verification: { ...verification(correct ? "VERIFIED_CORRECT" : "VERIFIED_INCORRECT",
        correct ? "All four crossings verified by expansion. This is one diagnostic item, not four independent observations."
          : "At least one crossing does not match. Review the four submitted products; a particular misconception is not inferred from puzzle activity."),
        correctAnswer: question.answerKey.crosswordAnswers?.join(" | ") ?? key },
      evidence: correct ? secureAll(d) : [], fastSkip: false, needsAnalysis: !correct,
    };
  }
  if (d.itemKind === "SELECT") {
    // "Net every one that fits": the chosen options, in any order.
    const chosen = new Set(answer.split(LOTUS_SELECT_SEPARATOR).map((part) => normalizeMathText(part).toLowerCase()).filter(Boolean));
    const keyed = new Set(key.split(LOTUS_SELECT_SEPARATOR).map((part) => normalizeMathText(part).toLowerCase()));
    if (chosen.size === keyed.size && [...chosen].every((c) => keyed.has(c))) {
      return { verification: verification("VERIFIED_CORRECT", "Chose exactly the right options."), evidence: secureAll(d), fastSkip: false, needsAnalysis: false };
    }
    const accepted = d.predictedMistakes.filter((p) => chosen.has(normalizeMathText(p.answer).toLowerCase()));
    return {
      verification: verification("VERIFIED_INCORRECT", accepted.length ? "Chose an option that doesn't fit." : "Left out an option that fits."),
      evidence: accepted.map((p) => ({ skillId: ownerOfMistake(p.mistake, d), kind: "MISTAKE" as const, mistake: p.mistake, source: "INSTANT" as const, description: `Chose "${p.answer}".` })),
      fastSkip: false,
      // Only leaving a right option out has no named mistake: the review decides what it means.
      needsAnalysis: accepted.length === 0,
    };
  }
  if (d.itemKind === "CHOICE") {
    if (sameChoice(answer, key)) return { verification: verification("VERIFIED_CORRECT", "Chose the correct option."), evidence: secureAll(d), fastSkip: false, needsAnalysis: false };
    const predicted = d.predictedMistakes.find((p) => sameChoice(p.answer, answer));
    return {
      verification: verification("VERIFIED_INCORRECT", "Chose a wrong option."),
      evidence: predicted ? [{ skillId: ownerOfMistake(predicted.mistake, d), kind: "MISTAKE", mistake: predicted.mistake, source: "INSTANT", description: `Chose "${answer}".` }] : [],
      fastSkip: false,
      needsAnalysis: !predicted,
    };
  }

  if (d.itemKind === "NUMBER") {
    if (readNumberAnswer(answer) === null) {
      return { verification: verification("NOT_DETERMINISTIC", "The answer couldn't be read as a number, so the AI review will interpret it."), evidence: [], fastSkip: false, needsAnalysis: true };
    }
    if (sameNumber(answer, key)) {
      const doubtful = workingHasWrongStep(response.working, undefined, d.itemKind);
      return { verification: verification("VERIFIED_CORRECT", `Equal to ${key}.`), evidence: doubtful ? [] : secureAll(d), fastSkip: false, needsAnalysis: doubtful };
    }
    const predicted = d.predictedMistakes.find((p) => sameNumber(p.answer, answer));
    return {
      verification: verification("VERIFIED_INCORRECT", `Not equal to ${key}.`),
      evidence: predicted ? [{ skillId: ownerOfMistake(predicted.mistake, d), kind: "MISTAKE", mistake: predicted.mistake, source: "INSTANT", description: `Wrote ${answer}.` }] : [],
      fastSkip: false,
      needsAnalysis: !predicted,
    };
  }

  const expression = d.expression!;
  const verdict = d.itemKind === "SIMPLIFY" ? classifySimplification(answer, expression, key)
    : d.itemKind === "EXPAND" ? classifyExpansion(answer, expression)
      : classifyFactorisation(answer, expression);
  const done = d.itemKind === "SIMPLIFY" ? "simplified" : d.itemKind === "EXPAND" ? "expanded and collected" : "factorised";
  if (verdict === "CORRECT") {
    // Right answer, but a step in the working is false: don't call the skill
    // secure on trust — let the AI review read the working first (C3).
    const doubtful = workingHasWrongStep(response.working, expression, d.itemKind);
    return { verification: verification("VERIFIED_CORRECT", `Equal to ${expression} and fully ${done} — checked by expanding.`), evidence: doubtful ? [] : secureAll(d), fastSkip: false, needsAnalysis: doubtful };
  }
  if (verdict === "UNREADABLE") {
    return { verification: verification("NOT_DETERMINISTIC", "The answer couldn't be read as an expression, so the AI review will interpret it."), evidence: [], fastSkip: false, needsAnalysis: true };
  }
  const matches = (p: { answer: string }) => d.itemKind === "SIMPLIFY" || d.itemKind === "EXPAND"
    ? safe(() => algebraicallyEqual(p.answer, answer))
    : sameFactorisation(p.answer, answer);
  const predicted = d.predictedMistakes.find(matches);
  if (verdict === "UNFINISHED") {
    const code = predicted?.mistake ?? (d.itemKind === "EXPAND" ? "NOT_FULLY_SIMPLIFIED" : unfinishedCode(answer));
    return {
      verification: verification("VERIFIED_UNFINISHED", `Equal to ${expression}, but not fully ${done}.`),
      evidence: [{ skillId: ownerOfMistake(code, d), kind: "UNFINISHED", mistake: code, source: "INSTANT", description: `Wrote ${answer}.` }],
      fastSkip: false,
      needsAnalysis: false,
    };
  }
  // A predicted wrong answer after working that already reached the right
  // one is most likely a copying slip, not the misconception it resembles:
  // leave it to the AI review (which labels slips) instead of counting it.
  const countable = predicted && !workingReachesAnswer(response.working, key, d.itemKind) && !workingShowsLostNumbers(response.working, key, answer);
  return {
    verification: verification("VERIFIED_INCORRECT", `Not equal to ${expression} — checked by expanding.`),
    evidence: countable ? [{ skillId: ownerOfMistake(predicted.mistake, d), kind: "MISTAKE", mistake: predicted.mistake, source: "INSTANT", description: `Wrote ${answer}.` }] : [],
    fastSkip: false,
    needsAnalysis: !countable,
  };
}

/**
 * Does the working contain a step that is false, even though the final answer
 * is right? (Two errors can cancel; a lucky answer can sit on nonsense.) A step
 * is false when an equation in it has unequal sides ("4 + 5 = 20"), or, for
 * EXPAND/SIMPLIFY, a line stops being equal to the original expression. Lines
 * code can't read as maths (words, labels) are skipped, never counted against.
 */
function workingHasWrongStep(working: string | undefined, expression: string | undefined, itemKind: LotusItemDiagnostics["itemKind"]): boolean {
  const readable = (s: string) => /[0-9a-z]/i.test(s) && safe(() => algebraicallyEqual(s, s));
  for (const line of (working ?? "").split("\n")) {
    for (const raw of line.split(/,|;|\band\b/i)) {
      const segment = (raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw)
        .replace(/^\s*(so|then|therefore|which is|gives)\s+/i, "").trim();
      if (!segment) continue;
      const sides = segment.split("=").map((s) => s.trim()).filter(Boolean);
      if (sides.length >= 2) {
        for (let i = 0; i + 1 < sides.length; i += 1) {
          const [a, b] = [sides.at(i)!, sides.at(i + 1)!];
          if (readable(a) && readable(b) && !safe(() => algebraicallyEqual(a, b))) return true;
        }
      } else if (expression && (itemKind === "EXPAND" || itemKind === "SIMPLIFY") && /[a-z]/i.test(segment) && readable(segment)) {
        if (!safe(() => algebraicallyEqual(segment, expression))) return true;
      }
    }
  }
  return false;
}

/** The signed numbers written in a piece of maths: "(x - 4)(x - 5)" → ["-4", "-5"]. */
function signedNumbers(text: string): string[] {
  const flat = text.replace(/[−–]/g, "-").replace(/\s+/g, "");
  return [...flat.matchAll(/([+-]?)(\d+(?:\.\d+)?)/g)].map((m) => `${m[1] === "-" ? "-" : ""}${m[2]}`);
}

/**
 * Does the working contain the signed numbers the correct answer needs but
 * the submitted answer lost? E.g. working "-4 × -5 = 20, -4 + -5 = -9", then
 * (x + 4)(x + 5): the child found the right pair and miscopied it, which
 * looks like the predicted sign mistake but isn't one (C3).
 */
function workingShowsLostNumbers(working: string | undefined, key: string, answer: string): boolean {
  if (!working?.trim()) return false;
  const inAnswer = new Set(signedNumbers(answer));
  const lost = [...new Set(signedNumbers(key))].filter((n) => !inAnswer.has(n) && n !== "1" && n !== "0");
  if (!lost.length) return false;
  const inWorking = new Set(signedNumbers(working));
  return lost.every((n) => inWorking.has(n));
}

/** Does any line of the working (or the part after its last "=") already equal the correct answer? */
function workingReachesAnswer(working: string | undefined, key: string, itemKind: LotusItemDiagnostics["itemKind"]): boolean {
  const same = itemKind === "FACTORISE" ? sameFactorisation : algebraicallyEqual;
  for (const line of (working ?? "").split("\n")) {
    const candidates = [line, line.split("=").at(-1) ?? ""].map((c) => c.replace(/^\s*(so|therefore|answer:?)\s+/i, "").trim()).filter(Boolean);
    if (candidates.some((c) => safe(() => same(c, key)))) return true;
  }
  return false;
}

function safe(fn: () => boolean): boolean { try { return fn(); } catch { return false; } }

/**
 * The analyser only says *which step* went wrong; the item's own step tags
 * turn that into a skill. It only fills turns code couldn't explain: if code
 * already proved the answer right, or already named the mistake, the AI's
 * reading doesn't override it (the Lotus policy: never infer a misconception
 * from an answer deterministic verification marks correct).
 */
export function evidenceFromAnalysis(
  question: LotusQuestion,
  existing: LotusSkillEvidence[],
  firstWrongStep: unknown,
  description: string | undefined,
  mistakeKind?: unknown,
  answerCorrect = false,
): LotusSkillEvidence[] {
  const d = question.answerKey.diagnostics;
  // Models sometimes send the step as a string; anything that isn't a step number means "no wrong step".
  const step = typeof firstWrongStep === "string" ? Number(firstWrongStep) : firstWrongStep;
  const noRealStep = typeof step !== "number" || !Number.isInteger(step) || step < 1;
  // A right answer held back for review because its working looked wrong (C3):
  // if the review finds nothing, or only a slip in the working, it is the
  // secure evidence it would have been; a real misunderstanding counts below.
  if (d && answerCorrect && existing.length === 0 && (noRealStep || mistakeKind === "SLIP" || mistakeKind === "UNREADABLE")) return secureAll(d);
  if (!d || noRealStep) return existing;
  if (existing.length > 0) return existing;
  // A slip or an unreadable answer is not evidence the student lacks the
  // skill: two careless copies must not confirm a gap. The analyser's note
  // stays on the turn's analysis record. A missing kind is counted as before.
  if (mistakeKind === "SLIP" || mistakeKind === "UNREADABLE") return existing;
  // A guess (no method) means the same as "I don't know this yet": a support
  // signal on the question's own skill — the step it "went wrong" at means
  // nothing without a method. Two on a skill confirm it, so the child is taught.
  if (mistakeKind === "GUESS") {
    return [{ skillId: d.skillId, kind: "DID_NOT_KNOW", source: "ANALYSIS", description: description?.trim() || "Guessed with no method." }];
  }
  const skillId = d.stepSkills[step - 1] ?? d.skillId;
  return [{ skillId, kind: "MISTAKE", source: "ANALYSIS", description: description?.trim() || `Step ${step} went wrong.` }];
}

// ---------- ledger ----------

export interface SkillLedgerEntry {
  skillId: string;
  state: Exclude<LotusSkillState, "NOT_TESTED_DEPENDENCY">;
  /** Answer number (1-based) where the suspicion started / was confirmed. */
  suspectedAt?: number;
  confirmedAt?: number;
  clearedAfterSlip?: number;
  /** Answers (1-based) the student got right on this skill after it was confirmed: shown next to the gap, never silently dropped. */
  rightSinceConfirmed?: number[];
  /** A confirmed gap reopened as a suspicion after two later right answers, waiting for one direct question. */
  recheck?: boolean;
  /** The skill has had its one re-check; later evidence no longer reopens it. */
  recheckUsed?: boolean;
  /** Right once on a multiple-choice tap: not yet enough to call it secure. */
  tapRights?: number;
  /** Confirmed only by fast wrong answers late in the test: may be tiredness, so not taught (C13). */
  tiredness?: boolean;
  mistakes: string[];
  notes: string[];
  /** The learner explicitly needed help; use a lower prerequisite probe where possible. */
  needsSupport?: boolean;
  /** How many different questions on this skill got "I don't know this yet". */
  supportCount?: number;
  /** Confirmed because the student said they don't know it (twice, or once plus a mistake), not by two mistakes. */
  confirmedBySupport?: boolean;
}

export type Ledger = Map<string, SkillLedgerEntry>;

/**
 * Could this answered question have shown the given mistake? Only a question
 * built to catch that mistake (it lists it among its predicted wrong answers)
 * can clear a suspicion of it. Unknown mistake or no question details: yes,
 * as before.
 */
/** An answer faster than this, and wrong, counts toward "not really trying". */
const RUSHED_MS = 5_000;

/**
 * An answer picked from a few given options rather than written: multiple
 * choice, choose-several, or the two-bracket tile game (6 tiles, so a guess
 * is right about 1 time in 15). One right pick isn't enough for "secure".
 */
function isTap(audit: LotusQuestionAudit): boolean {
  const kind = audit.question?.answerKey?.diagnostics?.itemKind;
  return kind === "CHOICE" || kind === "SELECT" || audit.question?.interaction?.format === "BRACKET_BRIDGE";
}

function couldShow(audit: LotusQuestionAudit, mistake: string | undefined): boolean {
  // The dedicated check written for this suspicion settles it either way:
  // one mistake earns one fresh check, never a chain of them.
  if ((audit.questionSelection as { adaptationTag?: { kind?: string } } | undefined)?.adaptationTag?.kind === "TARGETED_CHECK") return true;
  return itemCouldShow(audit.question, mistake);
}

function itemCouldShow(item: LotusQuestion | undefined | null, mistake: string | undefined): boolean {
  const predicted = item?.answerKey?.diagnostics?.predictedMistakes;
  if (!mistake || !predicted) return true;
  return predicted.some((p) => p.mistake === mistake);
}

export function foldLedger(audits: LotusQuestionAudit[]): Ledger {
  const ledger: Ledger = new Map();
  const entry = (skillId: string): SkillLedgerEntry => {
    let e = ledger.get(skillId);
    if (!e) { e = { skillId, state: "UNTESTED", mistakes: [], notes: [] }; ledger.set(skillId, e); }
    return e;
  };
  audits.forEach((audit, i) => {
    const q = i + 1;
    const bySkill = new Map<string, LotusSkillEvidence[]>();
    for (const ev of audit.skillEvidence ?? []) bySkill.set(ev.skillId, [...(bySkill.get(ev.skillId) ?? []), ev]);
    for (const [skillId, items] of bySkill) {
      const e = entry(skillId);
      const negative = items.find((ev) => ev.kind !== "SECURE");
      if (negative) {
        const label = negative.mistake ?? (negative.kind === "DID_NOT_KNOW" ? "DID_NOT_KNOW" : "MISTAKE");
        e.notes.push(`Q${q}: ${negative.description ?? label}${negative.mistake ? ` (${negative.mistake})` : ""}`);
        if (negative.kind === "DID_NOT_KNOW") {
          // One "I don't know" is a support signal, not a gap: it earns an
          // easier prerequisite question. A second one on another question,
          // or one alongside a mistake, means the skill isn't learned yet.
          // Treat it as a gap so the student is taught from the foundations
          // instead of getting "no lesson needed".
          e.needsSupport = true;
          e.supportCount = (e.supportCount ?? 0) + 1;
          // A skill already answered right stays secure: one shown success outweighs saying "not sure".
          if ((e.state === "UNTESTED" || e.state === "SUSPECTED") && (e.supportCount >= 2 || e.mistakes.length > 0)) {
            e.state = "CONFIRMED";
            e.confirmedAt = q;
            e.confirmedBySupport = true;
          }
          continue;
        }
        // Captured before this mistake is pushed: does this skill already
        // carry a mistake from an earlier, since-cleared suspicion? If so,
        // this is a second independent negative on the skill, not a fresh
        // first-time slip — it should confirm outright rather than restart
        // the SUSPECTED/SECURE cycle and let a repeatable misconception hide
        // behind alternating right/wrong turns indefinitely. An earlier
        // "I don't know" on the skill counts as that first negative too.
        const hadPriorMistake = e.mistakes.length > 0 || (e.supportCount ?? 0) > 0;
        if (negative.mistake) e.mistakes.push(negative.mistake);
        if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt) { e.state = "CONFIRMED"; e.confirmedAt = q; }
        else if (e.state === "UNTESTED" && hadPriorMistake) { e.state = "CONFIRMED"; e.confirmedAt = q; e.confirmedBySupport = true; }
        else if (e.state === "SECURE" && hadPriorMistake) { e.state = "CONFIRMED"; e.confirmedAt = q; }
        else if (e.state === "UNTESTED" || e.state === "SECURE") { e.state = "SUSPECTED"; e.suspectedAt = q; }
      } else {
        // A re-check is settled only by a question aimed at the skill itself,
        // not by one where it is a single step among others.
        const direct = audit.question?.answerKey?.diagnostics?.skillId === skillId;
        if (e.recheck && e.state === "SUSPECTED") {
          if (direct && e.suspectedAt !== undefined && q > e.suspectedAt) {
            e.state = "SECURE"; e.recheck = false; e.clearedAfterSlip = e.confirmedAt;
            e.notes.push(`Q${q}: right on the re-check, so the earlier mistakes look like slips`);
          } else {
            e.rightSinceConfirmed = [...(e.rightSinceConfirmed ?? []), q];
            e.notes.push(`Q${q}: right, but not a direct re-check`);
          }
        } else if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt && !couldShow(audit, e.mistakes.at(-1))) {
          // C6: right, but this question couldn't produce the suspected
          // mistake (e.g. no negative numbers for a sign mistake), so it
          // can't clear it. The plan keeps a check that can.
          e.notes.push(`Q${q}: right, but it couldn't show the ${e.mistakes.at(-1)} mistake`);
        } else if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt) {
          e.state = "SECURE"; e.clearedAfterSlip = e.suspectedAt; e.notes.push(`Q${q}: right, so the Q${e.suspectedAt} mistake looks like a slip`);
        } else if (e.state === "UNTESTED" && isTap(audit) && (e.tapRights ?? 0) < 1) {
          // One right multiple-choice tap could be a 1-in-4 guess: it takes a
          // second right tap or a right typed answer to call the skill secure.
          e.tapRights = 1;
          e.notes.push(`Q${q}: right on a multiple-choice question — one more right answer needed to count it secure`);
        } else if (e.state === "UNTESTED") {
          e.state = "SECURE"; e.notes.push(`Q${q}: right`);
        } else if (e.state === "SECURE") {
          e.notes.push(`Q${q}: right`);
        }
        // CONFIRMED stays confirmed: a later success doesn't erase a confirmed
        // gap, but it is kept so the report can show the conflicting evidence.
        else if (e.state === "CONFIRMED" && e.confirmedAt !== undefined && q > e.confirmedAt) {
          e.rightSinceConfirmed = [...(e.rightSinceConfirmed ?? []), q];
          e.notes.push(`Q${q}: right after the gap was confirmed`);
          // Two right answers since confirmation cast real doubt: reopen it as
          // a suspicion so the plan asks one direct question to settle it.
          // Once per skill, so the evidence can't flip back and forth.
          if (!e.recheckUsed && e.rightSinceConfirmed.length >= 2) {
            e.state = "SUSPECTED"; e.suspectedAt = q; e.recheck = true; e.recheckUsed = true;
            e.notes.push(`Q${q}: right twice since the gap was confirmed, so it needs a re-check`);
          }
        }
      }
      if (e.state === "CONFIRMED") e.recheck = false;
    }
  });
  markTirednessGaps(audits, ledger);
  return ledger;
}

/**
 * Tired halfway (C13): careful and mostly right early, then mostly fast and
 * wrong late. A gap confirmed only by those late rushed answers may be
 * tiredness, not a gap: it becomes a suspicion marked `tiredness`, so no
 * lesson is built on it and the report says why. A gap also seen in the
 * careful part of the test stays confirmed.
 */
function markTirednessGaps(audits: LotusQuestionAudit[], ledger: Ledger): void {
  const fatigue = fatigueStart(audits);
  if (fatigue === null) return;
  const rushedWrongTurn = (q: number) => {
    const a = audits.at(q - 1);
    return !!a && q >= fatigue && (a.response?.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT";
  };
  for (const e of ledger.values()) {
    if (e.state !== "CONFIRMED") continue;
    const negativeTurns = e.notes
      .filter((n) => !n.includes(": right"))
      .map((n) => Number(/^Q(\d+):/.exec(n)?.[1]))
      .filter((q) => Number.isInteger(q) && q > 0);
    if (negativeTurns.length && negativeTurns.every(rushedWrongTurn)) {
      e.state = "SUSPECTED"; e.tiredness = true; e.suspectedAt = negativeTurns.at(-1);
    }
  }
}

/** The answer number where a careful start turns into fast wrong answers, or null if it doesn't. */
export function fatigueStart(audits: LotusQuestionAudit[]): number | null {
  const answered = audits.filter((a) => a.response && !a.response.didNotKnow);
  if (answered.length < 10) return null;
  const half = Math.floor(audits.length / 2);
  const early = audits.slice(0, half).filter((a) => a.response && !a.response.didNotKnow);
  const late = audits.slice(half).filter((a) => a.response && !a.response.didNotKnow);
  const rushedWrong = (a: LotusQuestionAudit) => (a.response?.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT";
  const earlyRight = early.filter((a) => a.verification?.status === "VERIFIED_CORRECT").length / Math.max(early.length, 1);
  const earlyRushed = early.filter(rushedWrong).length / Math.max(early.length, 1);
  const lateRushed = late.filter(rushedWrong).length / Math.max(late.length, 1);
  if (late.length < 4 || earlyRight < 0.6 || earlyRushed > 0.2 || lateRushed < 0.5) return null;
  // The first rushed wrong answer in the second half.
  const first = audits.findIndex((a, i) => i >= half && rushedWrong(a));
  return first < 0 ? null : first + 1;
}

// ---------- plan adjustments ----------

export type PlanAction =
  | { kind: "SKIP"; turn: number; reason: string }
  | {
      kind: "REPURPOSE";
      turn: number;
      purpose: "CHECK" | "AVOID" | "DESCENT" | "WIDEN";
      forSkill: string;
      reason: string;
      /** When set, the AI writes a fresh question from this spec in the background. */
      spec: SlotSpec | null;
      targetMistake?: string;
      avoidSkill?: string;
      /** Keep the turn out of the test until the AI's version is ready. */
      skipUntilReady?: boolean;
    };

export interface PlanInput {
  state: FactorisationState;
  ledger: Ledger;
  /** The question currently planned for a turn (the preferred version if one was swapped in). */
  itemAt: (turn: number) => LotusQuestion | undefined;
  /** Every question already shown, so the AI writer avoids repeating it. */
  askedItems: LotusQuestion[];
  /**
   * Whether the next open turn is off-limits too. True for background
   * updates: the browser already holds that question to show the instant the
   * student presses Submit. False right after an answer, because the reply
   * carries the new plan with it.
   */
  freezeNext?: boolean;
  /** A completed AI review explicitly asked for another probe of this skill. */
  forceCheckSkills?: string[];
}

export function nextOpenTurn(state: FactorisationState, after: number): number | null {
  for (const t of state.turns) if (t.turn > after && t.status !== "SKIPPED") return t.turn;
  return null;
}

function usesSkill(item: LotusQuestion | undefined, skillId: string): boolean {
  const d = item?.answerKey.diagnostics;
  return !!d && skillsUsedBy(d).includes(skillId);
}

/**
 * A different catalogue shape for a skill already secured on one
 * representation — e.g. the numeric "x^2 - 9" difference-of-squares slot
 * versus the coefficient "49a^2 - 25b^2" one. Reuses the existing
 * multi-shape slots in the catalogue; never authors new content. A
 * single-shape skill has no target, and the caller must fall back to KEEP.
 * `askedSlots` is the origin slot of every question actually shown so far
 * (the served item's content, not the turn number it was shown on — a
 * REPURPOSEd turn shows a different slot's content than its own base slot).
 */
function widenTargets(slots: SlotSpec[], skillId: string, askedSlots: Set<number>, max: number): Array<{ skill: string; spec: SlotSpec }> {
  return slots
    .filter((spec) => spec.skillId === skillId && !askedSlots.has(spec.slot))
    .slice(0, max)
    .map((spec) => ({ skill: skillId, spec }));
}

/**
 * Which skills to check underneath a confirmed gap, nearest first. A skill
 * already secure is solid ground, so nothing below it is visited. A skill
 * with no question available here (or one that's already shaky) is passed
 * through to the skills below it. Unlike widenTargets, this deliberately
 * does not exclude an already-asked slot: the repurposed turn always gets a
 * fresh AI-written numeric variant (never the original fixed item verbatim),
 * so revisiting the same shape to check a now-relevant prerequisite is safe
 * even when that shape was already shown earlier in the curriculum — and for
 * a skill with only one catalogue slot (e.g. FAC_GCF_VARIABLE), excluding it
 * would make that skill permanently undescendable after turn 1.
 */
function descentTargets(slots: SlotSpec[], skillId: string, ledger: Ledger, max: number) {
  const found: Array<{ skill: string; spec: SlotSpec }> = [];
  const queue = [...(findSkill(skillId)?.dependsOn ?? [])];
  const seen = new Set<string>();
  while (queue.length && found.length < max) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);
    const state = ledger.get(p)?.state ?? "UNTESTED";
    if (state === "SECURE") continue;
    if (state === "UNTESTED") {
      const spec = slots.find((s) => s.skillId === p);
      if (spec) { found.push({ skill: p, spec }); continue; }
    }
    queue.push(...(findSkill(p)?.dependsOn ?? []));
  }
  return found;
}

export function planAdjustments(input: PlanInput): PlanAction[] {
  const { state, ledger, itemAt } = input;
  const slots = curriculumFor(state.topic).slots;
  const actions: PlanAction[] = [];
  const frozenNext = input.freezeNext === false ? state.planTurn : nextOpenTurn(state, state.planTurn);
  const askedSlots = new Set(
    input.askedItems
      .map((item) => item.answerKey.diagnostics?.slot)
      .filter((slot): slot is number => slot !== undefined),
  );
  const claimed = new Set<number>();
  // Skills already given a dedicated CHECK or DESCENT probe within THIS call.
  // state.turns only reflects turns installed by a *previous* call
  // (applyPlanAction runs after planAdjustments returns), so without this,
  // forceCheckSkills and the suspicion loop below could each independently
  // check the same skill in the same replan and install two probes for one
  // mistake — and two different confirmed gaps that share an untested
  // prerequisite could each independently claim a descent turn for it.
  const checkedThisCall = new Set<string>();
  const mutable = () => state.turns.filter((t) =>
    t.turn > (frozenNext ?? state.planTurn) && t.status !== "SKIPPED" && !claimed.has(t.turn));

  // Protect the question that will check each open suspicion.
  const protectedTurns = new Set<number>();
  for (const e of ledger.values()) {
    if (e.state !== "SUSPECTED") continue;
    const check = state.turns.find((t) => t.turn >= state.planTurn &&
      // A checked replacement is deliberately SKIPPED until its background
      // writer succeeds. It still reserves this diagnostic check; otherwise
      // a second review can queue a duplicate probe while the first writes.
      ((t.purpose === "CHECK" && t.forSkill === e.skillId) ||
        (t.status !== "SKIPPED" && usesSkill(itemAt(t.turn), e.skillId))));
    if (check) protectedTurns.add(check.turn);
  }

  const pickVictim = (): number | null => {
    const candidates = mutable().filter((t) =>
      !protectedTurns.has(t.turn) && t.purpose !== "CHECK" && t.purpose !== "DESCENT" && t.purpose !== "WIDEN");
    const allSecure = candidates.filter((t) => {
      const d = itemAt(t.turn)?.answerKey.diagnostics;
      return !!d && skillsUsedBy(d).every((s) => ledger.get(s)?.state === "SECURE");
    });
    const pool = allSecure.length ? allSecure : candidates;
    // The earliest eligible slot, not the latest: an accepted change belongs
    // in the earliest useful unseen slot (COGNA 10.0/LOTUS_CONTINUOUS_DIAGNOSTIC.md
    // §8/§10 Phase 2) — picking the furthest slot here previously produced
    // the observed bug where a near-term recommendation installed at
    // Q24/Q25 instead, far past where the evidence was actually needed.
    return pool.length ? pool[0]!.turn : null;
  };

  // A closure-stage AI recommendation is an explicit request for fresh
  // evidence. Keep the question already visible to the student, but reserve
  // the next mutable future slot for an AI-written check of the same skill.
  for (const skillId of input.forceCheckSkills ?? []) {
    const spec = slots.find((s) => s.skillId === skillId);
    const evidence = ledger.get(skillId);
    if (!spec || !evidence || claimed.has(spec.slot)) continue;
    // A duplicate request for the same skill (e.g. a code-instant suspicion
    // and a later AI review both asking for the same check) must never
    // install a second probe — one mistake earns at most one fresh check.
    // Only an already-installed dedicated CHECK counts here; a turn that
    // merely happens to use the skill among its other tagged skills is not
    // a substitute for the AI's specifically requested probe.
    const alreadyChecked = checkedThisCall.has(skillId) || state.turns.some((t) =>
      t.purpose === "CHECK" && t.forSkill === skillId);
    if (alreadyChecked) continue;
    const turn = pickVictim();
    if (turn === null) continue;
    claimed.add(turn);
    protectedTurns.add(turn);
    checkedThisCall.add(skillId);
    actions.push({
      kind: "REPURPOSE",
      turn,
      purpose: "CHECK",
      forSkill: skillId,
      spec,
      targetMistake: evidence.mistakes.at(-1),
      reason: `The AI review requested a fresh check of ${skillName(skillId)}; an unseen future slot is being rewritten for that evidence.`,
    });
  }

  // 1. Every suspicion needs a later question that can confirm or clear it.
  for (const e of ledger.values()) {
    // A support signal is not evidence of a mathematical gap, but it does
    // justify one lower-prerequisite question. Handle it before the
    // suspicion-only confirmation path, or a pure "I don't know" remains
    // UNTESTED and can never receive the promised support action.
    if (e.needsSupport) {
      const support = descentTargets(slots, e.skillId, ledger, 1)[0];
      const supportAlreadyReserved = support && (checkedThisCall.has(support.skill) || state.turns.some((t) =>
        t.purpose === "DESCENT" && t.forSkill === support.skill));
      if (support && !supportAlreadyReserved) {
        const turn = pickVictim();
        if (turn !== null) {
          claimed.add(turn);
          protectedTurns.add(turn);
          checkedThisCall.add(support.skill);
          actions.push({
            kind: "REPURPOSE", turn, purpose: "DESCENT", forSkill: support.skill,
            spec: support.spec,
            reason: `The student said they do not know this yet; checking the easier prerequisite ${skillName(support.skill)} next.`,
          });
        }
      }
      if (support) continue;
      // "I don't know" alone never earns a same-skill confirmation probe.
      if (e.state !== "SUSPECTED") continue;
    }
    if (e.state !== "SUSPECTED") continue;
    // A re-check needs a question aimed at the skill: one that merely uses it
    // as a step can't settle it (foldLedger only clears it on a direct item).
    // A suspicion gets one dedicated check, ever (an answered one counts too);
    // a re-check needs its own, still ahead.
    const hasCheck = checkedThisCall.has(e.skillId) || state.turns.some((t) =>
      (t.purpose === "CHECK" && t.forSkill === e.skillId && (!e.recheck || t.turn >= state.planTurn)) ||
      (t.turn >= state.planTurn &&
        (t.status !== "SKIPPED" && (e.recheck
          ? itemAt(t.turn)?.answerKey.diagnostics?.skillId === e.skillId
          // C6: the later question must be able to show the suspected mistake.
          : usesSkill(itemAt(t.turn), e.skillId) && itemCouldShow(itemAt(t.turn), e.mistakes.at(-1))))));
    if (hasCheck) continue;
    const spec = slots.find((s) => s.skillId === e.skillId);
    if (!spec) continue;
    const turn = pickVictim();
    if (turn === null) continue;
    claimed.add(turn);
    protectedTurns.add(turn);
    checkedThisCall.add(e.skillId);
    actions.push({
      kind: "REPURPOSE", turn, purpose: "CHECK", forSkill: e.skillId, spec,
      targetMistake: e.mistakes.at(-1),
      reason: e.recheck
        ? `Re-checks ${skillName(e.skillId)}: it was confirmed earlier, but answered right twice since.`
        : `Checks the suspected gap in ${skillName(e.skillId)} a second time.`,
    });
  }

  // 2. A confirmed gap: remove or reroute later questions that depend on it, then go down.
  for (const e of ledger.values()) {
    if (e.state !== "CONFIRMED" || state.handledConfirmed.includes(e.skillId)) continue;
    const freed: number[] = [];
    for (const t of mutable()) {
      if (protectedTurns.has(t.turn)) continue;
      const d = itemAt(t.turn)?.answerKey.diagnostics;
      if (!d) continue;
      const reason = `Not tested: it depends on ${skillName(e.skillId)}, which isn't secure yet.`;
      if (dependsOnTransitively(d.skillId, e.skillId)) {
        claimed.add(t.turn);
        actions.push({ kind: "SKIP", turn: t.turn, reason });
        freed.push(t.turn);
      } else if (skillsUsedBy(d).some((u) => dependsOnTransitively(u, e.skillId))) {
        claimed.add(t.turn);
        const spec = slots.find((s) => s.slot === t.slot) ?? null;
        actions.push({
          kind: "REPURPOSE", turn: t.turn, purpose: "AVOID", forSkill: d.skillId, spec,
          avoidSkill: e.skillId, skipUntilReady: true,
          reason: `Rewritten to test ${skillName(d.skillId)} without needing ${skillName(e.skillId)}.`,
        });
      }
    }
    // Going down: are the skills underneath solid? Two different confirmed
    // skills can share the same untested prerequisite (they're independent
    // ledger entries, so nothing else stops both from picking it); skip one
    // already claimed for a probe this call rather than installing a second
    // turn for the same hypothesis.
    for (const { skill: p, spec } of descentTargets(slots, e.skillId, ledger, 2)) {
      if (checkedThisCall.has(p)) continue;
      const turn = freed.shift() ?? pickVictim();
      if (turn === null) break;
      claimed.add(turn);
      // A freed turn was just marked SKIP above; the descent question takes it back.
      const skipIndex = actions.findIndex((a) => a.kind === "SKIP" && a.turn === turn);
      if (skipIndex >= 0) actions.splice(skipIndex, 1);
      checkedThisCall.add(p);
      actions.push({
        kind: "REPURPOSE", turn, purpose: "DESCENT", forSkill: p, spec,
        reason: `Going down: is ${skillName(p)} solid underneath ${skillName(e.skillId)}?`,
      });
    }
    state.handledConfirmed.push(e.skillId);
  }

  // 3. A skill secured from a single correct answer: a fresh, different
  // representation can confirm transfer rather than one memorized shape.
  // Never revisits a skill (found a target or not) once considered, so one
  // secure skill can claim at most one later slot.
  for (const e of ledger.values()) {
    if (e.state !== "SECURE" || e.clearedAfterSlip || e.notes.length !== 1) continue;
    if (state.handledBroadened.includes(e.skillId)) continue;
    state.handledBroadened.push(e.skillId);
    const target = widenTargets(slots, e.skillId, askedSlots, 1)[0];
    if (!target) continue;
    const turn = pickVictim();
    if (turn === null) continue;
    claimed.add(turn);
    protectedTurns.add(turn);
    actions.push({
      kind: "REPURPOSE", turn, purpose: "WIDEN", forSkill: target.skill, spec: target.spec,
      reason: `${skillName(e.skillId)} was right once; a different representation of the same skill can confirm transfer rather than one memorized shape.`,
    });
  }
  return actions;
}

// ---------- catch-up ----------

/** Most a catch-up asks, and the fewest worth sending. */
export const CATCH_UP_MAX = 8;
export const CATCH_UP_MIN = 5;

/**
 * A catch-up's questions: two per open skill (so a gap can be confirmed or
 * cleared), most foundational first, topped up toward five with the skills
 * they build on (and theirs), and never more than eight. A chapter whose
 * skill chain is short can give fewer than five. Empty when the topic has no question
 * for any of them — the caller then runs the full test.
 */
export function catchUpSlots(topic: LotusPlannedTopic, focusSkills: string[]): SlotSpec[] {
  const slots = curriculumFor(topic).slots;
  const focus = [...new Set(focusSkills)].filter((id) => slots.some((s) => s.skillId === id)).sort((a, b) => depth(a) - depth(b));
  const chosen: SlotSpec[] = [];
  for (const skill of focus) {
    const own = slots.filter((s) => s.skillId === skill);
    chosen.push(own[0]!, own[1] ?? own[0]!);
  }
  if (!chosen.length) return [];
  // Nearest prerequisites first, then theirs, until there are five questions.
  const seen = new Set(focus);
  const queue = focus.flatMap((id) => findSkill(id)?.dependsOn ?? []);
  while (queue.length && chosen.length < CATCH_UP_MIN) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const spec = slots.find((s) => s.skillId === id);
    if (spec) chosen.unshift(spec);
    queue.push(...(findSkill(id)?.dependsOn ?? []));
  }
  return chosen.slice(0, CATCH_UP_MAX);
}

// ---------- report ----------

export function depth(skillId: string, seen = new Set<string>()): number {
  if (seen.has(skillId)) return 0;
  seen.add(skillId);
  const deps = findSkill(skillId)?.dependsOn ?? [];
  return deps.length ? 1 + Math.max(...deps.map((d) => depth(d, seen))) : 0;
}

/** Confirmed gaps, most foundational first — [0] is the report's starting point. */
export function confirmedByDepth(ledger: Ledger): SkillLedgerEntry[] {
  return [...ledger.values()].filter((e) => e.state === "CONFIRMED").sort((a, b) => depth(a.skillId) - depth(b.skillId));
}

/**
 * C2: is any AI review of this test still running and not yet well past its
 * deadline? A lesson chosen now would miss its evidence and then be kept for
 * good, so lesson creation waits (the classroom retries for two minutes).
 * A review a minute past its deadline isn't waited for.
 */
export function reviewsStillRunning(session: Pick<LotusSessionView, "audits">, now = Date.now()): boolean {
  return (session.audits ?? []).some((a) => a.analysisStatus === "PENDING" &&
    (!a.analysisDeadlineAt || now < Date.parse(a.analysisDeadlineAt) + 60_000));
}

/** The foundation skill taught when one sign mistake runs through several gaps. */
export const SIGN_ROOT_SKILL = "FND_SIGN_MUL_DIV";
const isSignMistake = (code: string) => /SIGN/.test(code);

/**
 * Where teaching should start. Normally the most foundational confirmed gap;
 * but when the same sign mistake confirms two or more gaps, they share one
 * cause, so teaching starts with signed numbers and `rootOf` names the gaps
 * it covers. The report, the class report and the lesson all use this, so
 * they never disagree about where to start.
 */
export function teachingStart(ledger: Ledger): (SkillLedgerEntry & { rootOf?: string[] }) | undefined {
  const confirmed = confirmedByDepth(ledger);
  const signGaps = confirmed.filter((e) => e.mistakes.some(isSignMistake));
  if (signGaps.length < 2) return confirmed[0];
  return {
    skillId: SIGN_ROOT_SKILL,
    state: "CONFIRMED",
    mistakes: signGaps.flatMap((e) => e.mistakes.filter(isSignMistake)),
    notes: signGaps.flatMap((e) => e.notes.filter((n) => !n.includes(": right"))),
    rootOf: signGaps.map((e) => e.skillId),
  };
}

export function buildFactorisationReport(args: {
  ledger: Ledger;
  state: FactorisationState;
  pendingAnalyses: number;
  /** The answered turns, for checking whether the child was really trying. */
  audits?: LotusQuestionAudit[];
}): LotusFinalReport {
  const curriculum = curriculumFor(args.state.topic);
  // Not trying: most answers very fast (under 5 s) and wrong. Such a test
  // can't show what the child knows, so it gives no gap to teach.
  const answered = (args.audits ?? []).filter((a) => a.response && !a.response.didNotKnow);
  const rushedWrong = answered.filter((a) => (a.response?.responseTimeMs ?? Infinity) < RUSHED_MS && a.verification?.status !== "VERIFIED_CORRECT");
  const rushed = answered.length >= 8 && rushedWrong.length / answered.length >= 0.6;
  const slotSkill = (slot: number) => curriculum.slots.find((s) => s.slot === slot)?.skillId;
  const entries = [...args.ledger.values()];
  const confirmed = confirmedByDepth(args.ledger);
  const suspected = entries.filter((e) => e.state === "SUSPECTED");
  const secure = entries.filter((e) => e.state === "SECURE").sort((a, b) => depth(b.skillId) - depth(a.skillId));

  const skipped = args.state.turns.filter((t) => t.status === "SKIPPED" && t.reason);
  // A skill tested on another question isn't "not tested", even if one of its questions was removed.
  const notTested = [...new Map(skipped.flatMap((t) => {
    const skill = slotSkill(t.slot);
    if (!skill || args.ledger.has(skill)) return [];
    return [[skill, `${skillName(skill)} — ${t.reason!.replace(/^Not tested: /, "not tested: ")}`] as const];
  })).values()];

  const start = confirmed[0];
  // A catch-up is judged only on the skills it was sent for: all of them secure, nothing still suspected, means caught up.
  const focus = args.state.focusSkills;
  const caughtUp = focus?.length
    ? focus.every((id) => args.ledger.get(id)?.state === "SECURE") && suspected.length === 0
    : suspected.length === 0 && secure.length >= 5;
  const outcome: LotusFinalReport["outcome"] = rushed ? "INSUFFICIENT_OR_CONFLICTING"
    : confirmed.length ? "SOLID_GAP" : caughtUp ? "ADVANCEMENT" : "INSUFFICIENT_OR_CONFLICTING";
  // One cause, many gaps: the same sign mistake confirming several gaps
  // points to signed numbers, which is where teaching should start.
  const root = teachingStart(args.ledger);
  const signGaps = root?.rootOf ? confirmed.filter((e) => root.rootOf!.includes(e.skillId)) : [];
  const signRoot = signGaps.length >= 2;

  const startingPoint = rushed
    ? `This test doesn't tell us much: ${rushedWrong.length} of ${answered.length} answers were very fast (under ${RUSHED_MS / 1000} seconds) and wrong. Try again when the child can focus.`
    : signRoot
    ? `Start with signs with negative numbers: the same sign mistake shows up in ${signGaps.map((e) => skillName(e.skillId).toLowerCase()).join(", ")}.`
    : start
    ? `Start with ${skillName(start.skillId).toLowerCase()}. ${start.notes.filter((n) => !n.includes(": right")).slice(0, 2).join(" · ")}`
    : outcome === "ADVANCEMENT"
      ? focus?.length
        ? `Caught up: ${focus.map((id) => skillName(id).toLowerCase()).join(", ")} ${focus.length === 1 ? "is" : "are"} now secure.`
        : `${curriculum.name} looks secure across the skills tested. Move on to harder questions or the next topic.`
      : suspected.length
        ? "No gap was confirmed. Review the suspected areas below before deciding where to start."
        : "Not enough answers to show where to start yet. Check again with a few fresh questions.";

  const limitations = [
    "Experimental: questions were written and checked by AI and code, without human review.",
    "A gap is only confirmed when the same skill goes wrong on two different questions, or the student says they don't know it yet on two.",
  ];
  if (args.pendingAnalyses > 0) limitations.push(`${args.pendingAnalyses} answer(s) didn't finish their deeper AI review, so any mistake code couldn't explain is missing.`);
  if (args.state.fastSkips > 0) limitations.push(`${args.state.fastSkips} question(s) were skipped quickly with nothing written. Those aren't counted as evidence either way.`);
  if (rushed) limitations.unshift("Most answers were very fast and wrong, so the gaps below may come from rushing, not from what the child knows. No lesson is suggested from this test.");
  const tiredFrom = args.audits ? fatigueStart(args.audits) : null;
  if (!rushed && tiredFrom !== null) limitations.unshift(`From Q${tiredFrom} the answers got much faster and more often wrong, which may be tiredness. Gaps seen only in that part are marked unclear, not taught.`);

  const summaries: LotusSkillSummary[] = [
    ...entries.map((e) => ({ skillId: e.skillId, name: skillName(e.skillId), state: e.state, evidence: e.notes })),
    ...skipped
      .map((t) => slotSkill(t.slot))
      .filter((id): id is string => !!id && !args.ledger.has(id))
      .map((id) => ({ skillId: id, name: skillName(id), state: "NOT_TESTED_DEPENDENCY" as const, evidence: [] })),
  ].filter((s, i, all) => all.findIndex((o) => o.skillId === s.skillId) === i);

  return {
    outcome,
    startingPoint,
    observedStrengths: secure.map((e) => skillName(e.skillId) + (e.clearedAfterSlip ? " (an earlier mistake looked like a slip)" : "")),
    uncertainAreas: [
      ...suspected.map((e) => e.tiredness
        ? `${skillName(e.skillId)}: unclear — the mistakes came only from fast answers late in the test, which may be tiredness. Check again when the child is fresh.`
        : e.recheck
        ? `${skillName(e.skillId)}: unclear — confirmed earlier, but answered right on ${(e.rightSinceConfirmed ?? []).map((q) => `Q${q}`).join(", ")} since, and the re-check question wasn't reached. Check again before teaching it.`
        : `${skillName(e.skillId)}: one mistake, not confirmed — ${e.notes.at(-1) ?? ""}`),
      // C10: slips and unreadable answers the AI noticed. Never gaps, but the teacher should see them.
      ...(args.audits ?? []).flatMap((a, i) => {
        const kind = a.conclusion?.mistakeKind;
        if (a.analysisStatus !== "COMPLETE" || (kind !== "SLIP" && kind !== "UNREADABLE")) return [];
        const what = kind === "SLIP" ? "Possible slip" : "Answer couldn't be read";
        return [`${what} on Q${i + 1} (not counted as a gap): ${(a.conclusion.mistakeDescription ?? "").trim() || "see the answer"}`];
      }),
      ...confirmed.filter((e) => e.rightSinceConfirmed?.length).map((e) =>
        `${skillName(e.skillId)}: confirmed earlier, but answered right on ${e.rightSinceConfirmed!.map((q) => `Q${q}`).join(", ")} since — check again before teaching it.`),
      ...entries.filter((e) => e.state === "UNTESTED" && e.tapRights).map((e) =>
        `${skillName(e.skillId)}: right once on a multiple-choice question, not enough to call it secure yet.`),
    ],
    evidenceSummary: [
      ...(signRoot ? [`One cause behind ${signGaps.length} gaps: signs with negative numbers. Teaching the sign rules first is likely to help all of them.`] : []),
      ...confirmed.map((e) => `${skillName(e.skillId)} — ${e.confirmedBySupport ? "not learned yet" : "confirmed gap"}. ${e.notes.join(" · ")}`),
    ],
    recommendedNextStep: rushed
      ? "Retake the diagnostic when the child is settled; this one was too rushed to act on."
      : signRoot
      ? "Teach the rules for signs with negative numbers first, then re-check these skills with fresh questions."
      : start
      ? `Teach ${skillName(start.skillId).toLowerCase()} directly, then re-check it with a fresh question.`
      : suspected[0]
        ? `Give one more question on ${skillName(suspected[0].skillId).toLowerCase()} to see whether the mistake repeats.`
        : `No teaching gap found in ${curriculum.name.toLowerCase()} from this test.`,
    limitations,
    notTested,
    skills: summaries.sort((a, b) => curriculum.skills.findIndex((s) => s.id === a.skillId) - curriculum.skills.findIndex((s) => s.id === b.skillId)),
  };
}

// ---------- stopping rule ----------

/** Pilot time box for the factorisation diagnostic. LOTUS_TIME_LIMIT_MINUTES overrides it. */
export function factorisationTimeLimitSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = Number(env.LOTUS_TIME_LIMIT_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60;
}

/** Fewest answers before a starting point may end the test: one confirmed gap needs two questions, and its prerequisites need checking. */
export const MIN_ANSWERS_FOR_EARLY_STOP = 8;

export type FactorisationStop =
  | { reason: "TIME_LIMIT"; note: string }
  | { reason: "STARTING_POINT_FOUND"; skillId: string; note: string };

/**
 * Whether the diagnostic should end now, with the answer just given counted.
 *
 * - TIME_LIMIT: the pilot's 15 minutes are up.
 * - STARTING_POINT_FOUND: the most foundational confirmed gap is the real
 *   starting point — every skill it depends on has been tested and is
 *   secure, so more questions wouldn't move the start any lower. A gap whose
 *   prerequisites are untested or shaky keeps the test going, because the
 *   plan probes those next.
 *
 * Pure and deterministic: it reads only the code-marked evidence ledger.
 */
export function factorisationStopReason(
  audits: LotusQuestionAudit[],
  elapsedSeconds: number,
  timeLimitSeconds: number = factorisationTimeLimitSeconds(),
): FactorisationStop | null {
  const answered = audits.length;
  if (elapsedSeconds >= timeLimitSeconds) {
    return {
      reason: "TIME_LIMIT",
      note: `The ${Math.round(timeLimitSeconds / 60)}-minute time limit ended the test after ${answered} question${answered === 1 ? "" : "s"}. Skills planned after that point weren't reached.`,
    };
  }
  if (answered < MIN_ANSWERS_FOR_EARLY_STOP) return null;
  const ledger = foldLedger(audits);
  const start = confirmedByDepth(ledger)[0];
  if (!start) return null;
  const prerequisites = findSkill(start.skillId)?.dependsOn ?? [];
  if (!prerequisites.every((id) => ledger.get(id)?.state === "SECURE")) return null;
  return {
    reason: "STARTING_POINT_FOUND",
    skillId: start.skillId,
    note: `Lotus found the starting point after ${answered} questions: ${skillName(start.skillId).toLowerCase()} went wrong twice while everything it builds on was secure, so the test ended early.`,
  };
}
