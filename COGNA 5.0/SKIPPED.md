# Cogna MVP 5.0 — Skipped

## MVP 5.0 Pilot — Deferred to post-pilot

### Learned Policy Training Pipeline

- **Reason:** Infrastructure complete, but actual model training requires production data volume.
- **Return when:** Pilot generates sufficient decision logs (≥100k decisions across ≥50 students); offline training job scheduled.
- **Status:** PolicyEngineService always returns baseline; shadow mode infrastructure ready; POLICY_DATASET_BUILD job skeleton exports session/score features.

### Production Auth for Policy Ops API

- **Reason:** PolicyController endpoints exist but production auth middleware (policy_ops role, dual-control actor validation) not wired.
- **Return when:** Admin API spec finalized; auth middleware implemented per PRODUCTION_AUTH.md.
- **Status:** HTTP layer complete (request-promotion, approve-promotion, reject-promotion, rollback); auth deferred.

### Modality Asset Review Pipeline (Human UI)

- **Reason:** Human review UI requires content team workflows, transcript validation tooling, retest question mapping interface.
- **Return when:** Content team staffed; review tooling UI built.
- **Status:** Validation service API complete (ModalityValidationService); `reviewStatus` enforced in ModalityDirector; human UI deferred.

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
