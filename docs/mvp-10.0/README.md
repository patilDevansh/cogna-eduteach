# Cogna MVP 10.0 — Production Classroom System

**Status: Canonical / Frozen**  
**Implementation status: Active**

## Product contract

Cogna provides one durable, teacher-controlled classroom lifecycle:

1. A verified teacher creates a school-owned class and receives a unique join code.
2. Signed-in students enroll with that code from separate devices.
3. The teacher launches a Cogna Lotus diagnostic for every active enrollee.
4. Submitted diagnostic evidence is persisted and aggregated into the class report. Deterministic math verification remains authoritative; AI interpretation cannot change right/wrong facts.
5. Only after every active diagnostic is complete may the teacher launch personalized teaching.
6. Teaching uses the existing safety-gated personalized-video pipeline plus scored interactive learning challenges. Practice and assistance are never counted as independent evidence.
7. Only after teaching completes may the teacher launch a fresh personalized independent exit check.
8. The final teacher report presents diagnostic, teaching, and exit evidence separately, including incomplete, failed, conflicting, and insufficient evidence.

## Required modes

- `production` is the default: PostgreSQL-backed, authenticated, cross-device, teacher-owned data.
- `demo` remains explicit: mock classroom setup, mock roster, and mock reports are preserved under prototype routes or a `demo=1` view.
- Production reports must never silently substitute mock data.

## Lifecycle

`ENROLLMENT → DIAGNOSTIC → CLASS_REPORT → TEACHING → INDEPENDENT_EXIT → FINAL_REPORT → COMPLETE`

Assignments are durable per student and stage. Re-launching a stage is idempotent and may add newly enrolled students without duplicating prior assignments.

## Evidence and safety invariants

- No unchecked LLM math reaches students.
- Diagnostic, assisted teaching, gamified practice, and independent exit evidence remain separate.
- A watched video or game score is engagement/practice evidence, never proof of mastery.
- A personalized exit item must come from the learner’s evidenced target and be verified before use.
- Teachers can access only classrooms in their school and under their account.
- Students can access or mutate only their own enrollment and assignments.

## Acceptance gates

- Database migration and generated client validate.
- API and web TypeScript checks pass.
- Automated classroom lifecycle tests cover ownership, code enrollment, phase gating, idempotent launch, student assignment isolation, and report aggregation.
- A browser walkthrough proves teacher create → student join → diagnostic → teaching → exit → report with demo mode still available.
