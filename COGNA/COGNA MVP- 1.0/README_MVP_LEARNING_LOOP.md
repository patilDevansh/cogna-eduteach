# Cogna MVP 1.0 — Learning Loop

> Depends on [Shared Contracts](./README_MVP_CONTRACTS.md). This module orchestrates; it does not redefine contracts.

## Purpose

The Learning Loop ensures every meaningful student interaction becomes:

> **Stored evidence → updated learner understanding → one LearningDecision → resolved content**

It is not an AI model. It coordinates engines in order and enforces staged durability (Contracts §2).

---

## Responsibilities

1. Receive structured student events
2. Validate integrity and authorization
3. Enforce idempotency on `eventId`
4. Preserve raw evidence (Tx1)
5. Grade answers deterministically (Contracts §12)
6. Call Diagnostic Engine; commit profile updates (Tx2)
7. Call Decision Engine; store `LearningDecision` (Tx3)
8. Route by `uiAction` to content engines (Tx4)
9. Return one clear next action to the UI
10. Record audit trail and processing status
11. Handle stage failures per Contracts §2
12. Support replay

---

## Events

MVP events: Contracts §19.

### Example `ANSWER_SUBMITTED`

```json
{
  "eventId": "evt_01J...",
  "eventType": "ANSWER_SUBMITTED",
  "studentId": "student_104",
  "sessionId": "session_991",
  "questionId": "equation_203",
  "submittedAnswer": "x = -4",
  "timeToFirstResponseMs": 18000,
  "totalTimeMs": 62000,
  "idleTimeMs": 4000,
  "attemptNumber": 1,
  "hintCount": 1,
  "highestHintLevel": 1,
  "selfRatedConfidence": 5,
  "answerChangedBeforeSubmit": true,
  "clientTimestamp": "2026-07-10T08:00:00Z"
}
```

`selfRatedConfidence` is `1–5` or omitted/`null` (Contracts §10).

---

## Validation

Before processing:

- Student, session, question exist and are authorized
- Event not already processed
- Event belongs to session
- Timing non-negative and plausible
- Answer format acceptable
- Confidence in `{1,2,3,4,5}` or null
- Hint levels valid
- Required fields present
- Client timestamp plausible
- Question not invalidated

Invalid events must not update the learner profile.

---

## Observation vs Inference vs Decision

The Loop preserves the separation:

1. **Observation** — raw attempt fields (never overwritten)
2. **Inference** — Diagnostic Engine output
3. **Decision** — `LearningDecision` (Contracts §1)

---

## Grading

Deterministic normalized matching (Contracts §12).

---

## Staged Processing

See Contracts §2 for transactions and states.

```text
RECEIVED → VALIDATED → GRADED
  → PROFILE_UPDATED → DECIDED → CONTENT_RESOLVED → COMPLETED
```

Failures land in `FAILED_RETRYABLE` or `FAILED_PERMANENT` without erasing earlier durable stages.

### Idempotency

```text
If eventId already COMPLETED (or past GRADED with stored result):
  return stored result
  do not grade again
  do not update mastery again
  do not mint a new decision
```

Partial retries resume from the first incomplete stage.

---

## Engine Calls

### After grade → Diagnostic Engine

Pass attempt, question metadata, recent history, prior profile, `diagnosticModelVersion`.

Persist output + profile version in Tx2.

### After profile → Decision Engine

Pass learner state, remediation states, revision due items, session mode/length, `decisionModelVersion`.

Persist full `LearningDecision` in Tx3.

### Route by `uiAction` (Tx4)

```text
SHOW_QUESTION
  → Question Generator
  → if learningIntent == EXECUTE_DUE_REVISION: Revision Service marks item in progress / completed as appropriate

SHOW_EXPLANATION | SHOW_HINT
  → Explanation Engine

END_SESSION
  → Recommendation Engine (propose revision drafts → Revision Service)
  → Report Generator (session summary)

SUGGEST_BREAK
  → return message; no content engine required
```

### Post-explanation

Contracts §14: after explanation, Loop calls Decision again for `RETEST_AFTER_EXPLANATION`.

### Hints

Contracts §5: `POST /practice/hint` → record `HINT_REQUESTED` → Explanation Engine → diagnostic evidence on later answers / immediate hint signals as designed.

---

## Output to UI

```json
{
  "uiAction": "SHOW_QUESTION",
  "learningIntent": "TARGET_MISCONCEPTION",
  "question": {
    "id": "equation_204",
    "stem": "Solve: x - 6 = 10",
    "type": "NUMERIC",
    "difficulty": 2
  },
  "studentMessage": "Let's try one that focuses on the same idea.",
  "decisionMetadata": {
    "decisionId": "decision_882",
    "decisionVersion": "decision-rules-v1"
  }
}
```

Never expose internal labels such as “overconfident” or “low mastery” in `studentMessage`.

---

## Audit Trail

For each event, reconstruct: raw event, validation, grade, diagnostic version/output, prior/new profile, decision version/output, content engine result, durations, fallbacks.

---

## Safe Content Fallback

1. Reviewed question matching concept + difficulty
2. Same concept, lower difficulty
3. Reviewed prerequisite question
4. End session safely

Never fall back to unchecked LLM-generated mathematics.

---

## Privacy and Child Safety

- Collect only necessary learning signals
- No clinical diagnoses or permanent labels
- Keep raw evidence separate from interpretation
- Encrypt sensitive data; support deletion/retention
- Store consent; restrict by role
- Do not expose internal diagnostic labels to students

---

## MVP Acceptance

- Every valid answer → exactly one attempt
- Duplicate `eventId` → no duplicate updates
- Staged durability matches Contracts §2
- Every graded attempt → one diagnostic run (or explicit retryable failure)
- Every successful profile update → one decision (or fallback decision)
- Routing matches Contracts §15
- Raw evidence never overwritten
- Versions stored for grade/diagnostic/decision/content selection

---

## Simplest Definition

> **The Learning Loop makes sure nothing a student does is wasted: every interaction is durably stored, cautiously interpreted, and turned into exactly one shared LearningDecision.**
