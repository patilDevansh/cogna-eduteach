/**
 * What the review-probe results say about the rules that read the AI review.
 *
 * The rules in lotus-factorisation.ts depend on three things about a real review of a wrong answer:
 *   1. it names a step for a real gap (so the gap becomes skill evidence);
 *   2. it calls a slip a slip, a guess a guess and an unreadable answer unreadable (so none becomes a gap);
 *   3. it does not call a wrong answer a "misunderstanding" and then name no step: that answer is
 *      "unexplained" (foldLedger counts it, the plan looks underneath, and two of them block an
 *      all-clear), so on a child who really did only slip it would wrongly keep the test open.
 *
 * `isUnexplained` is the same condition foldLedger uses: verified wrong or unfinished, the review
 * called it a misunderstanding, and no skill got evidence.
 */
export interface ReviewResultLike {
  id: string;
  nature: string;
  codeVerdict?: string | null;
  mistakeKind: string | null;
  firstWrongStep: number | null;
  landedSkill: string | null;
}

export function isUnexplained(r: ReviewResultLike): boolean {
  return (r.codeVerdict === "VERIFIED_INCORRECT" || r.codeVerdict === "VERIFIED_UNFINISHED") &&
    r.mistakeKind === "MISUNDERSTANDING" && !r.landedSkill;
}

export interface ReviewTally {
  /** A real gap (an NCERT error or a messy concept case). */
  concept: { n: number; namedStep: number; gaveEvidence: number; unexplained: number; calledSlipOrGuess: number };
  /** The child knew the method and miscopied, or the answer couldn't be read. */
  slips: { n: number; calledSlip: number; calledUnreadable: number; calledMisunderstanding: number; becameEvidence: number; unexplained: number; ids: { becameEvidence: string[]; unexplained: string[] } };
  guesses: { n: number; calledGuess: number };
  /** Right answer with false working, or an answer that shouldn't count either way. */
  other: { n: number };
  /** How many plays of "two such answers" would block an all-clear: every case the rule would count. */
  unexplainedTotal: number;
  unexplainedIds: string[];
}

export function tallyReviews(results: ReviewResultLike[]): ReviewTally {
  const concept = results.filter((r) => r.nature === "CONCEPT");
  const slips = results.filter((r) => r.nature === "SLIP" || r.nature === "FORMAT");
  const guesses = results.filter((r) => r.nature === "GUESS");
  const count = (rs: ReviewResultLike[], f: (r: ReviewResultLike) => boolean) => rs.filter(f).length;
  const unexplained = results.filter(isUnexplained);
  return {
    concept: {
      n: concept.length,
      namedStep: count(concept, (r) => r.firstWrongStep !== null),
      gaveEvidence: count(concept, (r) => !!r.landedSkill),
      unexplained: count(concept, isUnexplained),
      calledSlipOrGuess: count(concept, (r) => r.mistakeKind === "SLIP" || r.mistakeKind === "GUESS" || r.mistakeKind === "UNREADABLE"),
    },
    slips: {
      n: slips.length,
      calledSlip: count(slips, (r) => r.mistakeKind === "SLIP"),
      calledUnreadable: count(slips, (r) => r.mistakeKind === "UNREADABLE"),
      calledMisunderstanding: count(slips, (r) => r.mistakeKind === "MISUNDERSTANDING"),
      becameEvidence: count(slips, (r) => !!r.landedSkill),
      unexplained: count(slips, isUnexplained),
      ids: { becameEvidence: slips.filter((r) => !!r.landedSkill).map((r) => r.id), unexplained: slips.filter(isUnexplained).map((r) => r.id) },
    },
    guesses: { n: guesses.length, calledGuess: count(guesses, (r) => r.mistakeKind === "GUESS") },
    other: { n: results.length - concept.length - slips.length - guesses.length },
    unexplainedTotal: unexplained.length,
    unexplainedIds: unexplained.map((r) => r.id),
  };
}

/** One plain line per question the rules depend on. */
export function describeTally(t: ReviewTally): string[] {
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}% (${a} of ${b})` : "n/a");
  return [
    `Real gaps: the review named a step in ${pct(t.concept.namedStep, t.concept.n)}, and it became skill evidence in ${pct(t.concept.gaveEvidence, t.concept.n)}.`,
    `Real gaps called a misunderstanding with no step (counted as unexplained): ${pct(t.concept.unexplained, t.concept.n)}.`,
    `Slips and unreadable answers: called a slip or unreadable in ${pct(t.slips.calledSlip + t.slips.calledUnreadable, t.slips.n)}; still turned into skill evidence in ${pct(t.slips.becameEvidence, t.slips.n)}${t.slips.ids.becameEvidence.length ? ` (${t.slips.ids.becameEvidence.join(", ")})` : ""}.`,
    `Slips counted as unexplained (these would keep a solid child's test open): ${pct(t.slips.unexplained, t.slips.n)}${t.slips.ids.unexplained.length ? ` (${t.slips.ids.unexplained.join(", ")})` : ""}.`,
    `Guesses called a guess: ${pct(t.guesses.calledGuess, t.guesses.n)}.`,
  ];
}
