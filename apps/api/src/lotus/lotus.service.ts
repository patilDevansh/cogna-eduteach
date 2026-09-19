import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  LotusDebateClosure,
  LotusGptDebateResponse,
  LotusLiveProgress,
  LotusMathVerification,
  LotusModelAssessment,
  LotusAdaptiveDecision,
  LotusOverrideAction,
  LotusPhase,
  LotusProposedAction,
  LotusQuestion,
  LotusQuestionAudit,
  LotusQuestionSelection,
  LotusReserveIntent,
  LotusSessionView,
  LotusStageAgreement,
  LotusStageTimingMs,
  LotusStatusResponse,
  LotusStudentResponse,
  LotusTopic,
} from "@cogna/shared";
import { randomUUID } from "crypto";
import { isDemoStudentId } from "../access/cogna-access";
import {
  challengerClosurePrompt,
  gptDebatePrompt,
  independentPrompt,
  reserveCandidatesPrompt,
} from "./lotus-prompts";
import type { PrismaClient } from "@cogna/database";
import { LotusModelService } from "./lotus-model.service";
import { pickOpener } from "./lotus-openers";
import { buildLotusCoveragePlan } from "./lotus-coverage-plan";
import {
  appendLotusEvidence,
  loadLotusSession,
  lotusPersistenceEnabled,
  persistLotusSession,
  type LotusOutboxJobSpec,
} from "./lotus-persistence";
import { reconcileLotusSession, type LotusReconcileResult } from "./lotus-reconcile";
import { pseudonymousLearnerId } from "./lotus-privacy";
import { normalizeMathText } from "./lotus-algebra";
import {
  FACTORISATION_SLOTS,
  skillName,
} from "./lotus-factorisation-catalogue";
import {
  type FactorisationState,
  type PlanAction,
  buildFactorisationReport,
  evidenceFromAnalysis,
  foldLedger,
  instantVerdict,
  nextOpenTurn,
  planAdjustments,
} from "./lotus-factorisation";
import { LotusQuestionFactory, type WriteRequest, type WriteResult } from "./lotus-question-factory";
import {
  crossCheckExpressionAgainstPrompt,
  diagnoseBreakpoint,
  normalizeQuestionAnswerKey,
  questionFingerprints,
  verifyLotusResponse,
} from "./lotus-math";

interface LotusSessionState extends LotusSessionView {
  /** Full server-side keys for the bounded 16-question coverage backbone. */
  coveragePlan?: LotusQuestion[];
  /** Later personalized options remain valid if a browser receives an update just as it submits. */
  authorizedVariants?: Record<string, LotusQuestion[]>;
  preferredFuture?: Record<string, string>;
  /** Factorisation topic only: the planned test and how it has changed. Server-only, never sent to the browser. */
  factorisation?: FactorisationSession;
}

interface FactorisationSession {
  state: FactorisationState;
  /** Every authorized version of each plan turn, oldest first. Old ids stay valid so a browser that already holds one can still submit it. */
  versions: Record<string, LotusQuestion[]>;
  /** The version to show for each turn. */
  preferred: Record<string, string>;
  /** Every AI question write and what happened to it — the data for judging the question factory. */
  writes: FactorisationWriteLog[];
  /** Set when the test ended before its plan ran out, so a rebuilt report keeps saying so. */
  endedEarlyNote?: string;
}

interface FactorisationWriteLog {
  turn: number;
  purpose: WriteRequest["purpose"];
  ms: number;
  attempts: number;
  outcome: "USED" | "REJECTED" | "STALE" | "DUPLICATE";
  rejections: string[];
  at: string;
}

interface WriteJob {
  turn: number;
  /** The turn's version when this job was queued. A plan change bumps it, and the result is thrown away. */
  version: number;
  request: Omit<WriteRequest, "avoid">;
  /** Plan changes jump the queue; the first-minute skeleton fills in behind them. */
  urgent: boolean;
  /** For a turn held back until its rewrite is ready: the reason to show once it is. */
  readyReason?: string;
  /** Whole-generation rounds after the factory's own per-round attempts. */
  retryCount?: number;
}

interface ReserveCandidate {
  intent: LotusReserveIntent;
  question: Omit<LotusQuestion, "id">;
}

const MAX_QUESTIONS = 16;
const MAX_DURATION_MS = 20 * 60 * 1000;
/**
 * Floor, not just a ceiling. MAX_QUESTIONS stops the diagnostic from running
 * forever; this stops it from confidently calling a gap or mastery off one
 * or two answers. The policy prompt already says "exit only after repeated,
 * fresh evidence" — this is that same rule enforced in code, because an
 * LLM not perfectly following its own instructions is exactly the failure
 * this project's own guideline exists to prevent, not an edge case to trust
 * away. Only gates a *confident* exit (EXIT_GAP / EXIT_ADVANCE) — an honest
 * EXIT_UNCERTAIN is already an admission of insufficient evidence, not a
 * claim about the student, so it isn't blocked by this.
 */
const MIN_QUESTIONS_BEFORE_CONFIDENT_EXIT = 4;
/** One candidate per intent, per the fixed 4-intent set — not a tunable knob for "more reserve = safer". */
const RESERVE_TARGET_DEPTH = 4;
const FLEXIBLE_TURNS = [6, 10, 14];
/** A turn's deferred analysis gets this many total attempts before its evidence is marked permanently failed rather than retried forever. */
const DEFERRED_ANALYSIS_MAX_ATTEMPTS = 3;
const DEFERRED_ANALYSIS_RETRY_DELAY_MS = 2000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Question writes running at once per student. The first-minute skeleton needs ~24 writes; 4 at a time finishes it in about a minute. */
const FACTORY_CONCURRENCY = 4;
/** A single rejected item must not block the whole 25-question preparation. */
const FACTORY_MAX_RETRIES = 3;
/** Factorisation never serves a fixed question. The student starts once the first 15 slots have accepted AI items; later slots continue in the background. */
const FACTORISATION_PREPARATION_TARGET = 15;
/** On the last answer, how long to wait for outstanding AI reviews before writing the report anyway. Later reviews still update it. */
const FINAL_REPORT_WAIT_MS = 20_000;
/** How long after last activity a finished session stays hot in memory before falling back to a DB reload on next access. */
const COMPLETE_EVICTION_IDLE_MS = 15 * 60 * 1000;
/** Well past the diagnostic's own 20-minute hard cap — an active session idle this long is presumed abandoned, not mid-turn. */
const ACTIVE_EVICTION_IDLE_MS = 45 * 60 * 1000;

/** Outbox job types: durable records of background work an answer triggers, so a crash between accept and kick-off doesn't silently drop it. */
const OUTBOX_JOB_DEFERRED_ANALYSIS = "lotus.deferredAnalysis";
const OUTBOX_JOB_REPLENISH_RESERVE = "lotus.replenishReserve";
const OUTBOX_JOB_MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for the promise or the timeout, whichever comes first, without leaving a timer behind. */
async function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); }),
  ]);
  if (timer) clearTimeout(timer);
}

function withoutId(question: LotusQuestion): Omit<LotusQuestion, "id"> {
  const { id: _id, ...rest } = question;
  return rest;
}

/** A safe observer-facing summary of a replan; never includes answer keys. */
function planDecisionNote(actions: PlanAction[]): string {
  if (!actions.length) {
    return "Plan decision: no question was swapped from this answer; the staged next question remains, and the evidence will be checked again later.";
  }
  const changes = actions.map((action) => {
    if (action.kind === "SKIP") return `Question ${action.turn} was removed from testing`;
    const purpose = action.purpose === "DESCENT"
      ? `an easier prerequisite (${skillName(action.forSkill)})`
      : action.purpose === "CHECK"
        ? `a later check of ${skillName(action.forSkill)}`
        : action.purpose === "WIDEN"
          ? `a different representation of ${skillName(action.forSkill)}`
          : "a curriculum-safe alternative";
    return `Question ${action.turn} was replanned for ${purpose}`;
  });
  return `Plan update: ${changes.join("; ")}. The immediately staged question was protected.`;
}

/** Converts validated server plan actions into observer-safe decision data. */
function adaptiveDecisionFor(
  audit: LotusQuestionAudit,
  actions: PlanAction[],
): LotusAdaptiveDecision {
  const observedError = audit.response?.didNotKnow
    ? "The student explicitly said they do not know this yet."
    : audit.skillEvidence?.find((e) => e.kind !== "SECURE")?.description
      ?? audit.verification?.explanation
      ?? "No specific error was established from this response.";
  const action = actions.find((candidate) => candidate.kind === "REPURPOSE" && candidate.purpose === "DESCENT")
    ?? actions.find((candidate) => candidate.kind === "REPURPOSE" && candidate.purpose === "CHECK")
    ?? actions.find((candidate) => candidate.kind === "REPURPOSE" && candidate.purpose === "WIDEN")
    ?? actions[0];
  if (!action) {
    return {
      action: "KEEP",
      observedError,
      alternatives: ["A one-off slip, incomplete working, or an untested neighbouring skill can still explain this response."],
      rationale: "The existing unseen plan already contains the safest useful evidence check, or no safe replacement is ready.",
      expectedInformationGain: "Keep collecting independent evidence before changing the plan.",
      source: "RULE_VALIDATED_PLAN",
    };
  }
  if (action.kind === "SKIP") {
    return {
      action: "REMOVE_OR_DEFER",
      observedError,
      alternatives: ["The dependent objective may be tested after its prerequisite is established."],
      rationale: action.reason,
      expectedInformationGain: "Avoid treating a dependent-item failure as evidence before its prerequisite is secure.",
      requestedPlacement: `Question ${action.turn}`,
      source: "RULE_VALIDATED_PLAN",
    };
  }
  if (action.purpose === "WIDEN") {
    return {
      action: "BROADEN",
      observedError,
      alternatives: ["A different representation of the same skill can still fail even though this one succeeded."],
      rationale: action.reason,
      expectedInformationGain: `A different representation of ${skillName(action.forSkill)} can confirm transfer rather than one memorized shape.`,
      targetSkill: action.forSkill,
      requestedPlacement: `Question ${action.turn}`,
      source: "RULE_VALIDATED_PLAN",
    };
  }
  const isPrerequisite = action.purpose === "DESCENT";
  return {
    action: isPrerequisite ? "EASIER_PREREQUISITE" : "TARGETED_PROBE",
    observedError,
    alternatives: isPrerequisite
      ? ["The student may need a simpler prerequisite rather than another version of the same task."]
      : ["This may be a one-off slip; a fresh item can confirm or clear that possibility."],
    rationale: action.reason,
    expectedInformationGain: isPrerequisite
      ? `Check whether ${skillName(action.forSkill)} is secure before attributing difficulty to a later skill.`
      : `A fresh ${skillName(action.forSkill)} item can distinguish a repeatable difficulty from a slip.`,
    targetSkill: action.forSkill,
    requestedPlacement: `Question ${action.turn}`,
    source: "RULE_VALIDATED_PLAN",
  };
}

/** A key-free view of the remaining factorisation plan for the analyser. */
function factorisationPlanningContext(session: LotusSessionState): string | undefined {
  const factorisation = session.factorisation;
  if (!factorisation) return undefined;
  const slots = factorisation.state.turns
    .filter((turn) => turn.turn > factorisation.state.planTurn)
    .slice(0, 10)
    .map((turn) => {
      const spec = FACTORISATION_SLOTS.find((candidate) => candidate.slot === turn.slot);
      return {
        turn: turn.turn,
        skill: spec?.skillId,
        difficulty: spec?.level,
        status: turn.status,
        purpose: turn.purpose ?? "COVERAGE",
        pinned: turn.turn === nextOpenTurn(factorisation.state, factorisation.state.planTurn),
      };
    });
  return JSON.stringify({
    rule: "The server alone validates and installs a change. The pinned next item cannot change. Recommend an earliest safe later slot or KEEP.",
    remainingSlots: slots,
  });
}

/** A durable outbox record for a turn's deferred analysis, keyed so re-persisting the same turn never double-enqueues it. */
function deferredAnalysisJobSpec(sessionId: string, turnIndex: number): LotusOutboxJobSpec {
  return {
    jobType: OUTBOX_JOB_DEFERRED_ANALYSIS,
    idempotencyKey: `${sessionId}:${turnIndex}`,
    payload: { sessionId, turnIndex },
  };
}

/** A durable outbox record for a session's reserve replenishment after a given answer count. */
function replenishReserveJobSpec(sessionId: string, answeredCount: number): LotusOutboxJobSpec {
  return {
    jobType: OUTBOX_JOB_REPLENISH_RESERVE,
    idempotencyKey: `${sessionId}:${answeredCount}`,
    payload: { sessionId },
  };
}

/** Only for a turn that was actually installed by an adaptive decision — never a claim about an unchanged coverage item. */
function adaptationTagFor(turn: { status: string; purpose?: string; forSkill?: string; reason?: string }): LotusQuestionSelection["adaptationTag"] {
  if (turn.status !== "REPURPOSED") return undefined;
  switch (turn.purpose) {
    case "CHECK": return turn.forSkill ? { kind: "TARGETED_CHECK", skill: skillName(turn.forSkill) } : undefined;
    case "DESCENT": return turn.forSkill ? { kind: "EASIER_PREREQUISITE", skill: skillName(turn.forSkill) } : undefined;
    case "WIDEN": return turn.forSkill ? { kind: "BROADENED_EVIDENCE", skill: skillName(turn.forSkill) } : undefined;
    case "AVOID": return { kind: "COVERAGE_REPLACEMENT", reason: turn.reason ?? "Rewritten to avoid an unconfirmed prerequisite." };
    default: return undefined;
  }
}

