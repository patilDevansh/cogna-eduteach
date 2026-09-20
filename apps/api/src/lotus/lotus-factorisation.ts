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
  LotusSkillEvidence,
  LotusSkillState,
  LotusSkillSummary,
  LotusStudentResponse,
} from "@cogna/shared";
import {
  algebraicallyEqual,
  classifyFactorisation,
  classifySimplification,
  factorisationDefect,
  nonConstantFactorCount,
  normalizeMathText,
  sameFactorisation,
} from "./lotus-algebra";
import {
  FACTORISATION_SKILLS,
  FACTORISATION_SLOTS,
  type SlotSpec,
  dependsOnTransitively,
  findFactorisationSkill,
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
    status, correctAnswer: key, method: d.itemKind === "CHOICE" ? "AI_AUTHORED_REFERENCE" : "DETERMINISTIC_ALGEBRA", explanation,
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

  const expression = d.expression!;
  const verdict = d.itemKind === "SIMPLIFY" ? classifySimplification(answer, expression, key) : classifyFactorisation(answer, expression);
  if (verdict === "CORRECT") {
    return { verification: verification("VERIFIED_CORRECT", `Equal to ${expression} and fully ${d.itemKind === "SIMPLIFY" ? "simplified" : "factorised"} — checked by expanding.`), evidence: secureAll(d), fastSkip: false, needsAnalysis: false };
  }
  if (verdict === "UNREADABLE") {
    return { verification: verification("NOT_DETERMINISTIC", "The answer couldn't be read as an expression, so the AI review will interpret it."), evidence: [], fastSkip: false, needsAnalysis: true };
  }
  const matches = (p: { answer: string }) => d.itemKind === "SIMPLIFY"
    ? safe(() => algebraicallyEqual(p.answer, answer))
    : sameFactorisation(p.answer, answer);
  const predicted = d.predictedMistakes.find(matches);
  if (verdict === "UNFINISHED") {
    const code = predicted?.mistake ?? unfinishedCode(answer);
    return {
      verification: verification("VERIFIED_UNFINISHED", `Equal to ${expression}, but not fully ${d.itemKind === "SIMPLIFY" ? "simplified" : "factorised"}.`),
      evidence: [{ skillId: ownerOfMistake(code, d), kind: "UNFINISHED", mistake: code, source: "INSTANT", description: `Wrote ${answer}.` }],
      fastSkip: false,
      needsAnalysis: false,
    };
  }
  return {
    verification: verification("VERIFIED_INCORRECT", `Not equal to ${expression} — checked by expanding.`),
    evidence: predicted ? [{ skillId: ownerOfMistake(predicted.mistake, d), kind: "MISTAKE", mistake: predicted.mistake, source: "INSTANT", description: `Wrote ${answer}.` }] : [],
    fastSkip: false,
    needsAnalysis: !predicted,
  };
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
): LotusSkillEvidence[] {
  const d = question.answerKey.diagnostics;
  // Models sometimes send the step as a string; anything that isn't a step number means "no wrong step".
  const step = typeof firstWrongStep === "string" ? Number(firstWrongStep) : firstWrongStep;
  if (!d || typeof step !== "number" || !Number.isInteger(step) || step < 1) return existing;
  if (existing.length > 0) return existing;
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
  mistakes: string[];
  notes: string[];
  /** The learner explicitly needed help; use a lower prerequisite probe where possible. */
  needsSupport?: boolean;
}

export type Ledger = Map<string, SkillLedgerEntry>;

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
          // Support is an instructional signal, not mathematical failure.
          // Preserve an existing suspicion, but never create or confirm a
          // gap from repeated "I don't know" responses alone.
          e.needsSupport = true;
          continue;
        }
        if (negative.mistake) e.mistakes.push(negative.mistake);
        if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt) { e.state = "CONFIRMED"; e.confirmedAt = q; }
        else if (e.state === "UNTESTED" || e.state === "SECURE") { e.state = "SUSPECTED"; e.suspectedAt = q; }
      } else {
        if (e.state === "SUSPECTED" && e.suspectedAt !== undefined && q > e.suspectedAt) {
          e.state = "SECURE"; e.clearedAfterSlip = e.suspectedAt; e.notes.push(`Q${q}: right, so the Q${e.suspectedAt} mistake looks like a slip`);
        } else if (e.state === "UNTESTED") {
          e.state = "SECURE"; e.notes.push(`Q${q}: right`);
        } else if (e.state === "SECURE") {
          e.notes.push(`Q${q}: right`);
        }
        // CONFIRMED stays confirmed: a later success doesn't erase a confirmed gap.
      }
    }
  });
  return ledger;
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

