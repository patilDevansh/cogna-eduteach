import { randomUUID } from "node:crypto";
import { algebraicallyEqual, classifyFactorisation } from "../lotus/lotus-algebra";
import { FACTORISATION_REFERENCE_PACK_V1 } from "../lotus/packs/factorisation-reference-pack";
import { FACTORISATION_TEACHING_V1, factorisationReferenceAsset } from "../personalized-videos/reference-teaching-package";

export const MODULE_FLOW = "MODULE_LEARNING_V1" as const;
export const REFERENCE_MODULE_ID = "MATH_8_FACT_MONIC_TRINOMIAL" as const;
export type ModuleSource = "SELF_DIRECTED" | "TEACHER_ASSIGNED";
export type ModuleStage = "TEACHING" | "CHECKPOINT" | "PREREQUISITE_CHECK" | "REPAIR" | "RECHECK" | "ALTERNATE" | "RETURN" | "SUPPORTED_PRACTICE" | "INDEPENDENT_EXIT" | "UNRESOLVED" | "COMPLETE";

export interface ModuleState {
  revision: number;
  stage: ModuleStage;
  segmentId: string | null;
  itemId: string | null;
  supportTarget: string | null;
  suspectedPattern: string | null;
  returnItemId: string | null;
  exitItemId: string;
  lastResult: { itemId: string; verdict: string; assistance: "LESSON_CONTEXT" | "REPAIR_CONTEXT" | "NONE" } | null;
  independentResult: { itemId: string; verdict: string } | null;
  paused: boolean;
  teacherPaused: boolean;
  workflow: "ACTIVE" | "COMPLETE" | "UNRESOLVED";
}

export interface ModuleRunIdentity {
  runId: string;
  flow: typeof MODULE_FLOW;
  studentId: string;
  source: ModuleSource;
  moduleId: typeof REFERENCE_MODULE_ID;
  packageId: string;
  packageVersion: string;
  classroomId: string | null;
  teacherId: string | null;
  repeatOfRunId: string | null;
}

export type ModuleAction =
  | { kind: "PRESENTED"; segmentId: string; representation: "SLIDES" | "STATIC_TEXT"; elapsedMs?: number }
  | { kind: "ANSWER"; itemId: string; answer: string; elapsedMs?: number }
  | { kind: "REQUEST_HELP" }
  | { kind: "PAUSE" }
  | { kind: "RESUME" }
  | { kind: "TEACHER_PAUSE" }
  | { kind: "TEACHER_RESUME" };

export function initialModuleState(exitItemId = "EXIT_FACT_01"): ModuleState {
  if (!FACTORISATION_REFERENCE_PACK_V1.exitChecks.some(item => item.id === exitItemId)) throw new Error("UNVERIFIED_EXIT_ITEM");
  return { revision: 0, stage: "TEACHING", segmentId: FACTORISATION_TEACHING_V1.default.id, itemId: null, supportTarget: null, suspectedPattern: null, returnItemId: null, exitItemId, lastResult: null, independentResult: null, paused: false, teacherPaused: false, workflow: "ACTIVE" };
}

function expectedItem(id: string) {
  const pack = FACTORISATION_REFERENCE_PACK_V1;
  return pack.supportedPractice.find(item => item.id === id)
    ?? pack.exitChecks.find(item => item.id === id)
    ?? pack.prerequisiteProbes.find(item => item.id === id)
    ?? null;
}

export function publicModuleState(identity: ModuleRunIdentity, state: ModuleState) {
  const asset = state.segmentId && ["TEACHING", "REPAIR", "ALTERNATE"].includes(state.stage) ? factorisationReferenceAsset(state.segmentId) : null;
  const item = state.itemId ? expectedItem(state.itemId) : null;
  const question = item ? {
    id: item.id,
    prompt: item.prompt,
    options: "options" in item ? item.options : null,
    independent: state.stage === "INDEPENDENT_EXIT",
  } : null;
  return { identity, state, asset, question };
}

function predictedPattern(item: { predictedMistakes: Array<{ answer: string; mistake: string }> }, answer: string): string | null {
  for (const mistake of item.predictedMistakes) {
    try { if (algebraicallyEqual(answer, mistake.answer)) return mistake.mistake; } catch { /* answer may be free text */ }
  }
  return null;
}

