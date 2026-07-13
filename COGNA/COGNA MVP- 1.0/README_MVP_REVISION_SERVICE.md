# Cogna MVP 1.0 — Revision Service

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). Owns durable revision-queue writes. Not a cognitive engine.

## Purpose

Persist, deduplicate, and update status for revision queue items proposed by the Recommendation Engine and executed under Decision + Learning Loop control.

---

## Ownership (Contracts §6)

```text
Diagnostic        → revision need signals only
Recommendation    → proposals
Revision Service  → write / dedupe / status
Decision          → may choose EXECUTE_DUE_REVISION
Learning Loop     → calls this service when executing or completing items
```

---

## Responsibilities

1. Upsert proposals into `RevisionQueueItem` without duplicates
2. Expose due items to Decision Engine
3. Mark items `PENDING` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED` | `EXPIRED`
4. Enforce simple workload caps when accepting proposals
5. Record completion outcomes (accuracy, hints, mastery before/after) when Loop reports results

---

## Interface (sketch)

```ts
interface RevisionQueueItemDraft {
  conceptId: string;
  type: string;
  targetMisconception?: string;
  priority: number;
  dueAt: Date;
  questionCount: number;
  reasoning: string;
  confidence: number;
  recommendationVersion: string;
}

interface RevisionService {
  applyProposals(studentId: string, proposals: RevisionQueueItemDraft[]): Promise<RevisionQueueItem[]>;
  listDue(studentId: string, now: Date): Promise<RevisionQueueItem[]>;
  markInProgress(itemId: string, sessionId: string): Promise<void>;
  markCompleted(itemId: string, outcome: RevisionOutcome): Promise<void>;
}
```

---

## Acceptance Criteria

- Diagnostic never writes through this service’s public “signal” path into queue rows directly
- Duplicate open items for same student+concept+type+misconception are merged/deduped
- Decision only reads due items; Loop updates status on execute/complete

---

## Simplest Definition

> **The Revision Service is the only writer of the revision queue.**
