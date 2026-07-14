# Cogna MVP 5.0 — Skipped

## MVP 5.0 Pilot — Deferred to post-pilot

### Learned Policy Training Pipeline

- **Reason:** Infrastructure complete, but actual model training requires production data volume.
- **Return when:** Pilot generates sufficient decision logs (≥100k decisions across ≥50 students); offline training job scheduled.
- **Status:** PolicyEngineService always returns baseline; shadow mode infrastructure ready.

### Dual-Control API Endpoints

- **Reason:** Policy promotion/rollback methods exist but require API endpoints + auth checks.
- **Return when:** Admin API spec finalized; dual-control auth middleware implemented.
- **Status:** PolicyEngineService.promotePolicy and rollbackPolicy exist; need HTTP layer.

### Golden Tests A03, A04, A06, A09, A13, A14

- **Reason:** Full implementation requires runtime infrastructure (learned policy inference, retest validation, ops workflows).
- **Return when:** Learned policy training complete (A03, A04); modality asset review pipeline operational (A06, A13, A14); API endpoints for dual-control (A09).
- **Status:** Test stubs created as documentation of requirements.

### Golden Tests A08, A10 — Test Isolation Issue

- **Status:** Infrastructure implemented and functional. Tests pass when run individually but have database state isolation issues when run with full test suite. PolicyEngineService shadow mode and rollback methods work correctly (confirmed by individual test runs and service logs).
- **Return when:** Test isolation improved (e.g., test-level transactions, per-test databases, or sequential test execution).

### Modality Asset Review Pipeline

- **Reason:** Requires human review workflow, transcript validation tooling, retest question mapping UI.
- **Return when:** Content team staffed; review tooling built.
- **Status:** Schema + service exist; `reviewStatus` enforced in ModalityDirector.

### Dataset Build Job

- **Reason:** Offline batch job for extracting decision features/outcomes from logs.
- **Return when:** Pilot runs; production logs available for export.
- **Status:** Job type planned but not implemented.

## Open Skips (beyond 5.0 / research)

### Beyond — Fully autonomous tool-using tutors

- **Reason:** Conflicts with bounded-specialist safety model.
- **Return when:** Explicit future product decision + new era docs.

### Beyond — Online continual RL on live students

- **Reason:** Safety and consent; MVP 5.0 is offline train + promote.
- **Return when:** Research protocol approved.

### V5 — Broad science / multi-board curricula

- **Reason:** Thin slice first if at all.
- **Return when:** Math path proven + staffing.
- **Status update (2026-07-13):** Science is **explicitly out of MVP 5.0 pilot scope** — marked as Phase 6 research in Content Spec. Multi-subject architecture supports science design, but pilot focuses exclusively on mathematics units until proven stable. Science content, subject graph, and cross-subject transfer remain deferred.

## Non-Goals

- Clinical diagnosis
- Unchecked generative math
- Replacing human review for factual correctness
- Microservices-for-its-own-sake