function questionProvenance(question: LotusQuestion | Omit<LotusQuestion, "id">): LotusQuestionSelection["provenance"] {
  return question.answerKey.diagnostics?.origin === "AI"
    ? "AI_GENERATED_FOR_SESSION"
    : "HARDCODED_SYSTEM";
}

/** What makes two questions the same question: the expression when there is one, otherwise the prompt. */
function questionPrint(question: Omit<LotusQuestion, "id">): string {
  return normalizeMathText(question.answerKey.diagnostics?.expression ?? question.prompt).toLowerCase();
}

/** Pick an unused, valid common-factor instance for each session's AI opener. */
function factorisationOpeningExpression(sessionId: string, alreadyUsed: ReadonlySet<string>): string | null {
  const hex = sessionId.replace(/-/g, "");
  const n = Number.parseInt(hex.slice(0, 8), 16) || 1;
  const candidates: string[] = [];
  for (const factor of [2, 3, 4, 5, 6]) {
    for (let xCoefficient = 1; xCoefficient <= Math.floor(12 / factor); xCoefficient += 1) {
      for (let constant = 2; constant <= Math.floor(50 / factor); constant += 1) {
        candidates.push(`${factor * xCoefficient}x + ${factor * constant}`);
      }
    }
  }
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(n + offset) % candidates.length]!;
    if (!alreadyUsed.has(normalizeMathText(candidate).toLowerCase())) return candidate;
  }
  return null;
}

function preferredItem(f: FactorisationSession, turn: number): LotusQuestion | undefined {
  const list = f.versions[String(turn)] ?? [];
  return list.find((item) => item.id === f.preferred[String(turn)]) ?? list[0];
}

/** Which predicted mistakes each demo persona makes in the factorisation test. Personas not listed answer correctly. */
const DEMO_FACTORISATION_WEAKNESS: Record<string, RegExp> = {
  aarav: /SIGN|FLIP/,
  meena: /GROUP|PAIRS|SUM_ACCEPTED|BRACKET_NOT_SEEN|LEFTOVERS/,
  rohan: /INCOMPLETE|COMMON_NOT_HIGHEST|PARTIAL_GCF|SKIPPED_COMMON/,
};

const REFLECTION_PROMPTS = [
  "While the AIs review your last answer — how sure are you about it, looking back?",
  "Take a breath. Which part of that last question felt least certain?",
  "No need to answer anything here — just think back over the steps you wrote.",
];

/**
 * The final chokepoint before any question becomes session.currentQuestion
 * — every path (opener, reserve, slow-path selection, observer override)
 * passes through here. The math cross-check backstop lives here too: even
 * if a bad candidate somehow got past its own gate upstream, it is rejected
 * here rather than ever reaching a student.
 */
function withQuestionId(question: Omit<LotusQuestion, "id">): LotusQuestion {
  if (
    !question ||
    typeof question.prompt !== "string" ||
    !question.prompt.trim() ||
    !question.answerKey ||
    typeof question.answerKey.canonicalAnswer !== "string"
  ) {
    throw new ServiceUnavailableException("The AI conclusion did not provide a usable next question.");
  }
  const normalized = normalizeQuestionAnswerKey(question);
  const crossCheck = crossCheckExpressionAgainstPrompt(normalized);
  if (crossCheck.status === "MISMATCHED") {
    throw new ServiceUnavailableException(`Rejected an unverified question before display: ${crossCheck.explanation}`);
  }
  return { ...normalized, id: randomUUID() };
}

function questionsEquivalent(
  left: Omit<LotusQuestion, "id"> | undefined,
  right: Omit<LotusQuestion, "id"> | undefined,
): boolean {
  if (!left || !right) return false;
  return questionFingerprints(left).exact === questionFingerprints(right).exact;
}

/** Strips the answer key and purpose down to nothing a student shouldn't see before answering. Shape-preserving so the frontend types are unaffected. */
function redactQuestion<T extends Omit<LotusQuestion, "id">>(question: T): T {
  return {
    ...question,
    purpose: "",
    answerKey: { kind: question.answerKey.kind, canonicalAnswer: "", workedSolution: [] },
  };
}

function redactAssessment(assessment: LotusModelAssessment): LotusModelAssessment {
  return {
    ...assessment,
    hypotheses: [],
    proposedQuestion: assessment.proposedQuestion ? redactQuestion(assessment.proposedQuestion) : undefined,
  };
}

function redactDebate(debate: LotusGptDebateResponse): LotusGptDebateResponse {
  return {
    ...debate,
    revisedQuestion: debate.revisedQuestion ? redactQuestion(debate.revisedQuestion) : undefined,
  };
}

function redactClosure(conclusion: LotusDebateClosure): LotusDebateClosure {
  return {
    ...conclusion,
    nextQuestion: conclusion.nextQuestion ? redactQuestion(conclusion.nextQuestion) : undefined,
    report: undefined,
  };
}

function redactSelection(selection: LotusQuestionSelection): LotusQuestionSelection {
  return {
    ...selection,
    primaryProposal: selection.primaryProposal ? redactQuestion(selection.primaryProposal) : undefined,
    challengerProposal: selection.challengerProposal ? redactQuestion(selection.challengerProposal) : undefined,
    selectedQuestion: selection.selectedQuestion ? redactQuestion(selection.selectedQuestion) : undefined,
  };
}

function redactAudit(audit: LotusQuestionAudit): LotusQuestionAudit {
  return {
    ...audit,
    // What each answer said about each skill is the diagnosis itself — released with the report, not before.
    skillEvidence: undefined,
    gpt: audit.gpt ? redactAssessment(audit.gpt) : undefined,
    challenger: audit.challenger ? redactAssessment(audit.challenger) : undefined,
    debate: audit.debate ? redactDebate(audit.debate) : undefined,
    conclusion: redactClosure(audit.conclusion),
    questionSelection: redactSelection(audit.questionSelection),
  };
}

/**
 * While a diagnostic is ACTIVE, nothing that could reveal the answer key,
 * an item's purpose, or the AI's live hypotheses about this student may
 * reach the browser — the same session data this page's own "AI Lab" panel
 * renders is reachable from devtools regardless of whether that panel is
 * toggled on, so this has to be enforced here, not by a UI toggle. A past
 * turn's own question/response/verification stays visible throughout,
 * because the student has already answered it and nothing about showing it
 * back to them can be gamed. Once the diagnostic is COMPLETE the full trail
 * is released — that's what "Show AI Lab" and the final report use.
 */
function publicCopy(session: LotusSessionState): LotusSessionView {
  const clone = structuredClone(session);
  const upcoming: LotusQuestion[] = [];
  if (clone.status === "ACTIVE" && clone.factorisation) {
    const f = clone.factorisation;
    const readyQuestions = Object.entries(f.preferred)
      .filter(([turn, id]) => Number(turn) >= 1 && f.versions[turn]?.some((item) => item.id === id && item.answerKey.diagnostics?.origin === "AI"))
      .length;
    clone.preparation = {
      readyQuestions,
      targetQuestions: FACTORISATION_PREPARATION_TARGET,
      totalQuestions: 25,
      ready: readyQuestions >= FACTORISATION_PREPARATION_TARGET,
    };
    // Never expose a legacy/pre-change non-AI item from an old persisted
    // session. Such a session returns to the preparation screen and must be
    // rebuilt with accepted AI items rather than leaking a retired question.
    if (clone.currentQuestion?.answerKey.diagnostics?.origin !== "AI") clone.currentQuestion = null;
    for (const turn of f.state.turns) {
      if (turn.turn <= f.state.planTurn || turn.status === "SKIPPED") continue;
      const item = preferredItem(f, turn.turn);
      if (item?.answerKey.diagnostics?.origin === "AI") upcoming.push(redactQuestion(item));
    }
  }
  delete clone.factorisation;
  if (clone.status === "ACTIVE" && clone.coveragePlan) {
    for (let turn = clone.audits.length + 2; turn <= clone.coveragePlan.length; turn += 1) {
      const preferredId = clone.preferredFuture?.[String(turn)];
      const preferred = clone.authorizedVariants?.[String(turn)]?.find((item) => item.id === preferredId);
      const item = preferred ?? clone.coveragePlan[turn - 1];
      if (item) upcoming.push(redactQuestion(item));
    }
  }
  delete clone.coveragePlan;
  delete clone.authorizedVariants;
  delete clone.preferredFuture;
  clone.upcomingQuestions = upcoming;
  if (clone.status === "COMPLETE") return clone;
  if (clone.currentQuestion) clone.currentQuestion = redactQuestion(clone.currentQuestion);
  // openingAudit.question is the exact same object as currentQuestion until
  // the first answer is submitted (audits.length === 0) — it is the live,
  // not-yet-answered question, not history, and must be redacted too. Once
  // it has been answered it becomes a past turn like any other and is safe,
  // same as every audits[] entry's own .question.
  const openingQuestionIsLive = clone.audits.length === 0;
  clone.openingAudit = redactAudit({
    ...clone.openingAudit,
    question: openingQuestionIsLive ? redactQuestion(clone.openingAudit.question) : clone.openingAudit.question,
  });
  clone.audits = clone.audits.map(redactAudit);
  if (clone.topic === "FACTORISATION") {
    // A turn's selection reason names the gap a coming question is checking ("re-checks a suspected sign gap").
    clone.audits = clone.audits.map((audit) => ({ ...audit, questionSelection: { ...audit.questionSelection, reason: "" } }));
  }
  if (clone.liveProgress) {
    clone.liveProgress = {
      ...clone.liveProgress,
      gpt: clone.liveProgress.gpt ? redactAssessment(clone.liveProgress.gpt) : undefined,
      challenger: clone.liveProgress.challenger ? redactAssessment(clone.liveProgress.challenger) : undefined,
      debate: clone.liveProgress.debate ? redactDebate(clone.liveProgress.debate) : undefined,
    };
  }
  return clone;
}

