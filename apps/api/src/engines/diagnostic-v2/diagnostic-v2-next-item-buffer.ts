/**
 * Process-local verified next-item buffer (MVP 9.0.1 Phase C).
 *
 * Same shape as live-teaching's module `verifiedCache` Map + hard process cap,
 * but session-scoped so items respect alreadyServed / serveOrdinal. Nothing
 * enters until renderFreshInstance (and thus verifyRendered) has passed —
 * never serve unverified payloads.
 */
import type { MicroSkillId } from "@cogna/shared";
import { findMicroSkill } from "./micro-skills.catalog";
import {
  KNOWN_TEMPLATE_IDS,
  type DiagnosticV2Item,
  type DiagnosticV2TemplateId,
} from "./diagnostic-v2-template-render";

/** ~2–3 live entries per session (plan C). */
export const SESSION_BUFFER_CAP = 3;
/** Mirrors live-teaching verifiedCache hard process cap. */
export const PROCESS_BUFFER_CAP = 500;

export interface BufferedNextItem {
  sessionId: string;
  templateId: DiagnosticV2TemplateId;
  skillId: MicroSkillId;
  item: DiagnosticV2Item;
  insertedAt: number;
}

const buffer = new Map<string, BufferedNextItem>();

export function bufferEntryKey(sessionId: string, templateId: DiagnosticV2TemplateId): string {
  return `${sessionId}::${templateId}`;
}

export function bufferSize(): number {
  return buffer.size;
}

export function sessionBufferCount(sessionId: string): number {
  let n = 0;
  for (const entry of buffer.values()) {
    if (entry.sessionId === sessionId) n++;
  }
  return n;
}

/** Test helper — clears the process-local map. */
export function clearNextItemBufferForTests(): void {
  buffer.clear();
}

/**
 * Store a verified item. Evicts the oldest entry for this session when over
 * SESSION_BUFFER_CAP, and the oldest process-wide entry when over PROCESS_BUFFER_CAP.
 * Never stores an item whose origin is not TEMPLATE_RENDERED / PRE_WRITTEN / AI_AUTHORED
 * with a concrete opening line (caller must have verified).
 */
export function putBufferedItem(entry: Omit<BufferedNextItem, "insertedAt">): void {
  if (!entry.item.openingLine?.trim()) {
    throw new Error("refusing to buffer an item without an opening line");
  }
  const key = bufferEntryKey(entry.sessionId, entry.templateId);

  // Replace existing slot for this session+template without counting twice.
  if (!buffer.has(key)) {
    while (sessionBufferCount(entry.sessionId) >= SESSION_BUFFER_CAP) {
      evictOldestForSession(entry.sessionId);
    }
  }

  buffer.set(key, { ...entry, insertedAt: Date.now() });

  while (buffer.size > PROCESS_BUFFER_CAP) {
    const first = buffer.keys().next().value;
    if (first === undefined) break;
    buffer.delete(first);
  }
}

/** Peek without consuming. */
export function peekBufferedItem(
  sessionId: string,
  templateId: DiagnosticV2TemplateId,
): DiagnosticV2Item | null {
  return buffer.get(bufferEntryKey(sessionId, templateId))?.item ?? null;
}

/**
 * Consume-once: removes the entry so two selects cannot get the same equation.
 */
export function takeBufferedItem(
  sessionId: string,
  templateId: DiagnosticV2TemplateId,
): DiagnosticV2Item | null {
  const key = bufferEntryKey(sessionId, templateId);
  const entry = buffer.get(key);
  if (!entry) return null;
  buffer.delete(key);
  return entry.item;
}

export function evictSessionBuffer(sessionId: string): void {
  for (const [key, entry] of buffer) {
    if (entry.sessionId === sessionId) buffer.delete(key);
  }
}

function evictOldestForSession(sessionId: string): void {
  let oldestKey: string | undefined;
  let oldestAt = Infinity;
  for (const [key, entry] of buffer) {
    if (entry.sessionId !== sessionId) continue;
    if (entry.insertedAt < oldestAt) {
      oldestAt = entry.insertedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) buffer.delete(oldestKey);
}

/** Prefer templates that have a known GENERATE path on this base (A + B tracks). */
const SKILL_TO_TEMPLATE: Partial<Record<MicroSkillId, DiagnosticV2TemplateId>> = {
  LIN_DISTRIBUTE_NEG: "TPL_NEG_DISTRIBUTION",
  LIN_SOLVE_TWO_STEP: "TPL_TWO_STEP",
  LIN_SOLVE_VARIABLE_BOTH: "TPL_VARIABLE_BOTH",
  FND_SIGN_MUL_DIV: "TPL_SIGN_MUL_DIV",
  LIN_SOLVE_FRACTIONS: "TPL_FRAC_SIMPLE",
  LIN_CLEAR_FRACTIONS: "TPL_FRAC_CLEAR",
  EXP_EXPAND_BINOMIALS: "TPL_EXPAND_BINOMIAL",
  ID_DIFF_SQUARES: "TPL_DIFF_SQUARES",
  FAC_MONIC_TRINOMIAL: "TPL_FAC_MONIC",
  FAC_NONMONIC_GROUP: "TPL_TRANSFER_FAC_NONMONIC",
  QUAD_STANDARD_FORM: "TPL_QUAD_STANDARD",
  QUAD_ZERO_PRODUCT: "TPL_QUAD_ZERO_PRODUCT",
  QUAD_SOLVE_UNIT_FACTOR: "TPL_QUAD_ZP_BARE",
};

export function templateForPrefetchSkill(skillId: string): DiagnosticV2TemplateId | null {
  const tpl = SKILL_TO_TEMPLATE[skillId as MicroSkillId];
  if (tpl && (KNOWN_TEMPLATE_IDS as string[]).includes(tpl)) return tpl;
  return null;
}

/**
 * Likely skill/template targets for prefetch: current item's skill, immediate
 * catalogue prerequisites that have templates, and the next backbone stage's
 * template when known. Does not prefetch per predicted wrong answer.
 */
export function likelyPrefetchTemplates(input: {
  currentTemplateId: DiagnosticV2TemplateId | null;
  currentSkillId: MicroSkillId | string;
  nextBackboneTemplateId?: DiagnosticV2TemplateId | null;
}): DiagnosticV2TemplateId[] {
  const out: DiagnosticV2TemplateId[] = [];
  const push = (t: DiagnosticV2TemplateId | null | undefined) => {
    if (t && !out.includes(t)) out.push(t);
  };

  push(input.currentTemplateId);
  push(templateForPrefetchSkill(input.currentSkillId));

  const skill = findMicroSkill(input.currentSkillId);
  if (skill) {
    for (const prereq of skill.prerequisiteMicroSkillIds) {
      push(templateForPrefetchSkill(prereq));
    }
  }

  push(input.nextBackboneTemplateId ?? null);

  // Cap to what a session buffer can hold.
  return out.slice(0, SESSION_BUFFER_CAP);
}
