import type { StudentInteractionContext } from "@cogna/shared";

const LIMIT = 86400000;
/** Keeps counters only. No input text or keystroke history leaves this collector. */
export class InteractionObservation {
  private readonly started: number;
  private firstInput: number | null = null;
  private hiddenStart: number | null;
  private offlineStart: number | null;
  private hiddenMs = 0;
  private offlineMs = 0;
  private visibilityChanges = 0;
  private offlineTransitions = 0;
  private revisions = 0;
  private lastAnswer = "";
  private lastAnswerInput: number | null = null;
  private presentedAt: string | null;
  constructor(private readonly identity: Pick<StudentInteractionContext, "source" | "questionId" | "questionVersion" | "format" | "observationId">,
    private readonly clock: () => number, private readonly iso: () => string,
    hidden: boolean, offline: boolean, private readonly pageReloaded: boolean, private readonly partial = false) {
    this.started = clock();
    this.hiddenStart = hidden ? this.started : null;
    this.offlineStart = offline ? this.started : null;
    this.presentedAt = hidden ? null : iso();
  }
  visibility(hidden: boolean) {
    if (hidden === (this.hiddenStart !== null)) return;
    this.visibilityChanges++;
    if (hidden) this.hiddenStart = this.clock();
    else { this.hiddenMs += this.clock() - this.hiddenStart!; this.hiddenStart = null; this.presentedAt ??= this.iso(); }
  }
  connection(offline: boolean) {
    if (offline === (this.offlineStart !== null)) return;
    if (offline) { this.offlineTransitions++; this.offlineStart = this.clock(); }
    else { this.offlineMs += this.clock() - this.offlineStart!; this.offlineStart = null; }
  }
  input(value: string, discrete = false) {
    if (value === this.lastAnswer) return;
    const now = this.clock();
    if (value.trim()) this.firstInput ??= now;
    if (this.lastAnswerInput !== null && (discrete || now - this.lastAnswerInput >= 1000)) this.revisions++;
    if (this.firstInput !== null) this.lastAnswerInput = now;
    this.lastAnswer = value;
  }
  workingInput() { this.firstInput ??= this.clock(); }
  snapshot(confidence: StudentInteractionContext["confidence"]): StudentInteractionContext {
    const now = this.clock();
    const elapsed = Math.max(0, now - this.started);
    const bounded = (value: number) => Math.min(LIMIT, Math.max(0, Math.round(value)));
    return {
      schemaVersion: 1, ...this.identity, presentedAt: this.presentedAt,
      timing: { basis: "CLIENT_ITEM_MOUNT", elapsedMs: bounded(elapsed), firstInputMs: this.firstInput === null ? null : bounded(this.firstInput - this.started), hiddenMs: Math.min(bounded(elapsed), bounded(this.hiddenMs + (this.hiddenStart === null ? 0 : now - this.hiddenStart))), visibilityChanges: Math.min(100000, this.visibilityChanges), complete: !this.pageReloaded && !this.partial && elapsed <= LIMIT },
      revisionsAfterFirstInput: Math.min(100000, this.revisions), confidence: { ...confidence },
      technical: { offlineMs: Math.min(bounded(elapsed), bounded(this.offlineMs + (this.offlineStart === null ? 0 : now - this.offlineStart))), offlineTransitions: Math.min(100000, this.offlineTransitions), pageReloaded: this.pageReloaded },
    };
  }
}

/** One answerable presentation episode; re-showing an item starts a partial new episode. */
export class InteractionObservationSlot {
  private entry: { key: string; observation: InteractionObservation; active: boolean } | null = null;
  activate(key: string, create: (partial: boolean) => InteractionObservation): InteractionObservation {
    if (this.entry?.key === key && this.entry.active) return this.entry.observation;
    const partial = this.entry?.key === key;
    this.entry = { key, observation: create(partial), active: true };
    return this.entry.observation;
  }
  deactivate() { if (this.entry) this.entry.active = false; }
  get(key: string) { return this.entry?.key === key && this.entry.active ? this.entry.observation : null; }
}

/**
 * A record for a submit that has no live observation (the collector was switched off, or the question was re-mounted).
 * It is measured from when the question first rendered and is always marked incomplete.
 */
export function snapshotWithoutLiveObservation(
  identity: Pick<StudentInteractionContext, "source" | "questionId" | "questionVersion" | "format">,
  firstSeenAt: number | null,
  confidence: StudentInteractionContext["confidence"],
  now: () => number = () => performance.now(),
  iso: () => string = () => new Date().toISOString(),
): StudentInteractionContext {
  const started = firstSeenAt ?? now();
  // The collector reads the clock once when built (its zero point), so the first reading is 0 and the rest count from first render.
  let built = false;
  const clock = () => { if (!built) { built = true; return 0; } return now() - started; };
  const observation = new InteractionObservation({ ...identity, observationId: crypto.randomUUID() }, clock, iso, false, false, false, true);
  return observation.snapshot(confidence);
}