function fingerprint(item: Omit<LotusQuestion, "id">): string {
  return normalizeMathText(item.answerKey.diagnostics?.expression ?? item.prompt).toLowerCase();
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
function widenTargets(skillId: string, askedSlots: Set<number>, max: number): Array<{ skill: string; spec: SlotSpec }> {
  return FACTORISATION_SLOTS
    .filter((spec) => spec.skillId === skillId && !askedSlots.has(spec.slot))
    .slice(0, max)
    .map((spec) => ({ skill: skillId, spec }));
}

/**
 * Which skills to check underneath a confirmed gap, nearest first. A skill
 * already secure is solid ground, so nothing below it is visited. A skill
 * with no question available here (or one that's already shaky) is passed
 * through to the skills below it.
 */
function descentTargets(skillId: string, ledger: Ledger, _asked: Set<string>, max: number) {
  const found: Array<{ skill: string; spec: SlotSpec }> = [];
  const queue = [...(findFactorisationSkill(skillId)?.dependsOn ?? [])];
  const seen = new Set<string>();
  while (queue.length && found.length < max) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);
    const state = ledger.get(p)?.state ?? "UNTESTED";
    if (state === "SECURE") continue;
    if (state === "UNTESTED") {
      const spec = FACTORISATION_SLOTS.find((s) => s.skillId === p);
      if (spec) { found.push({ skill: p, spec }); continue; }
    }
    queue.push(...(findFactorisationSkill(p)?.dependsOn ?? []));
  }
  return found;
}