function next(state: ModuleState, fields: Partial<ModuleState>): ModuleState {
  return { ...state, ...fields, revision: state.revision + 1 };
}

/** Pure, bounded reference policy. It records a support target, never a confirmed misconception. */
export function advanceModule(state: ModuleState, action: ModuleAction): { state: ModuleState; observation: Record<string, unknown> } {
  if (state.workflow !== "ACTIVE") throw new Error("RUN_NOT_ACTIVE");
  if (action.kind === "TEACHER_PAUSE") {
    if (state.teacherPaused) throw new Error("ALREADY_TEACHER_PAUSED");
    return { state: next(state, { teacherPaused: true }), observation: { reason: "TEACHER_CONTROL" } };
  }
  if (action.kind === "TEACHER_RESUME") {
    if (!state.teacherPaused) throw new Error("NOT_TEACHER_PAUSED");
    return { state: next(state, { teacherPaused: false }), observation: { reason: "TEACHER_CONTROL" } };
  }
  if (state.teacherPaused) throw new Error("TEACHER_PAUSED");
  if (action.kind === "PAUSE") {
    if (state.paused) throw new Error("ALREADY_PAUSED");
    return { state: next(state, { paused: true }), observation: { reason: "VOLUNTARY_PAUSE" } };
  }
  if (action.kind === "RESUME") {
    if (!state.paused) throw new Error("NOT_PAUSED");
    return { state: next(state, { paused: false }), observation: { reason: "VOLUNTARY_RESUME" } };
  }
  if (state.paused) throw new Error("STUDENT_PAUSED");
  if (action.kind === "REQUEST_HELP") {
    if (!["CHECKPOINT", "PREREQUISITE_CHECK", "SUPPORTED_PRACTICE"].includes(state.stage)) throw new Error("HELP_NOT_AVAILABLE");
    return { state: next(state, { stage: "ALTERNATE", segmentId: FACTORISATION_TEACHING_V1.alternate.id, itemId: null, returnItemId: "PRAC_FACT_04" }), observation: { reason: "STUDENT_REQUESTED_HELP", inferredGap: false } };
  }
  if (action.kind === "PRESENTED") {
    if (action.segmentId !== state.segmentId || !["TEACHING", "REPAIR", "ALTERNATE"].includes(state.stage)) throw new Error("UNEXPECTED_SEGMENT");
    const asset = factorisationReferenceAsset(action.segmentId);
    if (!asset) throw new Error("UNVERIFIED_CONTENT");
    if (state.stage === "TEACHING") return { state: next(state, { stage: "CHECKPOINT", segmentId: null, itemId: FACTORISATION_TEACHING_V1.checkpointId }), observation: { exposureTag: asset.exposureTag, representation: action.representation, elapsedMs: action.elapsedMs ?? null } };
    if (state.stage === "REPAIR") return { state: next(state, { stage: "RECHECK", segmentId: null, itemId: asset.recheckId }), observation: { exposureTag: asset.exposureTag, representation: action.representation, supportTarget: state.supportTarget, elapsedMs: action.elapsedMs ?? null } };
    return { state: next(state, { stage: "RETURN", segmentId: null, itemId: state.returnItemId ?? "PRAC_FACT_04" }), observation: { exposureTag: asset.exposureTag, representation: action.representation, inferredGap: false, elapsedMs: action.elapsedMs ?? null } };
  }
  if (action.kind !== "ANSWER" || action.itemId !== state.itemId || !action.answer.trim() || action.answer.length > 240) throw new Error("UNEXPECTED_ANSWER");
  const item = expectedItem(action.itemId);
  if (!item) throw new Error("UNVERIFIED_ITEM");
  const isProbe = "options" in item;
  const verdict = isProbe ? (action.answer.trim().toLowerCase() === item.canonicalAnswer.toLowerCase() ? "CORRECT" : "INCORRECT") : classifyFactorisation(action.answer, item.expression);
  const assistance = state.stage === "INDEPENDENT_EXIT" ? "NONE" as const : state.stage === "RECHECK" || state.stage === "RETURN" ? "REPAIR_CONTEXT" as const : "LESSON_CONTEXT" as const;
  const baseObservation = { itemId: item.id, answer: action.answer, verdict, assistance, elapsedMs: action.elapsedMs ?? null, verifierVersion: isProbe ? "reviewed-probe-v1" : "factorisation-algebra-v1" };
  const result = { itemId: item.id, verdict, assistance };
  if (state.stage === "CHECKPOINT") {
    if (verdict === "CORRECT") return { state: next(state, { stage: "SUPPORTED_PRACTICE", itemId: "PRAC_FACT_02", lastResult: result }), observation: baseObservation };
    const pattern = !isProbe && verdict === "INCORRECT" ? predictedPattern(item, action.answer) : null;
    const probe = pattern === "SIGN_PAIR_ERROR" ? "PREREQ_PROBE_01_SIGN_PRODUCT" : pattern === "WRONG_FACTOR_PAIR_SUM" ? "PREREQ_PROBE_02_FACTOR_PAIRS" : null;
    if (probe) return { state: next(state, { stage: "PREREQUISITE_CHECK", itemId: probe, suspectedPattern: pattern, lastResult: result, returnItemId: "PRAC_FACT_04" }), observation: { ...baseObservation, suspectedPattern: pattern, confirmedGap: false } };
    return { state: next(state, { stage: "ALTERNATE", itemId: null, segmentId: FACTORISATION_TEACHING_V1.alternate.id, lastResult: result, returnItemId: "PRAC_FACT_04" }), observation: { ...baseObservation, suspectedPattern: null, confirmedGap: false } };
  }
  if (state.stage === "PREREQUISITE_CHECK") {
    const repair = item.id === "PREREQ_PROBE_01_SIGN_PRODUCT" ? FACTORISATION_TEACHING_V1.repairs[0] : FACTORISATION_TEACHING_V1.repairs[1];
    if (verdict === "CORRECT") return { state: next(state, { stage: "ALTERNATE", itemId: null, segmentId: FACTORISATION_TEACHING_V1.alternate.id, lastResult: result, supportTarget: null }), observation: { ...baseObservation, supportTarget: null, confirmedGap: false } };
    return { state: next(state, { stage: "REPAIR", itemId: null, segmentId: repair.id, supportTarget: repair.skillId, lastResult: result }), observation: { ...baseObservation, supportTarget: repair.skillId, confirmedGap: false } };
  }
  if (state.stage === "RECHECK" || state.stage === "RETURN") {
    if (verdict !== "CORRECT") return { state: next(state, { stage: "UNRESOLVED", itemId: null, workflow: "UNRESOLVED", lastResult: result }), observation: { ...baseObservation, unresolvedTarget: state.supportTarget } };
    return { state: next(state, { stage: state.stage === "RECHECK" ? "RETURN" : "INDEPENDENT_EXIT", itemId: state.stage === "RECHECK" ? state.returnItemId ?? "PRAC_FACT_04" : state.exitItemId ?? "EXIT_FACT_01", lastResult: result, supportTarget: null }), observation: { ...baseObservation, supportTarget: state.supportTarget, recheckCorrect: true } };
  }
  if (state.stage === "SUPPORTED_PRACTICE") {
    if (verdict !== "CORRECT") return { state: next(state, { stage: "ALTERNATE", itemId: null, segmentId: FACTORISATION_TEACHING_V1.alternate.id, returnItemId: "PRAC_FACT_04", lastResult: result }), observation: baseObservation };
    return { state: next(state, { stage: "INDEPENDENT_EXIT", itemId: state.exitItemId ?? "EXIT_FACT_01", lastResult: result }), observation: baseObservation };
  }
  if (state.stage === "INDEPENDENT_EXIT") return { state: next(state, { stage: "COMPLETE", itemId: null, workflow: "COMPLETE", lastResult: result, independentResult: { itemId: item.id, verdict } }), observation: { ...baseObservation, independent: true } };
  throw new Error("UNEXPECTED_STAGE");
}

export function newRunId(): string { return randomUUID(); }
