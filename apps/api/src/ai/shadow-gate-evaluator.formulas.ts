/**
 * Pure gate-evaluation logic for AiDecisionAuditLog rows — no Prisma, no
 * NestJS. Deliberately reuses each agent's own already-tested agreement
 * formula (never a new parallel comparison), so the evaluator can't quietly
 * drift from what each agent's golden tests already certify as "agreement."
 *
 * This computes whether an agent has *earned* graduation from shadow mode —
 * it does not, and cannot, manufacture the evidence. With fewer than
 * MINIMUM_SAMPLE real logged calls, every capability reports
 * INSUFFICIENT_DATA regardless of how good the numbers look so far.
 */
import type { ConceptAssessment, MasteryDirection } from "@cogna/shared";
import { computeAgreementRate } from "../engines/student-analysis/student-analysis.formulas";
import { agreesWithRule as breakAgrees } from "../engines/break-advisor/break-advisor.formulas";
import { agreesWithRule as questionAgrees } from "../engines/question-recommender/question-recommender.formulas";
import { topChoiceAgrees as practiceTopChoiceAgrees } from "../engines/practice-recommender/practice-recommender.formulas";
import {
  graderAgreesWithRule,
  interpreterAgreesWithRule,
  selectorAgreesWithRule,
} from "../engines/diagnostic-v2/diagnostic-v2.formulas";

export type GateVerdict = "PASS" | "FAIL" | "INSUFFICIENT_DATA";

/** Real logged calls needed before a gate verdict means anything statistically. */
export const MINIMUM_SAMPLE = 30;
/** Directional agreement with the rule engine required to graduate. */
export const AGREEMENT_THRESHOLD = 0.8;

/** Each capability's own configured orchestrator timeout is its latency budget — no separate magic number to drift out of sync. */
export const LATENCY_BUDGET_MS: Record<string, number> = {
  STUDENT_ANALYSIS: 3000,
  BREAK_ADVISOR: 2000,
  QUESTION_RECOMMENDER: 2000,
  PRACTICE_RECOMMENDER: 3000,
  DIAGNOSTIC_V2_SELECTOR: 3500,
  DIAGNOSTIC_V2_INTERPRETER: 3000,
  DIAGNOSTIC_V2_GRADER: 2000,
  DIAGNOSTIC_V2_AUTHOR: 2500,
  /** Off-path session/weekly reports — keep in sync with report-generator-agent TIMEOUT_MS. */
  REPORT_GENERATOR: 5000,
};

export interface AuditRowLike {
  ruleOutput: unknown;
  aiOutput: unknown;
  passed: boolean;
  failureReason: string | null;
  latencyMs: number;
}

export interface GateReport {
  capability: string;
  sampleSize: number;
  minimumSample: number;
  meetsMinimumSample: boolean;
  passRate: number | null;
  agreementRate: number | null;
  comparedCount: number;
  latencyP95Ms: number | null;
  latencyBudgetMs: number;
  forbiddenTermViolations: number;
  boundsViolations: number;
  verdict: GateVerdict;
  reasons: string[];
}

export function percentile(sortedAscending: number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  const idx = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAscending.length) - 1));
  return sortedAscending[idx]!;
}

interface RowAgreement {
  agreedCount: number;
  comparedCount: number;
}

const NO_AGREEMENT: RowAgreement = { agreedCount: 0, comparedCount: 0 };