export function planAdjustments(input: PlanInput): PlanAction[] {
  const { state, ledger, itemAt } = input;
  const actions: PlanAction[] = [];
  const frozenNext = input.freezeNext === false ? state.planTurn : nextOpenTurn(state, state.planTurn);
  const asked = new Set(input.askedItems.map(fingerprint));
  const askedSlots = new Set(
    input.askedItems
      .map((item) => item.answerKey.diagnostics?.slot)
      .filter((slot): slot is number => slot !== undefined),
  );
  const claimed = new Set<number>();
  // Skills already given a CHECK action within THIS call. state.turns only
  // reflects turns installed by a *previous* call (applyPlanAction runs
  // after planAdjustments returns), so without this, forceCheckSkills and
  // the suspicion loop below could each independently check the same skill
  // in the same replan and install two probes for one mistake.
  const checkedThisCall = new Set<string>();
  const mutable = () => state.turns.filter((t) =>
    t.turn > (frozenNext ?? state.planTurn) && t.status !== "SKIPPED" && !claimed.has(t.turn));

  // Protect the question that will check each open suspicion.
  const protectedTurns = new Set<number>();
  for (const e of ledger.values()) {
    if (e.state !== "SUSPECTED") continue;
    const check = state.turns.find((t) => t.turn >= state.planTurn && t.status !== "SKIPPED" &&
      ((t.purpose === "CHECK" && t.forSkill === e.skillId) || usesSkill(itemAt(t.turn), e.skillId)));
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
    const spec = FACTORISATION_SLOTS.find((s) => s.skillId === skillId);
    const evidence = ledger.get(skillId);
    if (!spec || !evidence || claimed.has(spec.slot)) continue;
    // A duplicate request for the same skill (e.g. a code-instant suspicion
    // and a later AI review both asking for the same check) must never
    // install a second probe — one mistake earns at most one fresh check.
    // Only an already-installed dedicated CHECK counts here; a turn that
    // merely happens to use the skill among its other tagged skills is not
    // a substitute for the AI's specifically requested probe.
    const alreadyChecked = checkedThisCall.has(skillId) || state.turns.some((t) =>
      t.status !== "SKIPPED" && t.purpose === "CHECK" && t.forSkill === skillId);
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
    if (e.state !== "SUSPECTED") continue;
    const hasCheck = checkedThisCall.has(e.skillId) || state.turns.some((t) => t.turn >= state.planTurn && t.status !== "SKIPPED" &&
      ((t.purpose === "CHECK" && t.forSkill === e.skillId) || usesSkill(itemAt(t.turn), e.skillId)));
    if (hasCheck) continue;
    if (e.needsSupport) {
      const support = descentTargets(e.skillId, ledger, asked, 1)[0];
      if (support) {
        const turn = pickVictim();
        if (turn !== null) {
          claimed.add(turn);
          protectedTurns.add(turn);
          actions.push({
            kind: "REPURPOSE", turn, purpose: "DESCENT", forSkill: support.skill,
            spec: support.spec,
            reason: `The student said they do not know this yet; checking the easier prerequisite ${skillName(support.skill)} next.`,
          });
          continue;
        }
      }
    }
    const spec = FACTORISATION_SLOTS.find((s) => s.skillId === e.skillId);
    if (!spec) continue;
    const turn = pickVictim();
    if (turn === null) continue;
    claimed.add(turn);
    protectedTurns.add(turn);
    checkedThisCall.add(e.skillId);
    actions.push({
      kind: "REPURPOSE", turn, purpose: "CHECK", forSkill: e.skillId, spec,
      targetMistake: e.mistakes.at(-1),
      reason: `Checks the suspected gap in ${skillName(e.skillId)} a second time.`,
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
        const spec = FACTORISATION_SLOTS.find((s) => s.slot === t.slot) ?? null;
        actions.push({
          kind: "REPURPOSE", turn: t.turn, purpose: "AVOID", forSkill: d.skillId, spec,
          avoidSkill: e.skillId, skipUntilReady: true,
          reason: `Rewritten to test ${skillName(d.skillId)} without needing ${skillName(e.skillId)}.`,
        });
      }
    }
    // Going down: are the skills underneath solid?
    for (const { skill: p, spec } of descentTargets(e.skillId, ledger, asked, 2)) {
      const turn = freed.shift() ?? pickVictim();
      if (turn === null) break;
      claimed.add(turn);
      // A freed turn was just marked SKIP above; the descent question takes it back.
      const skipIndex = actions.findIndex((a) => a.kind === "SKIP" && a.turn === turn);
      if (skipIndex >= 0) actions.splice(skipIndex, 1);
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
    const target = widenTargets(e.skillId, askedSlots, 1)[0];
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

// ---------- report ----------

function depth(skillId: string, seen = new Set<string>()): number {
  if (seen.has(skillId)) return 0;
  seen.add(skillId);
  const deps = findFactorisationSkill(skillId)?.dependsOn ?? [];
  return deps.length ? 1 + Math.max(...deps.map((d) => depth(d, seen))) : 0;
}

export function buildFactorisationReport(args: {
  ledger: Ledger;
  state: FactorisationState;
  pendingAnalyses: number;
}): LotusFinalReport {
  const entries = [...args.ledger.values()];
  const confirmed = entries.filter((e) => e.state === "CONFIRMED").sort((a, b) => depth(a.skillId) - depth(b.skillId));
  const suspected = entries.filter((e) => e.state === "SUSPECTED");
  const secure = entries.filter((e) => e.state === "SECURE").sort((a, b) => depth(b.skillId) - depth(a.skillId));

  const skipped = args.state.turns.filter((t) => t.status === "SKIPPED" && t.reason);
  // A skill tested on another question isn't "not tested", even if one of its questions was removed.
  const notTested = [...new Map(skipped.flatMap((t) => {
    const slotSkill = FACTORISATION_SLOTS.find((s) => s.slot === t.slot)?.skillId;
    if (!slotSkill || args.ledger.has(slotSkill)) return [];
    return [[slotSkill, `${skillName(slotSkill)} — ${t.reason!.replace(/^Not tested: /, "not tested: ")}`] as const];
  })).values()];

  const start = confirmed[0];
  const outcome: LotusFinalReport["outcome"] = confirmed.length
    ? "SOLID_GAP"
    : suspected.length === 0 && secure.length >= 5 ? "ADVANCEMENT" : "INSUFFICIENT_OR_CONFLICTING";

  const startingPoint = start
    ? `Start with ${skillName(start.skillId).toLowerCase()}. ${start.notes.filter((n) => !n.includes(": right")).slice(0, 2).join(" · ")}`
    : outcome === "ADVANCEMENT"
      ? "Factorisation looks secure across the skills tested. Move on to harder factorisation or the next topic."
      : "No gap was confirmed. Review the suspected areas below before deciding where to start.";

  const limitations = [
    "Experimental: questions were written and checked by AI and code, without human review.",
    "A gap is only confirmed when the same skill goes wrong on two different questions.",
  ];
  if (args.pendingAnalyses > 0) limitations.push(`${args.pendingAnalyses} answer(s) didn't finish their deeper AI review, so any mistake code couldn't explain is missing.`);
  if (args.state.fastSkips > 0) limitations.push(`${args.state.fastSkips} question(s) were skipped quickly with nothing written. Those aren't counted as evidence either way.`);

  const summaries: LotusSkillSummary[] = [
    ...entries.map((e) => ({ skillId: e.skillId, name: skillName(e.skillId), state: e.state, evidence: e.notes })),
    ...skipped
      .map((t) => FACTORISATION_SLOTS.find((s) => s.slot === t.slot)?.skillId)
      .filter((id): id is string => !!id && !args.ledger.has(id))
      .map((id) => ({ skillId: id, name: skillName(id), state: "NOT_TESTED_DEPENDENCY" as const, evidence: [] })),
  ].filter((s, i, all) => all.findIndex((o) => o.skillId === s.skillId) === i);

  return {
    outcome,
    startingPoint,
    observedStrengths: secure.map((e) => skillName(e.skillId) + (e.clearedAfterSlip ? " (an earlier mistake looked like a slip)" : "")),
    uncertainAreas: suspected.map((e) => `${skillName(e.skillId)}: one mistake, not confirmed — ${e.notes.at(-1) ?? ""}`),
    evidenceSummary: confirmed.map((e) => `${skillName(e.skillId)} — confirmed gap. ${e.notes.join(" · ")}`),
    recommendedNextStep: start
      ? `Teach ${skillName(start.skillId).toLowerCase()} directly, then re-check it with a fresh question.`
      : suspected[0]
        ? `Give one more question on ${skillName(suspected[0].skillId).toLowerCase()} to see whether the mistake repeats.`
        : "No teaching gap found in factorisation from this test.",
    limitations,
    notTested,
    skills: summaries.sort((a, b) => FACTORISATION_SKILLS.findIndex((s) => s.id === a.skillId) - FACTORISATION_SKILLS.findIndex((s) => s.id === b.skillId)),
  };
}
