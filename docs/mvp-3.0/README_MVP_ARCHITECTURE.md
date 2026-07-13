# MVP 3.0 — Architecture

> **Delta from MVP 2.0:** Adds LLM-assisted content drafting services, experiment registry, candidate action scoring, and an analysis harness — all under validation gates. Keeps the modular monolith.

## Architecture Principle

Cogna remains an **event-driven learning loop** with bounded engines. MVP 3.0 adds **assisted authoring** and **bounded experiment arms**, not open-ended agents.

```text
Student action
  -> raw event
  -> grading / evidence
  -> Diagnostic Engine
  -> Learner Profile (v2 factors + experiment assignment)
  -> Decision Engine
       |-- control: decision-rules-v2 / v3 baseline
       |-- experiment arm: candidate scorer (registered only)
  -> content provider (APPROVED only)
  -> response
  -> reports / revision / observability / experiment outcomes
```

Authoring path (off hot path):

```text
Draft request (human or LLM-assisted)
  -> Content Draft Service
  -> Validation Service (schema + math checks)
  -> Content Review (human)
  -> APPROVED bank
```

## Modules

| Module | MVP 3.0 responsibility |
|---|---|
| Learning Loop | Tx1–Tx4 unchanged; records experiment context on decisions |
| Diagnostic Engine | Carry MVP 2.0 factors; emit features for candidate scoring |
| Decision Engine | Baseline policy + optional experiment branch |
| Candidate Scorer | Scores legal action candidates; never invents uiActions |
| Experiment Registry | Defines experiments, arms, eligibility, assignment |
| Question Generator | APPROVED bank; may use draft-origin metadata for analytics only |
| Explanation Engine | Serve APPROVED templates; draft templates stay off student path |
| Content Draft Service | LLM-assisted drafts → `DRAFT` / `PENDING_REVIEW` only |
| Validation Service | Schema, answer verification, tag consistency |
| Content Review Service | Human gates; reject / approve with audit trail |
| Recommendation / Revision | Carry MVP 2.0; optional experiment variants |
| Report Generator | Carry MVP 2.0; may note experiment participation only if consented |
| Observability | Pilot metrics + experiment arm metrics + draft funnel |
| Analysis Harness | Offline exports: assignment × outcome tables |

## Runtime Topology

```text
apps/web     Next.js
apps/api     NestJS modular monolith
postgres     primary state + event log + experiments + drafts
jobs         weekly reports, email, item stats, LLM draft jobs, analysis exports
llm provider optional, off hot path, never student-facing math
```

## Data Flow: LLM Draft (off hot path)

```text
POST /content/drafts (or job CONTENT_LLM_DRAFT)
  -> call provider with constrained prompt + concept/misconception IDs
  -> store ContentDraft (status DRAFT)
  -> ValidationService.run
  -> status VALIDATED | VALIDATION_FAILED
  -> human review queue
  -> APPROVED → promote to Question / Explanation template
```

## Data Flow: Experiment Assignment

```text
Student enters eligible session
  -> ExperimentRegistry.resolveAssignment(studentId, experimentKey)
  -> write ExperimentAssignment if missing (sticky)
  -> Decision Engine loads arm
  -> if control: decision-rules-v*
  -> if scored: CandidateScorer.rank(legalCandidates) → pick top legal
  -> persist decision with experimentId + armId in inputSnapshot
```

## Anti-Scope

- No autonomous LLM calling engines on the student hot path
- No unchecked generated content to students
- No default production bandit / RL
- No multi-unit curriculum graph (MVP 4.0)
- No multi-modal providers (MVP 5.0)

## Success Criteria

- 100% of student math items remain APPROVED.
- Every LLM draft has validation + review trail before APPROVED.
- Experiment arms are sticky, audited, and exportable.
- Candidate scorer only chooses among Decision Engine–legal candidates.
- Control arm matches MVP 2.0 golden behavior within tolerance.