export class LotusService implements OnModuleDestroy {
  private readonly logger = new Logger(LotusService.name);
  private readonly sessions = new Map<string, LotusSessionState>();
  /** Ephemeral, per-session, never persisted or sent to the client — regenerated on demand if lost (e.g. a restart). */
  private readonly reserves = new Map<string, ReserveCandidate[]>();
  /** Set when a deferred (fast-path) analysis later disagrees with the quick pick. The *next* unclaimed turn takes the slow path so a real conclusion — including a possible exit — can be reached; the question already shown is never swapped. */
  private readonly forceSlowPath = new Set<string>();
  /** Last time each session was actually read or written — what the eviction sweep ages off of. */
  private readonly lastTouchedAt = new Map<string, number>();
  /** Sessions whose in-memory state is not confirmed durable yet — set before every persist attempt, cleared only on success. The sweep must never evict one of these: doing so on a failed write would silently roll a session back to its last successfully saved turn. */
  private readonly dirty = new Set<string>();
  private readonly inFlightAnswers = new Map<string, Promise<LotusSessionView>>();
  private readonly analysisTails = new Map<string, Promise<void>>();
  private readonly persistenceTails = new Map<string, Promise<void>>();
  /** Factorisation question writes waiting or running, per session. In memory only — a restart rebuilds from the plan. */
  private readonly writeQueues = new Map<string, { pending: WriteJob[]; running: number; activeTurns: Set<number> }>();
  /** Expressions already used by accepted Factorisation AI items in this API process. New sessions cannot replay them. */
  private readonly factorisationGeneratedPrints = new Set<string>();
  /** Opening expressions are tracked separately for the stronger Q1 variation rule. */
  private readonly factorisationOpeningPrints = new Set<string>();
  private readonly factory: LotusQuestionFactory;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly models: LotusModelService,
    private readonly prisma?: PrismaClient | null,
  ) {
    this.factory = new LotusQuestionFactory({
      writeQuestion: (prompt) => this.models.writeQuestion(prompt),
      solveBlind: (prompt) => this.models.solveBlind(prompt),
    });
    // unref: a background sweep must never be the reason the process stays alive.
    this.sweepTimer = setInterval(() => this.sweepStaleSessions(), SWEEP_INTERVAL_MS).unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  private touch(sessionId: string): void {
    this.lastTouchedAt.set(sessionId, Date.now());
  }

  private rememberFactorisationPrints(session: LotusSessionState): void {
    if (!session.factorisation) return;
    for (const versions of Object.values(session.factorisation.versions)) {
      for (const question of versions) {
        const print = questionPrint(question);
        this.factorisationGeneratedPrints.add(print);
        if (question.answerKey.diagnostics?.slot === 1) this.factorisationOpeningPrints.add(print);
      }
    }
  }

  /**
   * The in-memory map is a cache, not the record of truth, once durable
   * persistence is on — every write already lands in the database before
   * a response returns (see persist()), so evicting a session here only
   * means the next access reloads it. Bounds memory for a long-running
   * process instead of growing forever. A configured Prisma client is always
   * the durable record for Lotus, including standalone demos; an in-memory
   * session is only a cache and can safely be reloaded after eviction.
   */
  private sweepStaleSessions(): void {
    if (!lotusPersistenceEnabled(this.prisma)) return;
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (this.dirty.has(sessionId)) continue;
      const idleMs = now - (this.lastTouchedAt.get(sessionId) ?? 0);
      const threshold = session.status === "COMPLETE" ? COMPLETE_EVICTION_IDLE_MS : ACTIVE_EVICTION_IDLE_MS;
      if (idleMs < threshold) continue;
      this.sessions.delete(sessionId);
      this.reserves.delete(sessionId);
      this.forceSlowPath.delete(sessionId);
      this.lastTouchedAt.delete(sessionId);
      this.writeQueues.delete(sessionId);
    }
  }

  status(): LotusStatusResponse {
    const status = this.models.status;
    return {
      ...status,
      models: {
        primary: `${this.models.primaryModel} · GPT primary`,
        challenger: `${this.models.challengerModel} · GPT challenger`,
      },
    };
  }

  async start(studentId: string, topic: LotusTopic = "BRACKETS"): Promise<LotusSessionView> {
    this.models.assertReady();
    if (topic === "FACTORISATION") return this.startFactorisation(studentId);
    const startedAt = new Date().toISOString();
    const coveragePlan = buildLotusCoveragePlan(studentId).map(withQuestionId);
    const question = coveragePlan[0]!;
    const opener = pickOpener(studentId);

    const bankNote =
      "There is no prior evidence for this student yet, so the opening question is drawn from a small validated bank instead of spending model calls to personalize against nothing.";
    const questionSelection: LotusQuestionSelection = {
      selectedQuestion: opener,
      selectedFrom: "OPENER_BANK",
      reason: bankNote,
      informationGain: { passed: true, explanation: "First question of the session; nothing to repeat yet." },
    };
    const openingAudit: LotusQuestionAudit = {
      question,
      response: null,
      verification: null,
      breakpoint: null,
      gpt: this.placeholderAssessment(bankNote),
      challenger: this.placeholderAssessment(bankNote),
      debate: this.placeholderDebate(bankNote),
      conclusion: this.placeholderClosure(bankNote, question.phase, "ASK", question, false),
      questionSelection,
      analysisStatus: "COMPLETE",
      analysisSource: "DETERMINISTIC",
      stageAgreement: null,
      timingMs: null,
      createdAt: startedAt,
    };
    const session: LotusSessionState = {
      sessionId: randomUUID(),
      studentId,
      grade: 8,
      board: "CBSE",
      status: "ACTIVE",
      experimental: true,
      phase: question.phase,
      startedAt,
      currentQuestion: question,
      openingAudit,
      audits: [],
      finalReport: null,
      modelConfiguration: {
        primary: `${this.models.primaryModel} · GPT primary`,
        challenger: `${this.models.challengerModel} · GPT challenger`,
      },
      liveProgress: null,
      coveragePlan,
      authorizedVariants: {},
      preferredFuture: {},
    };
    this.sessions.set(session.sessionId, session);
    this.rememberFactorisationPrints(session);
    this.touch(session.sessionId);
    await this.persist(session, undefined, true);
    return publicCopy(session);
  }

  async get(sessionId: string): Promise<LotusSessionView> {
    const session = await this.requireSession(sessionId);
    this.ensureFactorisationWrites(session);
    return publicCopy(session);
  }

  async answer(
    sessionId: string,
    studentId: string,
    response: LotusStudentResponse,
  ): Promise<LotusSessionView> {
    const existing = this.inFlightAnswers.get(sessionId);
    if (existing) {
      await existing.catch(() => undefined);
      return this.answer(sessionId, studentId, response);
    }
    const task = this.answerOnce(sessionId, studentId, response);
    this.inFlightAnswers.set(sessionId, task);
    try {
      return await task;
    } finally {
      if (this.inFlightAnswers.get(sessionId) === task) this.inFlightAnswers.delete(sessionId);
    }
  }

  private async answerOnce(
    sessionId: string,
    studentId: string,
    response: LotusStudentResponse,
  ): Promise<LotusSessionView> {
    const session = await this.requireSession(sessionId);
    // Staged tests record an answer with code alone; the AI review runs afterwards.
    if (!session.coveragePlan && !session.factorisation) this.models.assertReady();
    if (session.studentId !== studentId) {
      throw new BadRequestException("This Lotus session belongs to a different student.");
    }
    if (response.questionId) {
      const answered = session.audits.find((audit) => audit.question.id === response.questionId);
      if (answered) {
        if (response.submissionId && answered.response?.submissionId === response.submissionId) {
          if (session.coveragePlan || session.factorisation) await this.persist(session, undefined, true);
          return publicCopy(session);
        }
        throw new BadRequestException("That question has already been submitted.");
      }
      if (session.currentQuestion?.id !== response.questionId) {
        throw new BadRequestException("The visible question is no longer the current question. Refresh the session.");
      }
    }
    if (session.status !== "ACTIVE" || !session.currentQuestion) {
      throw new BadRequestException("This Lotus diagnostic is already complete.");
    }

    try {
      return await this.answerInner(session, response);
    } catch (err) {
      session.liveProgress = null;
      throw err;
    }
  }

  /**
   * A server-computed demo response for the five hardcoded demo personas —
   * the client can no longer read the answer key to fill one itself now
   * that it's redacted while the diagnostic is active. Gated to demo
   * student ids so it cannot be used to answer a real student's question.
   */
  async demoFill(
    sessionId: string,
    studentId: string,
  ): Promise<{ answer: string; working: string; confidence: number }> {
    if (!isDemoStudentId(studentId)) {
      throw new ForbiddenException("Demo response filling is only available for demo student accounts.");
    }
    const session = await this.requireSession(sessionId);
    if (session.studentId !== studentId) {
      throw new BadRequestException("This Lotus session belongs to a different student.");
    }
    const question = session.currentQuestion;
    if (!question) {
      throw new BadRequestException("There is no active question to fill a demo response for.");
    }
    const key = studentId.replace(/^demo_/, "");
    const canonical = question.answerKey.canonicalAnswer;
    const diagnostics = question.answerKey.diagnostics;
    if (diagnostics) {
      // Factorisation: each persona makes one family of predicted mistakes, so a gap shows up twice and gets confirmed.
      const weakness = DEMO_FACTORISATION_WEAKNESS[key];
      const predicted = weakness ? diagnostics.predictedMistakes.find((mistake) => weakness.test(mistake.mistake)) : undefined;
      if (predicted) return { answer: predicted.answer, working: predicted.answer, confidence: 60 };
      const worked = question.answerKey.workedSolution ?? [];
      return { answer: canonical, working: worked.slice(0, 6).join("\n") || canonical, confidence: 85 };
    }
    const context = `${question.subtopic} ${question.prompt}`;
    const shouldShowDifficulty =
      (key === "aarav" && /negative|sign|bracket|distribut/i.test(context)) ||
      (key === "meena" && /equation|balance|bracket|distribut/i.test(context)) ||
      (key === "rohan" && session.audits.length === 2);
    let answer = canonical;
    if (shouldShowDifficulty) {
      if (question.options?.length) answer = question.options.find((option) => option !== canonical) ?? canonical;
      else if (/^-?\d+(?:\.\d+)?$/.test(canonical.trim())) answer = String(Number(canonical) + 1);
      else if (canonical.includes("+")) answer = canonical.replace("+", "-");
      else if (canonical.includes("-")) answer = canonical.replace("-", "+");
      else answer = `${canonical} + 1`;
    }
    const worked = question.answerKey.workedSolution ?? [];
    const working = (worked.length ? worked : ["I worked this out independently."]).slice(0, 6).join("\n");
    const confidence = key === "aadya" ? 90 : shouldShowDifficulty ? 60 : 90;
    return { answer, working, confidence };
  }

  private async answerInner(
    session: LotusSessionState,
    response: LotusStudentResponse,
  ): Promise<LotusSessionView> {
    const currentQuestion = session.currentQuestion!;
    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(session.startedAt).getTime()) / 1000,
    );
    const answeredCount = session.audits.length + 1;
    if (session.factorisation) {
      return this.resolveFactorisationTurn(session, currentQuestion, response, elapsedSeconds, answeredCount);
    }
    const verification = verifyLotusResponse(currentQuestion, response);
    const breakpoint = diagnoseBreakpoint(currentQuestion, response);
    const previousQuestions = [...session.audits.map((audit) => audit.question), currentQuestion];

    const atHardLimit =
      elapsedSeconds >= MAX_DURATION_MS / 1000 || answeredCount >= MAX_QUESTIONS;
    if (session.coveragePlan && !atHardLimit) {
      return this.resolveCoveragePath(
        session, currentQuestion, response, verification, breakpoint, answeredCount, elapsedSeconds,
      );
    }
    if (session.coveragePlan && atHardLimit) {
      // The final report needs the earlier answers' actual deep evidence, not
      // the placeholder audits that made their next questions appear quickly.
      await this.analysisTails.get(session.sessionId)?.catch(() => undefined);
    }
    const forcedSlow = this.forceSlowPath.has(session.sessionId);

    const fastCandidate =
      atHardLimit || forcedSlow
        ? null
        : this.takeFastCandidate(session.sessionId, verification, breakpoint, previousQuestions);

    if (fastCandidate) {
      return this.resolveFastPath(
        session,
        currentQuestion,
        response,
        verification,
        breakpoint,
        fastCandidate,
        answeredCount,
        elapsedSeconds,
      );
    }
    this.forceSlowPath.delete(session.sessionId);
    return this.resolveSlowPath(
      session,
      currentQuestion,
      response,
      verification,
      breakpoint,
      answeredCount,
      elapsedSeconds,
    );
  }

  /**
   * The question is already on the browser before Submit. This endpoint only
   * confirms the exact authorized item that was displayed and records the
   * previous answer. Algebra and unusual working take the same fast route;
   * their careful interpretation happens after the next question appears.
   */
  private async resolveCoveragePath(
    session: LotusSessionState,
    currentQuestion: LotusQuestion,
    response: LotusStudentResponse,
    verification: LotusMathVerification,
    breakpoint: ReturnType<typeof diagnoseBreakpoint>,
    answeredCount: number,
    elapsedSeconds: number,
  ): Promise<LotusSessionView> {
    const nextTurn = answeredCount + 1;
    const baseline = session.coveragePlan?.[nextTurn - 1];
    if (!baseline) throw new ServiceUnavailableException("The checked curriculum plan has no next question.");
    const authorized = [baseline, ...(session.authorizedVariants?.[String(nextTurn)] ?? [])];
    const chosen = response.nextQuestionId
      ? authorized.find((item) => item.id === response.nextQuestionId)
      : authorized.find((item) => item.id === session.preferredFuture?.[String(nextTurn)]) ?? baseline;
    if (!chosen) throw new BadRequestException("The next question was not authorized for this turn.");

    const { id: _id, ...selectedQuestion } = chosen;
    const fromAdaptive = chosen.id !== baseline.id;
    const needsReview = !response.didNotKnow;
    const note = response.didNotKnow
      ? "The student explicitly said they do not know this yet. This is a support signal; no AI reasoning analysis was requested for this turn."
      : fromAdaptive
      ? "This checked personalized question was staged before submission. The full analysis of the previous answer is running in the background."
      : "This checked curriculum-coverage question was staged before submission. It keeps the diagnostic broad while the previous answer receives deeper review.";
    const audit: LotusQuestionAudit = {
      question: currentQuestion,
      response,
      verification,
      breakpoint,
      conclusion: this.placeholderClosure(note, chosen.phase, "ASK", selectedQuestion, false),
      questionSelection: {
        selectedQuestion,
        selectedFrom: fromAdaptive ? "ADAPTIVE_STAGED" : "CURRICULUM_DECK",
        reason: note,
        provenance: questionProvenance(chosen),
        informationGain: this.informationGain(selectedQuestion, [...session.audits.map((item) => item.question), currentQuestion]),
      },
      analysisStatus: needsReview ? "PENDING" : "NOT_REQUIRED",
      analysisSource: response.didNotKnow ? "SUPPORT_SIGNAL" : "DETERMINISTIC",
      stageAgreement: null,
      timingMs: null,
      createdAt: new Date().toISOString(),
    };
    const turnIndex = session.audits.length;
    session.audits.push(audit);
    session.currentQuestion = chosen;
    session.phase = chosen.phase;
    session.liveProgress = null;
    await this.persist(
      session, audit, true,
      needsReview ? [deferredAnalysisJobSpec(session.sessionId, turnIndex)] : [],
    );
    if (needsReview) {
      this.scheduleDeferredAnalysis(session, turnIndex, currentQuestion, response, verification, elapsedSeconds, answeredCount);
    }
    return publicCopy(session);
  }

  private scheduleDeferredAnalysis(
    session: LotusSessionState,
    turnIndex: number,
    question: LotusQuestion,
    response: LotusStudentResponse,
    verification: LotusMathVerification,
    elapsedSeconds: number,
    answeredCount: number,
  ): void {
    const previous = this.analysisTails.get(session.sessionId) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(() =>
      this.runDeferredAnalysisWithRetry(
        session.sessionId, turnIndex, question, response, verification, elapsedSeconds, answeredCount,
      ),
    );
    this.analysisTails.set(session.sessionId, task);
    void task.finally(() => {
      if (this.analysisTails.get(session.sessionId) === task) this.analysisTails.delete(session.sessionId);
    }).catch(() => undefined);
  }

  /** Fast path: the deep read of *this* answer is still pending — only the next question is decided now, nothing is concluded. */
  private async resolveFastPath(
    session: LotusSessionState,
    currentQuestion: LotusQuestion,
    response: LotusStudentResponse,
    verification: LotusMathVerification,
    breakpoint: ReturnType<typeof diagnoseBreakpoint>,
    chosen: ReserveCandidate,
    answeredCount: number,
    elapsedSeconds: number,
  ): Promise<LotusSessionView> {
    const nextQuestion = withQuestionId(chosen.question);
    const previousQuestions = [...session.audits.map((audit) => audit.question), currentQuestion];
    const gain = this.informationGain(chosen.question, previousQuestions);
    const reason = `Selected instantly from the prepared reserve (${chosen.intent.toLowerCase().replace(/_/g, " ")}) using the deterministic arithmetic check, while the full analysis of this answer runs in the background.`;
    const questionSelection: LotusQuestionSelection = {
      selectedQuestion: chosen.question,
      selectedFrom: "RESERVE",
      reason,
      provenance: questionProvenance(nextQuestion),
      informationGain: gain,
    };

    const pendingNote = "Deep analysis has not completed yet — this turn used the fast path and will be filled in shortly.";
    const audit: LotusQuestionAudit = {
      question: currentQuestion,
      response,
      verification,
      breakpoint,
      conclusion: this.placeholderClosure(pendingNote, nextQuestion.phase, "ASK", nextQuestion, false),
      questionSelection,
      analysisStatus: "PENDING",
      analysisSource: "DETERMINISTIC",
      stageAgreement: null,
      timingMs: null,
      createdAt: new Date().toISOString(),
    };

    const turnIndex = session.audits.length;
    session.audits.push(audit);
    session.currentQuestion = nextQuestion;
    session.phase = nextQuestion.phase;
    session.liveProgress = null;

    await this.persist(session, audit, true, [deferredAnalysisJobSpec(session.sessionId, turnIndex)]);

    void this.runDeferredAnalysisWithRetry(
      session.sessionId,
      turnIndex,
      currentQuestion,
      response,
      verification,
      elapsedSeconds,
      answeredCount,
    );

    return publicCopy(session);
  }

  /** Slow path: today's full four-stage pipeline, unchanged, run synchronously because either no fast candidate fit or an exit/hard-limit decision needs a real conclusion. */
  private async resolveSlowPath(
    session: LotusSessionState,
    currentQuestion: LotusQuestion,
    response: LotusStudentResponse,
    verification: LotusMathVerification,
    breakpoint: ReturnType<typeof diagnoseBreakpoint>,
    answeredCount: number,
    elapsedSeconds: number,
  ): Promise<LotusSessionView> {
    this.setLiveProgress(session, answeredCount, { stage: "ASSESSING" });
    const analysis = await this.runFullAnalysis(
      session.audits,
      currentQuestion,
      response,
      verification,
      elapsedSeconds,
      answeredCount,
      (stage, partial) => this.setLiveProgress(session, answeredCount, { stage, ...partial }),
    );
    let { gpt, challenger, debate } = analysis;
    let conclusion = analysis.conclusion;

    conclusion = await this.blockPrematureExit(conclusion, session, gpt, answeredCount);
    conclusion = this.applyHardLimitExit(conclusion, session, gpt, verification, elapsedSeconds, answeredCount);
    if (session.coveragePlan && session.audits.some((audit) => audit.analysisStatus === "PENDING")) {
      conclusion = this.forcedUncertainExit(
        conclusion, session, gpt,
        "One or more earlier answers could not complete their deeper review; the teacher report must not claim a confirmed gap or mastery from incomplete evidence.",
      );
    }
    this.assertOperationalConclusion(conclusion);
    let questionSelection = conclusion.exitDiagnostic
      ? this.exitSelection(conclusion)
      : await this.resolveQuestionSelection({
          gpt,
          challenger,
          debate,
          conclusion,
          previousQuestions: [...session.audits.map((audit) => audit.question), currentQuestion],
        });
    if (!conclusion.exitDiagnostic && !questionSelection.selectedQuestion) {
      conclusion = this.forcedUncertainExit(
        conclusion,
        session,
        gpt,
        "The agents could not produce a question that added new evidence.",
      );
      questionSelection = this.exitSelection(conclusion);
    }
    if (!conclusion.exitDiagnostic) {
      if (!questionSelection.selectedQuestion) {
        throw new ServiceUnavailableException("Lotus did not select a usable next question.");
      }
      conclusion.nextQuestion = questionSelection.selectedQuestion;
    }
    const audit: LotusQuestionAudit = {
      question: currentQuestion,
      response,
      verification,
      breakpoint,
      gpt,
      challenger,
      debate,
      conclusion,
      questionSelection,
      analysisStatus: "COMPLETE",
      analysisSource: "AI_REVIEW",
      stageAgreement: analysis.stageAgreement,
      timingMs: analysis.timingMs,
      createdAt: new Date().toISOString(),
    };
    session.audits.push(audit);
    session.liveProgress = null;

    if (conclusion.exitDiagnostic) {
      session.status = "COMPLETE";
      session.currentQuestion = null;
      session.finalReport = conclusion.report ?? null;
      session.phase = conclusion.phase;
    } else {
      const nextQuestion = withQuestionId(questionSelection.selectedQuestion!);
      session.currentQuestion = nextQuestion;
      session.phase = nextQuestion.phase;
    }
    await this.persist(
      session, audit, true,
      conclusion.exitDiagnostic ? [] : [replenishReserveJobSpec(session.sessionId, answeredCount)],
    );
    if (!conclusion.exitDiagnostic) {
      void this.replenishReserve(session.sessionId).catch(() => undefined);
    }
    return publicCopy(session);
  }

  /**
   * A fast-tracked turn's real evidence only ever gets this one chance to
   * be produced — nothing else will re-attempt it later. A transient
   * failure (a dropped connection, a rate limit) shouldn't cost that turn
   * its analysis permanently, so this retries with a short backoff before
   * giving up and marking it failed.
   */
  private async runDeferredAnalysisWithRetry(
    sessionId: string,
    turnIndex: number,
    currentQuestion: LotusQuestion,
    response: LotusStudentResponse,
    verification: LotusMathVerification,
    elapsedSeconds: number,
    answeredCount: number,
    attempt = 1,
  ): Promise<void> {
    try {
      await this.runDeferredAnalysis(sessionId, turnIndex, currentQuestion, response, verification, elapsedSeconds, answeredCount);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < DEFERRED_ANALYSIS_MAX_ATTEMPTS) {
        this.logger.warn(
          `Deferred analysis attempt ${attempt}/${DEFERRED_ANALYSIS_MAX_ATTEMPTS} failed for session ${sessionId} turn ${turnIndex}, retrying: ${message}`,
        );
        await delay(DEFERRED_ANALYSIS_RETRY_DELAY_MS * attempt);
        // The session or turn may have moved on while we waited — the next
        // attempt's own liveSession/slot lookups inside runDeferredAnalysis
        // already guard against that, same as the first attempt.
        return this.runDeferredAnalysisWithRetry(
          sessionId, turnIndex, currentQuestion, response, verification, elapsedSeconds, answeredCount, attempt + 1,
        );
      }
      this.logger.error(
        `Deferred analysis permanently failed after ${attempt} attempts for session ${sessionId} turn ${turnIndex}: ${message}`,
      );
      await this.markDeferredAnalysisFailed(sessionId, turnIndex);
    }
  }

  /**
   * Runs the same four-stage analysis the slow path uses, but for a turn
   * whose question was already chosen and shown by the fast path. Writes
   * the result into that same turn's slot in place — never a new turn,
   * never a later one — so nothing already on screen is ever swapped. If
   * the careful read disagrees enough to want a different action, that only
   * makes the *next* unclaimed turn take the slow path; it cannot undo this
   * one.
   */
  private async runDeferredAnalysis(
    sessionId: string,
    turnIndex: number,
    currentQuestion: LotusQuestion,
    response: LotusStudentResponse,
    verification: LotusMathVerification,
    elapsedSeconds: number,
    answeredCount: number,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const priorAudits = session.audits.slice(0, turnIndex);

    const analysis = await this.runFullAnalysis(
      priorAudits,
      currentQuestion,
      response,
      verification,
      elapsedSeconds,
      answeredCount,
      undefined,
      session.topic,
      factorisationPlanningContext(session),
    );

    const liveSession = this.sessions.get(sessionId);
    if (!liveSession) return;
    const slot = liveSession.audits[turnIndex];
    if (!slot) return;

    slot.gpt = analysis.gpt;
    slot.challenger = analysis.challenger;
    slot.debate = analysis.debate;
    slot.conclusion = analysis.conclusion;
    slot.stageAgreement = analysis.stageAgreement;
    slot.timingMs = analysis.timingMs;
    slot.analysisStatus = "COMPLETE";
    slot.analysisSource = "AI_REVIEW";

    if (liveSession.factorisation) {
      // The AI only points at a step; the question's own step tags say which skill that is.
      slot.skillEvidence = evidenceFromAnalysis(
        slot.question, slot.skillEvidence ?? [], analysis.conclusion.firstWrongStep, analysis.conclusion.mistakeDescription,
      );
      if (liveSession.status === "ACTIVE") {
        const forceCheckSkills = analysis.conclusion.action === "ASK"
          ? [...new Set((slot.skillEvidence ?? [])
            .filter((e) => e.kind === "MISTAKE" || e.kind === "UNFINISHED" || e.kind === "DID_NOT_KNOW")
            .map((e) => e.skillId))]
          : [];
        const adjustments = this.adaptFactorisationPlan(liveSession, true, forceCheckSkills);
        slot.questionSelection.planningNote = planDecisionNote(adjustments);
        slot.adaptiveDecision = adaptiveDecisionFor(slot, adjustments);
      }
      else liveSession.finalReport = this.factorisationReport(liveSession);
    } else if (liveSession.coveragePlan) {
      this.stageLaterProbe(liveSession, analysis.conclusion.nextQuestion);
    } else if (analysis.conclusion.exitDiagnostic || analysis.conclusion.action !== "ASK") {
      this.forceSlowPath.add(sessionId);
    }

    const needsReplenish = !liveSession.coveragePlan && !liveSession.factorisation;
    await this.persist(
      liveSession, slot, true,
      needsReplenish ? [replenishReserveJobSpec(sessionId, answeredCount)] : [],
    );
    if (needsReplenish) void this.replenishReserve(sessionId).catch(() => undefined);
  }

  /** A suspected gap may earn a later flexible slot; the next question and coverage spine stay intact. */
  private stageLaterProbe(
    session: LotusSessionState,
    proposed: Omit<LotusQuestion, "id"> | undefined,
  ): void {
    if (!proposed || session.status !== "ACTIVE" || !session.coveragePlan) return;
    const currentTurn = session.audits.length + 1;
    const targetTurn = FLEXIBLE_TURNS.find(
      (turn) => turn >= currentTurn + 2 && turn <= session.coveragePlan!.length && !session.preferredFuture?.[String(turn)],
    );
    if (!targetTurn) return;
    const normalized = normalizeQuestionAnswerKey(proposed);
    const asked = [...session.audits.map((audit) => audit.question), ...(session.currentQuestion ? [session.currentQuestion] : [])];
    if (!this.validateCandidate(normalized, asked).passed) return;
    const futurePrompts = session.coveragePlan.slice(currentTurn).map((question) => questionFingerprints(question).exact);
    if (futurePrompts.includes(questionFingerprints(normalized).exact)) return;
    const staged = withQuestionId(normalized);
    const key = String(targetTurn);
    session.authorizedVariants ??= {};
    session.preferredFuture ??= {};
    session.authorizedVariants[key] = [...(session.authorizedVariants[key] ?? []), staged];
    session.preferredFuture[key] = staged.id;
  }

  /**
   * A deferred analysis that fails outright (not just late) would otherwise
   * leave a turn's evidence permanently and silently PENDING — nothing ever
   * retries it. This makes that failure visible in the record (still
   * PENDING, not falsely COMPLETE) and logged, rather than indistinguishable
   * from "still in progress". No retry is attempted; this is a known gap.
   */
  private async markDeferredAnalysisFailed(sessionId: string, turnIndex: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    const slot = session?.audits[turnIndex];
    if (!slot || slot.analysisStatus !== "PENDING") return;
    const note = "Background analysis failed and was not retried — this turn's deep evidence is missing.";
    slot.gpt = this.placeholderAssessment(note, "UNRESOLVED");
    slot.challenger = this.placeholderAssessment(note, "UNRESOLVED");
    slot.debate = this.placeholderDebate(note);
    slot.conclusion = this.placeholderClosure(note, slot.conclusion.phase, "ASK", slot.conclusion.nextQuestion, false);
    await this.persist(session!, slot, true);
  }

  /** The two independent reads, the debate, and the closure — shared by the slow path and the deferred (background) analysis so both are exactly the same pipeline, just run at different times. */
  private async runFullAnalysis(
    priorAudits: LotusQuestionAudit[],
    currentQuestion: LotusQuestion,
    response: LotusStudentResponse,
    verification: LotusMathVerification,
    elapsedSeconds: number,
    answeredCount: number,
    onStage?: (
      stage: "ASSESSING" | "DEBATING" | "CLOSING",
      partial: { gpt?: LotusModelAssessment; challenger?: LotusModelAssessment; debate?: LotusGptDebateResponse },
    ) => void,
    topic?: LotusTopic,
    planningContext?: string,
  ): Promise<{
    gpt: LotusModelAssessment;
    challenger: LotusModelAssessment;
    debate: LotusGptDebateResponse;
    conclusion: LotusDebateClosure;
    stageAgreement: LotusStageAgreement;
    timingMs: LotusStageTimingMs;
  }> {
    const independentArgs = {
      audits: priorAudits,
      currentQuestion,
      currentResponse: response,
      currentVerification: verification,
      elapsedSeconds,
      answeredCount,
      phase: currentQuestion.phase,
      topic,
      planningContext,
    };
    const t0 = Date.now();
    let [gpt, challenger] = await Promise.all([
      this.models.primaryAssessment(independentPrompt({ ...independentArgs, role: "GPT primary" })),
      this.models.challengerAssessment(independentPrompt({ ...independentArgs, role: "GPT challenger" })),
    ]);
    gpt = this.groundMathJudgment(gpt, verification);
    challenger = this.groundMathJudgment(challenger, verification);
    const tAssessment = Date.now();
    const assessmentsAgreed =
      gpt.mathJudgment === challenger.mathJudgment && gpt.proposedAction === challenger.proposedAction;
    onStage?.("DEBATING", { gpt, challenger });

    const debate = await this.models.primaryDebate(
      gptDebatePrompt({
        gpt,
        challenger,
        audits: priorAudits,
        currentEvidence: { question: currentQuestion, response, verification },
        elapsedSeconds,
        answeredCount,
        topic,
        planningContext,
      }),
    );
    const tDebate = Date.now();
    const debateChangedVerdict =
      debate.revisedAction !== gpt.proposedAction || debate.revisedPhase !== gpt.phaseRecommendation;
    onStage?.("CLOSING", { gpt, challenger, debate });

    const conclusion = await this.models.challengerClosure(
      challengerClosurePrompt({
        gpt,
        challenger,
        debate,
        audits: priorAudits,
        currentEvidence: { question: currentQuestion, response, verification },
        elapsedSeconds,
        answeredCount,
      topic,
      planningContext,
      }),
    );
    const tClosure = Date.now();
    const closureChangedVerdict = conclusion.action !== debate.revisedAction;

    return {
      gpt,
      challenger,
      debate,
      conclusion,
      stageAgreement: { assessmentsAgreed, debateChangedVerdict, closureChangedVerdict },
      timingMs: {
        assessment: tAssessment - t0,
        debate: tDebate - tAssessment,
        closure: tClosure - tDebate,
        total: tClosure - t0,
      },
    };
  }

  /** Which of the 4 fixed intents this turn's instant evidence points to. Approximate by design — it only picks a *candidate*, never a conclusion. */
  private intentFor(
    verification: LotusMathVerification,
    breakpoint: ReturnType<typeof diagnoseBreakpoint>,
  ): LotusReserveIntent {
    if (verification.status === "VERIFIED_CORRECT") return "ADVANCE";
    if (verification.status === "NO_ANSWER") return "DESCEND_PREREQUISITE";
    if (verification.status === "VERIFIED_INCORRECT") {
      if (breakpoint.status === "DIVERGED" && breakpoint.divergedAtStep === 1) return "DESCEND_PREREQUISITE";
      if (breakpoint.status === "DIVERGED") return "DISCRIMINATE";
      return "RETRY_REPRESENTATION";
    }
    return "RETRY_REPRESENTATION";
  }

  /**
   * Reads and removes one reserve candidate, or returns null so the caller
   * falls back to the slow path — the "give up freshness before you give up
   * speed" rule from the design doc. No candidate is ever handed out twice.
   */
  private takeFastCandidate(
    sessionId: string,
    verification: LotusMathVerification,
    breakpoint: ReturnType<typeof diagnoseBreakpoint>,
    previousQuestions: LotusQuestion[],
  ): ReserveCandidate | null {
    if (breakpoint.status === "NOT_DETERMINISTIC") return null;
    const reserve = this.reserves.get(sessionId);
    if (!reserve || reserve.length === 0) return null;

    const desiredIntent = this.intentFor(verification, breakpoint);
    let index = reserve.findIndex(
      (candidate) => candidate.intent === desiredIntent && this.validateCandidate(candidate.question, previousQuestions).passed,
    );
    if (index === -1) {
      index = reserve.findIndex((candidate) => this.validateCandidate(candidate.question, previousQuestions).passed);
    }
    if (index === -1) return null;
    const [chosen] = reserve.splice(index, 1);
    return chosen ?? null;
  }

  /**
   * Background-only. Asks for the whole bounded reserve (up to one
   * candidate per intent) in a single call — this, not a per-answer cap, is
   * what keeps generation from becoming an exponential tree. Best-effort: a
   * failure here just leaves the reserve as it was, and the next turn falls
   * back to the slow path.
   */
  private async replenishReserve(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "ACTIVE") return;
    const existing = this.reserves.get(sessionId) ?? [];
    if (existing.length >= RESERVE_TARGET_DEPTH) return;

    let raw: Array<{ intent: LotusReserveIntent; question: Omit<LotusQuestion, "id"> }>;
    try {
      raw = await this.models.generateReserveCandidates(
        reserveCandidatesPrompt({
          audits: session.audits,
          elapsedSeconds: Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000),
          answeredCount: session.audits.length,
          phase: session.phase,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Reserve generation failed for session ${sessionId}, leaving the reserve as-is: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const liveSession = this.sessions.get(sessionId);
    if (!liveSession || liveSession.status !== "ACTIVE") return;

    const previousQuestions = [
      ...liveSession.audits.map((audit) => audit.question),
      ...(liveSession.currentQuestion ? [liveSession.currentQuestion] : []),
    ];
    const current = this.reserves.get(sessionId) ?? [];
    for (const candidate of raw) {
      if (current.length >= RESERVE_TARGET_DEPTH) break;
      if (current.some((existingCandidate) => existingCandidate.intent === candidate.intent)) continue;
      const normalized = normalizeQuestionAnswerKey(candidate.question);
      if (!this.validateCandidate(normalized, previousQuestions).passed) continue;
      current.push({ intent: candidate.intent, question: normalized });
    }
    this.reserves.set(sessionId, current);
  }

  async override(
    sessionId: string,
    studentId: string,
    action: LotusOverrideAction,
  ): Promise<LotusSessionView> {
    this.models.assertReady();
    const session = await this.requireSession(sessionId);
    if (session.studentId !== studentId) {
      throw new BadRequestException("This Lotus session belongs to a different student.");
    }
    if (session.status !== "ACTIVE" || !session.currentQuestion) {
      throw new BadRequestException("This Lotus diagnostic is already complete.");
    }

    if (session.factorisation) {
      if (action === "REPLACE_QUESTION") {
        throw new BadRequestException("Replacing a question isn't available in the factorisation test: its questions follow a planned skill map.");
      }
      const planned = session.factorisation.state.turns.filter((turn) => turn.status !== "SKIPPED").length;
      session.factorisation.endedEarlyNote = `An observer ended the test after ${session.audits.length} of ${planned} planned questions. Skills planned after that point weren't reached.`;
      this.completeFactorisation(session);
      await this.persist(session);
      return publicCopy(session);
    }

    const latestAudit = session.audits.at(-1) ?? session.openingAudit;
    if (action === "END_NOW") {
      const conclusion = this.forcedUncertainExit(
        latestAudit.conclusion,
        session,
        latestAudit.gpt ?? this.placeholderAssessment("No AI interpretation was recorded for the latest response."),
        "An observer ended the diagnostic and requested the best available report.",
      );
      latestAudit.conclusion = conclusion;
      latestAudit.questionSelection = this.exitSelection(conclusion);
      session.status = "COMPLETE";
      session.currentQuestion = null;
      session.finalReport = conclusion.report ?? null;
      await this.persist(session);
      return publicCopy(session);
    }

    const previousQuestions = [
      ...session.audits.map((audit) => audit.question),
      session.currentQuestion,
    ];
    const replacement = normalizeQuestionAnswerKey(
      await this.models.reviseQuestion(`You are GPT primary replacing a Cogna Lotus question at an observer's request.
Current question: ${JSON.stringify(session.currentQuestion)}
Previously asked questions: ${JSON.stringify(previousQuestions.map((question) => ({ prompt: question.prompt, expression: question.answerKey.expression, purpose: question.purpose })))}

Create one materially different question that adds new diagnostic evidence. Test a competing explanation, another representation, or another area of the soft coverage spine. Ask one clear task in 28 words or fewer. Do not reuse the expression or merely change numbers. Include phase, subtopic, prompt, type, options when needed, asksForWorking, purpose, and answerKey with kind, canonicalAnswer, expression when arithmetic, and workedSolution. Return JSON only as {"question": {...}}.`),
    );
    const validation = this.validateCandidate(replacement, previousQuestions);
    if (!validation.passed) {
      throw new ServiceUnavailableException(`The replacement could not be used: ${validation.explanation}`);
    }
    session.currentQuestion = withQuestionId(replacement);
    session.phase = replacement.phase;
    latestAudit.questionSelection = {
      ...latestAudit.questionSelection,
      selectedQuestion: replacement,
      selectedFrom: "REVISED_FOR_INFORMATION_GAIN",
      reason: "An observer rejected the prior question and requested a materially different diagnostic opportunity.",
      informationGain: this.informationGain(replacement, previousQuestions),
      mathVerification: validation.mathVerification,
    };
    latestAudit.conclusion.nextQuestion = replacement;
    latestAudit.conclusion.selectionReason = latestAudit.questionSelection.reason;
    await this.persist(session);
    return publicCopy(session);
  }

  // ---------- factorisation topic ----------
  //
  // A planned test of up to 25 questions, one per slot of the factorisation
  // skill map (COGNA 10.0/FACTORISATION_SKILL_MAP.md). Every slot is authored
  // and code-validated by AI before the student sees it; there is no system
  // question fallback. The first 15 are prepared before the test starts, and
  // the remaining slots continue in the background. Code marks each
  // answer on the spot; the AI review runs in the background and can replan
  // only questions the student has not reached.

  private async startFactorisation(studentId: string): Promise<LotusSessionView> {
    const startedAt = new Date().toISOString();
    // There is deliberately no question in the session yet. The opening audit
    // below is a preparation placeholder, not a student-facing item. Q1 is
    // installed only after its AI-authored, code-validated version arrives.
    const preparationQuestion: LotusQuestion = {
      id: randomUUID(),
      phase: "EXPLORE",
      subtopic: "AI preparation",
      prompt: "Your personalised question is being prepared.",
      type: "CONSTRUCTED_RESPONSE",
      asksForWorking: false,
      purpose: "PREPARATION_ONLY",
      answerKey: { kind: "OPEN_RESPONSE", canonicalAnswer: "", workedSolution: [] },
    };
    const versions: Record<string, LotusQuestion[]> = {};
    const preferred: Record<string, string> = {};
    const note = "AI is writing and code-checking the first 15 questions before the diagnostic begins; the remaining questions continue in the background.";
    const openingAudit: LotusQuestionAudit = {
      question: preparationQuestion,
      response: null,
      verification: null,
      breakpoint: null,
      gpt: this.placeholderAssessment(note),
      challenger: this.placeholderAssessment(note),
      debate: this.placeholderDebate(note),
      conclusion: this.placeholderClosure(note, preparationQuestion.phase, "ASK", undefined, false),
      questionSelection: {
        selectedFrom: "NONE_EXIT",
        reason: note,
        informationGain: { passed: true, explanation: "The diagnostic begins after 15 AI questions pass validation; the remaining questions continue in the background." },
      },
      analysisStatus: "COMPLETE",
      analysisSource: "DETERMINISTIC",
      stageAgreement: null,
      timingMs: null,
      createdAt: startedAt,
    };
    const session: LotusSessionState = {
      sessionId: randomUUID(),
      studentId,
      grade: 8,
      board: "CBSE",
      topic: "FACTORISATION",
      status: "ACTIVE",
      experimental: true,
      phase: preparationQuestion.phase,
      startedAt,
      currentQuestion: null,
      openingAudit,
      audits: [],
      finalReport: null,
      modelConfiguration: {
        primary: `${this.models.primaryModel} · GPT primary`,
        challenger: `${this.models.challengerModel} · GPT challenger`,
      },
      liveProgress: null,
      factorisation: {
        state: {
          planTurn: 1,
          turns: FACTORISATION_SLOTS.map((spec) => ({ turn: spec.slot, slot: spec.slot, status: "PLANNED" as const, version: 0 })),
          answeredTurns: [],
          handledConfirmed: [],
          handledBroadened: [],
          fastSkips: 0,
        },
        versions,
        preferred,
        writes: [],
      },
    };
    this.sessions.set(session.sessionId, session);
    this.touch(session.sessionId);
    await this.persist(session, undefined, true);
    this.buildSkeleton(session);
    return publicCopy(session);
  }

  /** Queues an AI write for every planned turn. No fixed item is installed. */
  private buildSkeleton(session: LotusSessionState): void {
    const f = session.factorisation!;
    for (const turn of f.state.turns) {
      if (turn.turn > FACTORISATION_PREPARATION_TARGET) continue;
      const unansweredOpener = turn.turn === 1 && f.state.planTurn === 1 && session.audits.length === 0;
      if ((!unansweredOpener && turn.turn <= f.state.planTurn) || turn.status !== "PLANNED") continue;
      if (preferredItem(f, turn.turn)?.answerKey.diagnostics?.origin === "AI") continue;
      const spec = FACTORISATION_SLOTS.find((candidate) => candidate.slot === turn.slot);
      const requiredExpression = turn.turn === 1
        ? factorisationOpeningExpression(session.sessionId, this.factorisationOpeningPrints)
        : undefined;
      if (spec && (turn.turn !== 1 || requiredExpression)) this.enqueueWrite(session.sessionId, {
        turn: turn.turn,
        version: turn.version,
        request: {
          spec,
          purpose: "BASE",
          variation: `${session.sessionId}:q${turn.turn}`,
          ...(requiredExpression ? { requiredExpression } : {}),
        },
        urgent: false,
      });
    }
  }

  /** Recover jobs lost during a rejected write, hot reload, or process restart. */
  private ensureFactorisationWrites(session: LotusSessionState): void {
    const f = session.factorisation;
    if (session.status !== "ACTIVE" || !f) return;
    const queue = this.writeQueues.get(session.sessionId);
    const queued = new Set([...(queue?.activeTurns ?? []), ...(queue?.pending ?? []).map((job) => job.turn)]);
    const readyCount = Object.entries(f.preferred).filter(([turn, id]) => Number(turn) >= 1 && f.versions[turn]?.some((item) => item.id === id && item.answerKey.diagnostics?.origin === "AI")).length;
    const highestTurnToStage = readyCount >= FACTORISATION_PREPARATION_TARGET ? f.state.turns.length : FACTORISATION_PREPARATION_TARGET;
    for (const turn of f.state.turns) {
      if (turn.turn > highestTurnToStage) continue;
      const isOpeningTurn = turn.turn === 1 && f.state.planTurn === 1 && f.state.answeredTurns.length === 0;
      if (turn.status === "SKIPPED" || (!isOpeningTurn && turn.turn <= f.state.planTurn)) continue;
      if (preferredItem(f, turn.turn)?.answerKey.diagnostics?.origin === "AI" || queued.has(turn.turn)) continue;
      const spec = FACTORISATION_SLOTS.find((candidate) => candidate.slot === turn.slot);
      const requiredExpression = turn.turn === 1
        ? factorisationOpeningExpression(session.sessionId, this.factorisationOpeningPrints)
        : undefined;
      if (spec && (turn.turn !== 1 || requiredExpression)) this.enqueueWrite(session.sessionId, {
        turn: turn.turn,
        version: turn.version,
        request: {
          spec,
          purpose: "BASE",
          variation: `${session.sessionId}:q${turn.turn}`,
          ...(requiredExpression ? { requiredExpression } : {}),
        },
        urgent: true,
      });
    }
  }

  private enqueueWrite(sessionId: string, job: WriteJob): void {
    let queue = this.writeQueues.get(sessionId);
    if (!queue) {
      queue = { pending: [], running: 0, activeTurns: new Set() };
      this.writeQueues.set(sessionId, queue);
    }
    // A newer job for the same turn replaces one that hasn't started.
    queue.pending = queue.pending.filter((pending) => pending.turn !== job.turn);
    if (job.urgent) queue.pending.unshift(job);
    else queue.pending.push(job);
    this.pumpWrites(sessionId);
  }

  private pumpWrites(sessionId: string): void {
    const queue = this.writeQueues.get(sessionId);
    if (!queue) return;
    while (queue.running < FACTORY_CONCURRENCY && queue.pending.length) {
      const job = queue.pending.shift()!;
      queue.running += 1;
      queue.activeTurns.add(job.turn);
      void this.runWrite(sessionId, job)
        .catch((err) => this.logger.warn(`Question write failed for session ${sessionId} turn ${job.turn}: ${err instanceof Error ? err.message : String(err)}`))
        .finally(() => {
          queue.running -= 1;
          queue.activeTurns.delete(job.turn);
          this.pumpWrites(sessionId);
        });
    }
  }

  private writeStillWanted(f: FactorisationSession, job: WriteJob): boolean {
    const turn = f.state.turns.find((candidate) => candidate.turn === job.turn);
    const unansweredOpener = job.turn === 1 && f.state.planTurn === 1 && f.state.answeredTurns.length === 0;
    return !!turn && turn.version === job.version && (job.turn > f.state.planTurn || unansweredOpener);
  }

  /** Expressions (or prompts) already in this student's test: everything asked, plus every open turn's planned question. */
  private testPrints(session: LotusSessionState, exceptTurn?: number): string[] {
    const f = session.factorisation!;
    const asked = [...session.audits.map((audit) => audit.question), ...(session.currentQuestion ? [session.currentQuestion] : [])];
    const planned = f.state.turns
      .filter((turn) => turn.turn > f.state.planTurn && turn.status !== "SKIPPED" && turn.turn !== exceptTurn)
      .map((turn) => preferredItem(f, turn.turn))
      .filter((item): item is LotusQuestion => !!item);
    return [...asked, ...planned].map((item) => item.answerKey.diagnostics?.expression ?? item.prompt);
  }

  private async runWrite(sessionId: string, job: WriteJob): Promise<void> {
    const session = this.sessions.get(sessionId);
    const f = session?.factorisation;
    // Checked before spending a model call, and again when the result lands.
    if (!session || !f || session.status !== "ACTIVE" || !this.writeStillWanted(f, job)) return;
    const result = await this.factory.write({
      ...job.request,
      variation: `${job.request.variation ?? sessionId}:attempt${job.retryCount ?? 0}`,
      avoid: this.testPrints(session, job.turn),
    });
    await this.applyGenerated(sessionId, job, result);
  }

  private async applyGenerated(sessionId: string, job: WriteJob, result: WriteResult): Promise<void> {
    const session = this.sessions.get(sessionId);
    const f = session?.factorisation;
    if (!session || !f) return;
    const record = (outcome: FactorisationWriteLog["outcome"]) => {
      f.writes.push({ turn: job.turn, purpose: job.request.purpose, ms: result.ms, attempts: result.attempts, outcome, rejections: result.rejections, at: new Date().toISOString() });
      this.logger.log(`Factorisation write ${sessionId.slice(0, 8)} turn ${job.turn} ${job.request.purpose}: ${outcome} in ${result.ms} ms, ${result.attempts} attempt(s)${result.rejections.length ? ` — ${result.rejections.join(" | ")}` : ""}`);
    };
    const retryOrRecord = async (outcome: FactorisationWriteLog["outcome"]): Promise<void> => {
      const retryCount = job.retryCount ?? 0;
      record(outcome);
      await this.persist(session, undefined, true);
      if (retryCount >= FACTORY_MAX_RETRIES) {
        this.logger.error(`Factorisation write ${sessionId.slice(0, 8)} turn ${job.turn} exhausted ${FACTORY_MAX_RETRIES} regeneration rounds; preparation remains blocked instead of serving an unchecked item.`);
        return;
      }
      this.logger.warn(`Retrying factorisation write ${sessionId.slice(0, 8)} turn ${job.turn} (${retryCount + 1}/${FACTORY_MAX_RETRIES}) after ${outcome}.`);
      this.enqueueWrite(sessionId, { ...job, retryCount: retryCount + 1, urgent: true });
    };
    if (session.status !== "ACTIVE" || !this.writeStillWanted(f, job)) return record("STALE");
    if (!result.item) return retryOrRecord("REJECTED");
    const print = questionPrint(result.item);
    if (this.testPrints(session, job.turn).some((existing) => normalizeMathText(existing).toLowerCase() === print)) return retryOrRecord("DUPLICATE");
    if (this.factorisationGeneratedPrints.has(print)) return retryOrRecord("DUPLICATE");
    if (job.turn === 1 && this.factorisationOpeningPrints.has(print)) return retryOrRecord("DUPLICATE");
    let question: LotusQuestion;
    try {
      question = withQuestionId(result.item);
    } catch {
      return retryOrRecord("REJECTED");
    }
    const key = String(job.turn);
    f.versions[key] = [...(f.versions[key] ?? []), question];
    f.preferred[key] = question.id;
    this.factorisationGeneratedPrints.add(print);
    if (job.turn === 1) this.factorisationOpeningPrints.add(print);
    if (job.turn === 1 && session.audits.length === 0) {
      session.currentQuestion = question;
      session.phase = question.phase;
      session.openingAudit.question = question;
      session.openingAudit.questionSelection.selectedQuestion = withoutId(question);
      session.openingAudit.questionSelection.selectedFrom = "RESERVE";
      session.openingAudit.questionSelection.reason = "AI-written opener prepared before the diagnostic began.";
      session.openingAudit.questionSelection.provenance = "AI_GENERATED_FOR_SESSION";
    }
    const turn = f.state.turns.find((candidate) => candidate.turn === job.turn)!;
    if (turn.status === "SKIPPED" && turn.purpose === "AVOID") {
      // Held back until this rewrite existed. It may join the test only behind the question the browser already holds.
      const frozen = nextOpenTurn(f.state, f.state.planTurn);
      if (frozen === null || job.turn > frozen) {
        turn.status = "REPURPOSED";
        turn.reason = job.readyReason ?? turn.reason;
      }
    }
    record("USED");
    await this.persist(session, undefined, true);
  }

  /** Re-reads every skill from all evidence so far and changes the questions the student hasn't reached. */
  private adaptFactorisationPlan(session: LotusSessionState, freezeNext: boolean, forceCheckSkills: string[] = []): PlanAction[] {
    const f = session.factorisation!;
    if (session.status !== "ACTIVE") return [];
    const actions = planAdjustments({
      state: f.state,
      ledger: foldLedger(session.audits),
      freezeNext,
      forceCheckSkills,
      itemAt: (turn) => preferredItem(f, turn),
      askedItems: [...session.audits.map((audit) => audit.question), ...(session.currentQuestion ? [session.currentQuestion] : [])],
    });
    for (const action of actions) this.applyPlanAction(session, action);
    return actions;
  }

  private applyPlanAction(session: LotusSessionState, action: PlanAction): void {
    const f = session.factorisation!;
    const turn = f.state.turns.find((candidate) => candidate.turn === action.turn);
    if (!turn) return;
    turn.version += 1;
    turn.reason = action.reason;
    this.logger.log(`Factorisation plan ${session.sessionId.slice(0, 8)} turn ${action.turn}: ${action.kind}${action.kind === "REPURPOSE" ? ` ${action.purpose} ${action.forSkill}` : ""} — ${action.reason}`);
    if (action.kind === "SKIP") {
      turn.status = "SKIPPED";
      delete turn.purpose;
      delete turn.forSkill;
      return;
    }
    turn.status = "REPURPOSED";
    turn.purpose = action.purpose;
    turn.forSkill = action.forSkill;
    if (!action.spec) {
      // Never serve a fixed foundation probe. If no AI-writing spec exists
      // for this replan, leave the turn out instead of introducing a
      // hardcoded question.
      turn.status = "SKIPPED";
      turn.reason = action.skipUntilReady
        ? `Not tested: an AI version that avoids ${skillName(action.avoidSkill ?? "").toLowerCase()} was not ready.`
        : "Not tested: an AI-written version for this prerequisite was not available.";
    }
    if (action.spec) {
      this.enqueueWrite(session.sessionId, {
        turn: action.turn,
        version: turn.version,
        request: {
          spec: action.spec,
          purpose: action.purpose === "DESCENT" || action.purpose === "WIDEN" ? "BASE" : action.purpose,
          targetMistake: action.targetMistake,
          avoidSkill: action.avoidSkill,
        },
        urgent: true,
        readyReason: action.reason,
      });
    }
  }

  private async resolveFactorisationTurn(
    session: LotusSessionState,
    currentQuestion: LotusQuestion,
    response: LotusStudentResponse,
    elapsedSeconds: number,
    answeredCount: number,
  ): Promise<LotusSessionView> {
    const f = session.factorisation!;
    const state = f.state;
    const instant = instantVerdict(currentQuestion, response);
    if (instant.fastSkip) state.fastSkips += 1;

    // The next question was fixed before this answer arrived — the browser is already showing it.
    const nextTurn = nextOpenTurn(state, state.planTurn);
    let next: LotusQuestion | undefined;
    if (nextTurn !== null) {
      const versions = f.versions[String(nextTurn)] ?? [];
      next = response.nextQuestionId
        ? versions.find((item) => item.id === response.nextQuestionId)
        : preferredItem(f, nextTurn);
      if (!next) throw new BadRequestException("The next question was not authorized for this turn.");
    }

    // Every answer with something written gets the AI review; a blank skip has nothing to read.
    // An explicit support request is direct student evidence, not
    // disengagement and not something a model has to invent a story about.
    // Preserve the student's words and use a prerequisite check later, but
    // do not render placeholder model text as a completed AI analysis.
    const analyse = !instant.fastSkip && !response.didNotKnow;
    const note = response.didNotKnow
      ? "The student said they do not know this yet. That is recorded as evidence of a support need; Lotus will check an easier prerequisite where possible."
      : analyse
        ? "Code marked this answer instantly. The AI review of the working runs in the background and can change later questions."
        : "The answer was skipped without an explicit uncertainty signal.";
    const asked = [...session.audits.map((audit) => audit.question), currentQuestion];
    const nextPlan = nextTurn !== null ? state.turns.find((turn) => turn.turn === nextTurn) : undefined;
    const audit: LotusQuestionAudit = {
      question: currentQuestion,
      response,
      verification: instant.verification,
      breakpoint: null,
      conclusion: this.placeholderClosure(note, next?.phase ?? currentQuestion.phase, "ASK", next ? withoutId(next) : undefined, false),
      questionSelection: next
        ? {
            selectedQuestion: withoutId(next),
            selectedFrom: nextPlan?.status === "REPURPOSED" ? "ADAPTIVE_STAGED" : "CURRICULUM_DECK",
            reason: nextPlan?.status === "REPURPOSED" && nextPlan.reason ? nextPlan.reason : `Planned question ${nextTurn} of the factorisation test.`,
            provenance: questionProvenance(next),
            adaptationTag: nextPlan ? adaptationTagFor(nextPlan) : undefined,
            informationGain: this.informationGain(withoutId(next), asked),
          }
        : { selectedFrom: "NONE_EXIT", reason: "The planned test is complete.", informationGain: { passed: true, explanation: "No next question — the test ended." } },
      analysisStatus: analyse ? "PENDING" : "NOT_REQUIRED",
      analysisSource: response.didNotKnow ? "SUPPORT_SIGNAL" : "DETERMINISTIC",
      skillEvidence: instant.evidence,
      stageAgreement: null,
      timingMs: null,
      createdAt: new Date().toISOString(),
    };
    const turnIndex = session.audits.length;
    session.audits.push(audit);
    state.answeredTurns.push(state.planTurn);
    session.liveProgress = null;

    if (!next || nextTurn === null) {
      audit.adaptiveDecision = {
        action: "STOP",
        observedError: audit.skillEvidence?.find((e) => e.kind !== "SECURE")?.description
          ?? audit.verification?.explanation
          ?? "The planned diagnostic reached its end.",
        alternatives: ["A further question could add evidence, but there is no authorized remaining slot."],
        rationale: "The 25-slot plan has no further safe question to install.",
        expectedInformationGain: "Use the completed evidence trail and report remaining uncertainty rather than inventing another item.",
        source: "RULE_VALIDATED_PLAN",
      };
      session.currentQuestion = null;
      if (analyse) this.scheduleDeferredAnalysis(session, turnIndex, currentQuestion, response, instant.verification, elapsedSeconds, answeredCount);
      // The report is better with the last reviews in it, but the student shouldn't wait long for them.
      const tail = this.analysisTails.get(session.sessionId);
      if (tail) await settleWithin(tail, FINAL_REPORT_WAIT_MS);
      this.completeFactorisation(session);
      await this.persist(
        session, audit, true,
        analyse && audit.analysisStatus === "PENDING" ? [deferredAnalysisJobSpec(session.sessionId, turnIndex)] : [],
      );
      return publicCopy(session);
    }

    state.planTurn = nextTurn;
    session.currentQuestion = next;
    session.phase = next.phase;
    // This reply carries the new plan, so even the question after next may change.
    const adjustments = this.adaptFactorisationPlan(session, false);
    audit.questionSelection.planningNote = planDecisionNote(adjustments);
    audit.adaptiveDecision = adaptiveDecisionFor(audit, adjustments);
    await this.persist(
      session, audit, true,
      analyse ? [deferredAnalysisJobSpec(session.sessionId, turnIndex)] : [],
    );
    if (analyse) this.scheduleDeferredAnalysis(session, turnIndex, currentQuestion, response, instant.verification, elapsedSeconds, answeredCount);
    return publicCopy(session);
  }

  private factorisationReport(session: LotusSessionState) {
    const f = session.factorisation!;
    const report = buildFactorisationReport({
      ledger: foldLedger(session.audits),
      state: f.state,
      pendingAnalyses: session.audits.filter((audit) => audit.analysisStatus === "PENDING").length,
    });
    if (f.endedEarlyNote) report.limitations.unshift(f.endedEarlyNote);
    return report;
  }

  private completeFactorisation(session: LotusSessionState): void {
    const report = this.factorisationReport(session);
    const last = session.audits.at(-1) ?? session.openingAudit;
    last.questionSelection = {
      selectedFrom: "NONE_EXIT",
      reason: session.factorisation?.endedEarlyNote ?? "The planned test is complete.",
      informationGain: { passed: true, explanation: "No next question — the test ended." },
    };
    session.status = "COMPLETE";
    session.currentQuestion = null;
    session.finalReport = report;
    session.liveProgress = null;
    this.writeQueues.delete(session.sessionId);
  }

  /**
   * No-op unless LOTUS_PROGRESSIVE_STREAMING_ENABLED — purely observational,
   * never read by anything that drives a decision, so turning it off reverts
   * to the original blocking behaviour with no other code changes needed.
   */
  private setLiveProgress(
    session: LotusSessionState,
    forAnsweredCount: number,
    partial: Omit<LotusLiveProgress, "forAnsweredCount" | "updatedAt" | "reflectionPrompt">,
  ): void {
    if (!this.models.progressiveStreamingEnabled) return;
    session.liveProgress = {
      forAnsweredCount,
      updatedAt: new Date().toISOString(),
      reflectionPrompt: REFLECTION_PROMPTS[forAnsweredCount % REFLECTION_PROMPTS.length],
      ...partial,
    };
  }

  private assertOperationalConclusion(conclusion: LotusDebateClosure): void {
    if (conclusion.exitDiagnostic) {
      if (conclusion.action === "ASK" || !conclusion.report) {
        throw new ServiceUnavailableException("The AI exit decision did not include a final report.");
      }
      return;
    }
    if (conclusion.action !== "ASK" || !conclusion.nextQuestion) {
      throw new ServiceUnavailableException("The AI continuation decision did not include a next question.");
    }
  }

  private groundMathJudgment(
    assessment: LotusModelAssessment,
    verification: LotusMathVerification,
  ): LotusModelAssessment {
    const requiredJudgment = verification.status === "VERIFIED_CORRECT"
      ? "CORRECT"
      : verification.status === "VERIFIED_INCORRECT"
        ? "INCORRECT"
        : verification.status === "NO_ANSWER"
          ? "UNRESOLVED"
          : null;
    if (!requiredJudgment || assessment.mathJudgment === requiredJudgment) return assessment;
    return {
      ...assessment,
      mathJudgment: requiredJudgment,
      observations: [
        `Authoritative answer check: ${verification.explanation}`,
        ...(assessment.observations ?? []),
      ],
      conciseRationale: `The answer status is grounded by the arithmetic check. ${assessment.conciseRationale}`,
    };
  }

  private applyHardLimitExit(
    conclusion: LotusDebateClosure,
    session: LotusSessionState,
    gpt: LotusModelAssessment,
    verification: LotusMathVerification,
    elapsedSeconds: number,
    answeredCount: number,
  ): LotusDebateClosure {
    if (
      conclusion.exitDiagnostic ||
      (elapsedSeconds < MAX_DURATION_MS / 1000 && answeredCount < MAX_QUESTIONS)
    ) {
      return conclusion;
    }
    return this.forcedUncertainExit(
      conclusion,
      session,
      gpt,
      `The application ended the diagnostic at its ${
        elapsedSeconds >= MAX_DURATION_MS / 1000 ? "20-minute" : "16-question"
      } limit. Latest math status: ${verification.status}.`,
    );
  }

  /**
   * The code-level floor described at MIN_QUESTIONS_BEFORE_CONFIDENT_EXIT.
   * A confident exit this early is downgraded to one more probe of the same
   * suspected pattern — reusing the existing revision mechanism — rather
   * than accepted. If even that probe can't be produced, this falls back to
   * an honest uncertain exit, never a silently-accepted premature confident
   * one.
   */
  private async blockPrematureExit(
    conclusion: LotusDebateClosure,
    session: LotusSessionState,
    gpt: LotusModelAssessment,
    answeredCount: number,
  ): Promise<LotusDebateClosure> {
    const confidentExit = conclusion.exitDiagnostic
      && (conclusion.action === "EXIT_GAP" || conclusion.action === "EXIT_ADVANCE");
    if (!confidentExit || answeredCount >= MIN_QUESTIONS_BEFORE_CONFIDENT_EXIT) return conclusion;

    const reason = `A confident ${conclusion.action.replace("EXIT_", "").toLowerCase()} conclusion was proposed after only ${answeredCount} answered question${answeredCount === 1 ? "" : "s"}. Cogna Lotus requires at least ${MIN_QUESTIONS_BEFORE_CONFIDENT_EXIT} before a confident conclusion — one or two answers is never enough evidence for a stable gap or secure mastery claim.`;
    try {
      const nextQuestion = normalizeQuestionAnswerKey(
        await this.models.reviseQuestion(`You are GPT primary. The diagnostic just proposed to conclude "${conclusion.action}" with: "${conclusion.conclusion}" — but that is premature at only ${answeredCount} answered question(s); Cogna Lotus policy requires broader evidence before any confident conclusion.
Propose one more question that tests the same suspected pattern through a different representation, to see whether it holds up under fresh evidence. Ask one clear task in 28 words or fewer. Include phase, subtopic, prompt, type, options when needed, asksForWorking, purpose, and answerKey with kind, canonicalAnswer, expression when arithmetic, and workedSolution. Return JSON only as {"question": {...}}.`),
      );
      return {
        ...conclusion,
        exitDiagnostic: false,
        action: "ASK",
        nextQuestion,
        report: undefined,
        conclusion: `${conclusion.conclusion} ${reason}`,
        evidenceState: conclusion.evidenceState === "SUPPORTED" ? "PARTIAL" : conclusion.evidenceState,
        selectionReason: reason,
      };
    } catch {
      return this.forcedUncertainExit(conclusion, session, gpt, `${reason} A follow-up probe could not be generated.`);
    }
  }

  private forcedUncertainExit(
    conclusion: LotusDebateClosure,
    session: LotusSessionState,
    gpt: LotusModelAssessment,
    reason: string,
  ): LotusDebateClosure {
    return {
      ...conclusion,
      verdict: "ACCEPTED_WITH_UNCERTAINTY",
      conclusion: `${conclusion.conclusion} ${reason}`,
      evidenceState: conclusion.evidenceState === "SUPPORTED" ? "PARTIAL" : conclusion.evidenceState,
      uncertainty: [...(conclusion.uncertainty ?? []), reason],
      action: "EXIT_UNCERTAIN",
      selectionReason: reason,
      nextQuestion: undefined,
      exitDiagnostic: true,
      report: {
        outcome: "INSUFFICIENT_OR_CONFLICTING",
        startingPoint: conclusion.conclusion || "Continue from the strongest current evidence.",
        observedStrengths: gpt.observations?.slice(0, 4) ?? [],
        uncertainAreas: [...(conclusion.uncertainty ?? []), reason],
        evidenceSummary: session.audits.slice(-5).map(
          (audit, index) =>
            `Q${Math.max(1, session.audits.length - 4 + index)}: ${audit.question.prompt} — ${audit.response?.answer ?? "no answer"}`,
        ),
        recommendedNextStep: "Review the evidence and begin with the strongest supported or partial learning need.",
        limitations: [
          "The diagnostic ended before the agents resolved every competing explanation.",
          "This is an experimental AI-generated conclusion.",
        ],
      },
    };
  }

  private exitSelection(conclusion: LotusDebateClosure): LotusQuestionSelection {
    return {
      selectedFrom: "NONE_EXIT",
      reason: conclusion.selectionReason || conclusion.conclusion,
      informationGain: {
        passed: true,
        explanation: "No next question was selected because the diagnostic ended.",
      },
    };
  }

  private async resolveQuestionSelection(args: {
    gpt: LotusModelAssessment;
    challenger: LotusModelAssessment;
    debate: LotusGptDebateResponse;
    conclusion: LotusDebateClosure;
    previousQuestions: LotusQuestion[];
  }): Promise<LotusQuestionSelection> {
    const primaryProposal = args.gpt.proposedQuestion;
    const challengerProposal = args.challenger.proposedQuestion;
    let selectedQuestion = args.conclusion.nextQuestion
      ? normalizeQuestionAnswerKey(args.conclusion.nextQuestion)
      : undefined;
    if (!selectedQuestion) {
      return {
        primaryProposal,
        challengerProposal,
        selectedFrom: "NONE_EXIT",
        reason: "The closing agent did not provide a next question.",
        informationGain: { passed: false, explanation: "No candidate was available." },
      };
    }

    let validation = this.validateCandidate(selectedQuestion, args.previousQuestions);
    let revised = false;
    if (!validation.passed) {
      const revisionPrompt = `You are GPT primary revising one rejected Cogna Lotus question.
The candidate was rejected because: ${validation.explanation}
Previously asked questions: ${JSON.stringify(args.previousQuestions.map((question) => ({ prompt: question.prompt, expression: question.answerKey.expression, purpose: question.purpose })))}
Rejected candidate: ${JSON.stringify(selectedQuestion)}

Create one materially different question that tests a competing explanation or a different representation. Ask one clear task in 28 words or fewer. Do not reuse an expression or merely change numbers. If the question is arithmetic, the prompt's own wording must state the same expression as answerKey.expression — they will be independently cross-checked. Include phase, subtopic, prompt, type, options when needed, asksForWorking, purpose, and answerKey with kind, canonicalAnswer, expression when arithmetic, and workedSolution. Return JSON only as {"question": {...}}.`;
      selectedQuestion = normalizeQuestionAnswerKey(await this.models.reviseQuestion(revisionPrompt));
      validation = this.validateCandidate(selectedQuestion, args.previousQuestions);
      revised = true;
    }

    const matchesPrimary = questionsEquivalent(selectedQuestion, primaryProposal);
    const matchesChallenger = questionsEquivalent(selectedQuestion, challengerProposal);
    const selectedFrom: LotusQuestionSelection["selectedFrom"] = revised
      ? "REVISED_FOR_INFORMATION_GAIN"
      : matchesPrimary && matchesChallenger
        ? "BOTH"
        : matchesPrimary
          ? "PRIMARY"
          : matchesChallenger
            ? "CHALLENGER"
            : "SYNTHESIZED";
    return {
      primaryProposal,
      challengerProposal,
      selectedQuestion: validation.passed ? selectedQuestion : undefined,
      selectedFrom: validation.passed ? selectedFrom : "NONE_EXIT",
      reason: revised
        ? `The original selection was rejected: ${validation.explanation}`
        : args.conclusion.selectionReason || args.conclusion.conclusion,
      informationGain: this.informationGain(selectedQuestion, args.previousQuestions),
      mathVerification: validation.mathVerification,
    };
  }

  private informationGain(
    candidate: Omit<LotusQuestion, "id">,
    previousQuestions: LotusQuestion[],
  ): { passed: boolean; explanation: string } {
    const candidatePrint = questionFingerprints(candidate);
    const prior = previousQuestions.map(questionFingerprints);
    if (prior.some((fingerprint) => fingerprint.exact === candidatePrint.exact)) {
      return { passed: false, explanation: "The same expression or prompt has already been asked." };
    }
    const recentSameStructure = prior
      .slice(-2)
      .filter((fingerprint) => fingerprint.structure === candidatePrint.structure).length;
    if (recentSameStructure >= 2) {
      return {
        passed: false,
        explanation: "The previous two questions already used the same mathematical structure.",
      };
    }
    return {
      passed: true,
      explanation: "The selected question is not an exact repeat and does not extend a two-item structural run.",
    };
  }

  /**
   * The one gate every candidate must clear before it can be selected,
   * added to the reserve, or shown: it must add new evidence (informationGain)
   * AND its expression must independently cross-check against its own
   * prompt wording (never MISMATCHED — UNVERIFIABLE still passes, since
   * abstaining is honest, not a rejection).
   */
  private validateCandidate(
    candidate: Omit<LotusQuestion, "id">,
    previousQuestions: LotusQuestion[],
  ): { passed: boolean; explanation: string; mathVerification: ReturnType<typeof crossCheckExpressionAgainstPrompt> } {
    const informationGain = this.informationGain(candidate, previousQuestions);
    const mathVerification = crossCheckExpressionAgainstPrompt(candidate);
    if (mathVerification.status === "MISMATCHED") {
      return { passed: false, explanation: mathVerification.explanation, mathVerification };
    }
    return { passed: informationGain.passed, explanation: informationGain.explanation, mathVerification };
  }

  private placeholderAssessment(note: string, judgment: LotusModelAssessment["mathJudgment"] = "NOT_APPLICABLE"): LotusModelAssessment {
    return {
      mathJudgment: judgment,
      observations: [note],
      hypotheses: [],
      phaseRecommendation: "EXPLORE",
      proposedAction: "ASK",
      conciseRationale: note,
    };
  }

  private placeholderDebate(note: string): LotusGptDebateResponse {
    return {
      agreements: [],
      disagreements: [],
      disagreementExample: "None yet.",
      acceptedImprovements: [],
      revisedConclusion: note,
      revisedAction: "ASK",
      revisedPhase: "EXPLORE",
    };
  }

  private placeholderClosure(
    note: string,
    phase: LotusPhase,
    action: LotusProposedAction,
    nextQuestion: Omit<LotusQuestion, "id"> | undefined,
    exitDiagnostic: boolean,
  ): LotusDebateClosure {
    return {
      verdict: "UNRESOLVED",
      acceptedFromGpt: [],
      acceptedFromChallenger: [],
      rejectedClaims: [],
      conclusion: note,
      evidenceState: "PARTIAL",
      uncertainty: [note],
      phase,
      action,
      selectionReason: note,
      nextQuestion,
      exitDiagnostic,
    };
  }

  private async requireSession(sessionId: string): Promise<LotusSessionState> {
    const memory = this.sessions.get(sessionId);
    if (memory) {
      this.touch(sessionId);
      return memory;
    }
    if (lotusPersistenceEnabled(this.prisma)) {
      try {
        const loaded = await loadLotusSession(this.prisma, sessionId);
        if (loaded) {
          const restored = loaded as LotusSessionState;
          this.sessions.set(sessionId, restored);
          this.rememberFactorisationPrints(restored);
          this.touch(sessionId);
          if ((restored.coveragePlan || restored.factorisation) && restored.status === "ACTIVE") {
            restored.audits.forEach((audit, index) => {
              if (audit.analysisStatus !== "PENDING" || !audit.response || !audit.verification) return;
              const elapsedSeconds = Math.max(0, Math.floor(
                (new Date(audit.createdAt).getTime() - new Date(restored.startedAt).getTime()) / 1000,
              ));
              this.scheduleDeferredAnalysis(
                restored, index, audit.question, audit.response, audit.verification, elapsedSeconds, index + 1,
              );
            });
            // Question writes lived in memory; any turn without an accepted AI item is written again.
            if (restored.factorisation) this.buildSkeleton(restored);
          }
          return restored;
        }
      } catch (err) {
        // A missing database must not invent a session — but a lookup
        // failure that isn't "not found" (a network blip, a down DB) should
        // at least be visible, not indistinguishable from a genuinely
        // missing session.
        this.logger.warn(
          `Failed to load Lotus session ${sessionId} from the database: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    throw new NotFoundException(
      "Lotus session not found. If this API restarted before the session was persisted, start a new diagnostic.",
    );
  }

  private async persist(
    session: LotusSessionState,
    finalizedAudit?: LotusQuestionAudit,
    strict = true,
    outboxJobs: LotusOutboxJobSpec[] = [],
  ): Promise<void> {
    const prisma = this.prisma;
    if (!lotusPersistenceEnabled(prisma)) return;
    const sessionId = session.sessionId;
    this.dirty.add(sessionId);
    const previous = this.persistenceTails.get(sessionId) ?? Promise.resolve();
    let succeeded = false;
    const task = previous.catch(() => undefined).then(async () => {
      try {
        // Serialize full-payload writes per session. Snapshot only when our
        // turn arrives, so a late AI write cannot roll back a newer answer.
        const snapshot = structuredClone(session);
        await persistLotusSession(prisma, snapshot, outboxJobs);
        // Recorded whenever a specific turn's audit is finalized-for-this-call,
        // whether it is only PENDING/NOT_REQUIRED (the answer just arrived) or
        // COMPLETE (its review just finished) — appendLotusEvidence upserts on
        // (question, submission), so the COMPLETE write updates the same row
        // the PENDING write created rather than duplicating it.
        if (finalizedAudit) {
          await appendLotusEvidence(prisma, snapshot, finalizedAudit);
        }
        succeeded = true;
      } catch (err) {
        this.logger.error(
          `Failed to persist Lotus session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (strict) throw err;
      }
    });
    this.persistenceTails.set(sessionId, task);
    try {
      await task;
    } finally {
      if (this.persistenceTails.get(sessionId) === task) {
        this.persistenceTails.delete(sessionId);
        if (succeeded) this.dirty.delete(sessionId);
      }
    }
  }

  /**
   * Drains durable outbox jobs that the in-process kick-off never got the
   * chance to run (a crash between persist and the fire-and-forget call) or
   * that failed without exhausting their own in-process retries. Safe to
   * call repeatedly and from multiple instances: each job is claimed with an
   * atomic compare-and-swap, and if the work already completed in-process
   * (the common case), this just marks the job done without repeating it.
   * Exposed via a worker-authenticated endpoint, not an in-process timer —
   * the same shape as the other job types under apps/api/src/jobs/.
   */
  async processPendingOutboxJobs(limit = 20): Promise<{ claimed: number; completed: number; failed: number }> {
    const prisma = this.prisma;
    if (!lotusPersistenceEnabled(prisma)) return { claimed: 0, completed: 0, failed: 0 };
    const pending = await prisma.job.findMany({
      where: {
        jobType: { in: [OUTBOX_JOB_DEFERRED_ANALYSIS, OUTBOX_JOB_REPLENISH_RESERVE] },
        status: { in: ["PENDING", "FAILED_RETRYABLE"] },
        OR: [{ runAfter: null }, { runAfter: { lte: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    let completed = 0;
    let failed = 0;
    for (const job of pending) {
      const claim = await prisma.job.updateMany({
        where: { id: job.id, status: job.status },
        data: { status: "RUNNING", lockedAt: new Date(), lockedBy: `lotus-outbox-${process.pid}`, attemptCount: { increment: 1 } },
      });
      if (claim.count === 0) continue; // another worker won the race
      try {
        await this.runOutboxJob(job.jobType, job.payload as Record<string, unknown>);
        await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        completed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const permanent = job.attemptCount >= OUTBOX_JOB_MAX_ATTEMPTS;
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: permanent ? "FAILED_PERMANENT" : "FAILED_RETRYABLE",
            lastError: message,
            runAfter: permanent ? undefined : new Date(Date.now() + DEFERRED_ANALYSIS_RETRY_DELAY_MS * job.attemptCount),
          },
        });
        failed += 1;
        this.logger.warn(`Lotus outbox job ${job.id} (${job.jobType}) failed: ${message}`);
      }
    }
    return { claimed: pending.length, completed, failed };
  }

  private async runOutboxJob(jobType: string, payload: Record<string, unknown>): Promise<void> {
    const sessionId = payload.sessionId as string;
    if (jobType === OUTBOX_JOB_REPLENISH_RESERVE) {
      await this.replenishReserve(sessionId);
      return;
    }
    if (jobType === OUTBOX_JOB_DEFERRED_ANALYSIS) {
      const turnIndex = payload.turnIndex as number;
      const session = await this.requireSession(sessionId);
      const audit = session.audits[turnIndex];
      // Already handled — most jobs land here after the in-process call that
      // raced it already finished. Nothing to redo.
      if (!audit || audit.analysisStatus !== "PENDING" || !audit.response || !audit.verification) return;
      const elapsedSeconds = Math.max(0, Math.floor(
        (new Date(audit.createdAt).getTime() - new Date(session.startedAt).getTime()) / 1000,
      ));
      await this.runDeferredAnalysisWithRetry(
        sessionId, turnIndex, audit.question, audit.response, audit.verification, elapsedSeconds, turnIndex + 1,
      );
      return;
    }
    throw new Error(`Unknown Lotus outbox job type: ${jobType}`);
  }

  /** Always reads the durable projection, bypassing the in-process cache — for an observer/AI-Lab view that must not show one instance's stale-vs-fresh in-memory copy as if it were the database record. */
  async getForObserver(sessionId: string): Promise<LotusSessionView> {
    const prisma = this.prisma;
    if (!lotusPersistenceEnabled(prisma)) return this.get(sessionId);
    const loaded = await loadLotusSession(prisma, sessionId);
    if (!loaded) throw new NotFoundException("Lotus session not found in the database.");
    return publicCopy(loaded as LotusSessionState);
  }

  /** Rebuilds the session's state from its durable event log and cross-checks it against the stored snapshot. An audit read; never repairs anything. */
  async reconcileSession(sessionId: string): Promise<LotusReconcileResult> {
    const prisma = this.prisma;
    if (!lotusPersistenceEnabled(prisma)) {
      return { ok: false, discrepancies: ["Persistence is not configured; nothing to reconcile."], snapshot: null };
    }
    return reconcileLotusSession(prisma, sessionId);
  }

  /** Permanently deletes every durable Lotus record for a student. Cascades to evidence via the schema's onDelete: Cascade. */
  async deleteStudentData(studentId: string): Promise<{ deletedSessions: number }> {
    const prisma = this.prisma;
    if (!lotusPersistenceEnabled(prisma)) return { deletedSessions: 0 };
    const result = await prisma.lotusSessionRecord.deleteMany({ where: { studentId } });
    for (const [id, session] of this.sessions) {
      if (session.studentId === studentId) {
        this.sessions.delete(id);
        this.reserves.delete(id);
        this.forceSlowPath.delete(id);
        this.lastTouchedAt.delete(id);
        this.writeQueues.delete(id);
      }
    }
    return { deletedSessions: result.count };
  }

  /** Every durable Lotus record for a student, as structured JSON — the auditable export half of the deletion/export pair. */
  async exportStudentData(studentId: string): Promise<{
    studentId: string;
    pseudonymId: string;
    sessions: Array<{ session: LotusSessionView; events: Array<{ eventType: string; outcome: string; createdAt: Date }> }>;
  }> {
    const prisma = this.prisma;
    if (!lotusPersistenceEnabled(prisma)) return { studentId, pseudonymId: pseudonymousLearnerId(studentId), sessions: [] };
    const records = await prisma.lotusSessionRecord.findMany({
      where: { studentId },
      include: { evidence: { orderBy: { createdAt: "asc" } } },
    });
    return {
      studentId,
      pseudonymId: pseudonymousLearnerId(studentId),
      sessions: records.map((record) => ({
        session: record.payload as unknown as LotusSessionView,
        events: record.evidence.map((event) => ({
          eventType: event.eventType,
          outcome: event.outcome,
          createdAt: event.createdAt,
        })),
      })),
    };
  }
}