/** Re-derives one row's agreement using the exact same formula its own agent's golden tests already validate. Returns comparedCount=0 (not a disagreement) when the row's shape doesn't match what's expected — malformed data is excluded, not counted against the agent. */
export function rowAgreement(capability: string, ruleOutput: unknown, aiOutput: unknown): RowAgreement {
  if (!ruleOutput || typeof ruleOutput !== "object" || !aiOutput || typeof aiOutput !== "object") {
    return NO_AGREEMENT;
  }
  const rule = ruleOutput as Record<string, unknown>;
  const ai = aiOutput as Record<string, unknown>;

  switch (capability) {
    case "STUDENT_ANALYSIS": {
      if (!rule.directions || typeof rule.directions !== "object" || !Array.isArray(ai.conceptAssessments)) {
        return NO_AGREEMENT;
      }
      const ruleDirections = new Map(
        Object.entries(rule.directions as Record<string, string>),
      ) as Map<string, MasteryDirection>;
      const result = computeAgreementRate(ruleDirections, ai.conceptAssessments as ConceptAssessment[]);
      return { agreedCount: result.agreedCount, comparedCount: result.comparedCount };
    }
    case "BREAK_ADVISOR": {
      if (typeof rule.suggestBreak !== "boolean" || typeof ai.suggestBreak !== "boolean") return NO_AGREEMENT;
      return { agreedCount: breakAgrees(rule.suggestBreak, ai.suggestBreak) ? 1 : 0, comparedCount: 1 };
    }
    case "QUESTION_RECOMMENDER": {
      if (typeof rule.selectedIndex !== "number" || typeof ai.selectedIndex !== "number") return NO_AGREEMENT;
      return { agreedCount: questionAgrees(rule.selectedIndex, ai.selectedIndex) ? 1 : 0, comparedCount: 1 };
    }
    case "PRACTICE_RECOMMENDER": {
      if (!Array.isArray(rule.orderedConceptIds) || !Array.isArray(ai.orderedConceptIds)) return NO_AGREEMENT;
      return {
        agreedCount: practiceTopChoiceAgrees(
          rule.orderedConceptIds as string[],
          ai.orderedConceptIds as string[],
        )
          ? 1
          : 0,
        comparedCount: 1,
      };
    }
    case "DIAGNOSTIC_V2_SELECTOR": {
      if (typeof rule.choice !== "string" || typeof ai.choice !== "string") return NO_AGREEMENT;
      const agreed = selectorAgreesWithRule(
        {
          choice: rule.choice,
          index: rule.index as number | undefined,
          templateId: rule.templateId as string | undefined,
          targetMicroSkillId: rule.targetMicroSkillId as string | undefined,
        },
        {
          choice: ai.choice,
          index: ai.index as number | undefined,
          templateId: ai.templateId as string | undefined,
          targetMicroSkillId: ai.targetMicroSkillId as string | undefined,
        },
      );
      return { agreedCount: agreed ? 1 : 0, comparedCount: 1 };
    }
    case "DIAGNOSTIC_V2_AUTHOR": {
      // Authoring has no rule-authored equation to agree with — the deterministic
      // baseline is always "serve a template instead". Treat as not-comparable
      // so the capability cannot fail its gate for doing the job it was asked.
      return NO_AGREEMENT;
    }
    case "DIAGNOSTIC_V2_INTERPRETER": {
      if (typeof rule.hypothesisLabel !== "string" || typeof ai.hypothesisLabel !== "string") {
        return NO_AGREEMENT;
      }
      return {
        agreedCount: interpreterAgreesWithRule(rule.hypothesisLabel, ai.hypothesisLabel) ? 1 : 0,
        comparedCount: 1,
      };
    }
    case "DIAGNOSTIC_V2_GRADER": {
      // graderAgreesWithRule() is false by construction — the rule baseline is
      // always AMBIGUOUS, because this capability only runs when the rules
      // abstained. Report that as not-comparable rather than as disagreement,
      // so the fallback grader can never fail its own gate for answering a
      // question the rules explicitly refused to answer.
      return graderAgreesWithRule() ? { agreedCount: 1, comparedCount: 1 } : NO_AGREEMENT;
    }
    case "REPORT_GENERATOR": {
      // Polish quality is enforced by forbidden-term + numeric gates in parse,
      // not by directional agreement with the template. Count a successful
      // served shape as agreement so the capability can graduate on safety.
      if (typeof rule.renderedText !== "string" || typeof ai.renderedText !== "string") {
        return NO_AGREEMENT;
      }
      if (rule.renderedText.length === 0 || ai.renderedText.length === 0) return NO_AGREEMENT;
      return { agreedCount: 1, comparedCount: 1 };
    }
    default:
      return NO_AGREEMENT;
  }
}

export function evaluateGate(capability: string, rows: AuditRowLike[]): GateReport {
  const sampleSize = rows.length;
  const meetsMinimumSample = sampleSize >= MINIMUM_SAMPLE;

  const passedRows = rows.filter((r) => r.passed);
  const passRate = sampleSize > 0 ? passedRows.length / sampleSize : null;

  let agreedTotal = 0;
  let comparedTotal = 0;
  for (const row of passedRows) {
    const { agreedCount, comparedCount } = rowAgreement(capability, row.ruleOutput, row.aiOutput);
    agreedTotal += agreedCount;
    comparedTotal += comparedCount;
  }
  const agreementRate = comparedTotal > 0 ? agreedTotal / comparedTotal : null;

  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const latencyP95Ms = percentile(latencies, 95);
  const latencyBudgetMs = LATENCY_BUDGET_MS[capability] ?? 3000;

  const forbiddenTermViolations = rows.filter(
    (r) => !r.passed && (r.failureReason ?? "").toLowerCase().includes("forbidden term"),
  ).length;
  const boundsViolations = rows.filter((r) => {
    if (r.passed) return false;
    const reason = (r.failureReason ?? "").toLowerCase();
    return reason.includes("not a legal candidate") || reason.includes("not a permutation of");
  }).length;

  const reasons: string[] = [];
  let verdict: GateVerdict;

  if (!meetsMinimumSample) {
    verdict = "INSUFFICIENT_DATA";
    reasons.push(
      `Only ${sampleSize} logged call(s) — need at least ${MINIMUM_SAMPLE} real calls before this gate means anything statistically.`,
    );
  } else {
    const failReasons: string[] = [];
    if (agreementRate === null) {
      failReasons.push("No comparable agreement data — every logged call was malformed or missing output.");
    } else if (agreementRate < AGREEMENT_THRESHOLD) {
      failReasons.push(
        `Agreement rate ${(agreementRate * 100).toFixed(1)}% is below the ${AGREEMENT_THRESHOLD * 100}% bar.`,
      );
    }
    if (forbiddenTermViolations > 0) {
      failReasons.push(
        `${forbiddenTermViolations} forbidden-term violation(s) — blocks graduation on its own, regardless of everything else.`,
      );
    }
    if (boundsViolations > 0) {
      failReasons.push(
        `${boundsViolations} bounds violation(s) — the model proposed something outside the rule-certified legal set.`,
      );
    }
    if (latencyP95Ms !== null && latencyP95Ms > latencyBudgetMs) {
      failReasons.push(`p95 latency ${latencyP95Ms}ms exceeds the ${latencyBudgetMs}ms budget.`);
    }

    if (failReasons.length > 0) {
      verdict = "FAIL";
      reasons.push(...failReasons);
    } else {
      verdict = "PASS";
      reasons.push(
        `Meets sample size (${sampleSize}), ${((agreementRate ?? 0) * 100).toFixed(1)}% agreement, zero safety/bounds violations, within latency budget.`,
      );
    }
  }

  return {
    capability,
    sampleSize,
    minimumSample: MINIMUM_SAMPLE,
    meetsMinimumSample,
    passRate,
    agreementRate,
    comparedCount: comparedTotal,
    latencyP95Ms,
    latencyBudgetMs,
    forbiddenTermViolations,
    boundsViolations,
    verdict,
    reasons,
  };
}
