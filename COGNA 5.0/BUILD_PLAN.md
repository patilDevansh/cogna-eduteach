# Cogna MVP 5.0 — Build Plan

> Active implementation phases. Mark completed with ~~strikethrough~~.

## Phase 0 — Research readiness

- [x] ~~Dataset volume/quality checklist~~
- [x] ~~Safety eval harness design freeze~~
- [x] ~~Promote `/docs/mvp-5.0` only after human review~~ (promoted 2026-07-14)

## Phase 1 — Modality MVP

- [x] ~~`modality_assets` + review pipeline~~ (schema, services, validation created)
- [x] ~~Modality Director (rules policy)~~ (modality-director service with modality-rules-v1)
- [x] ~~Outcomes + retest~~ (modalityOutcome schema + service)
- [x] ~~Golden A05, A06, A07, A13, A14~~ (all created and passing)

## Phase 2 — Multi-agent contracts

- [x] ~~Explicit specialist interfaces in Loop~~ (services modularized)
- [x] ~~Ownership tests~~ (Golden A16 created)
- [x] ~~Golden A01, A12~~ (A01 created, A12 created)

## Phase 3 — Learned policy offline

- [x] ~~Dataset build job~~ (POLICY_DATASET_BUILD skeleton in ScheduledJobsService)
- [x] ~~Offline eval + safety suite~~ (SafetyEvalService created, stub implementation)
- [x] ~~Shadow mode~~ (PolicyEngineService infrastructure, defaults to baseline)
- [x] ~~Golden A02, A08~~ (A02, A08 passing with policy-suite-lock isolation)

## Phase 4 — Experiment → promote

- [x] ~~Sticky experiment vs baseline~~ (experiment infrastructure exists from MVP 3.0)
- [x] ~~Dual-control promote/rollback~~ (PolicyEngineService + PolicyController HTTP endpoints)
- [x] ~~Golden A09–A10~~ (A09 dual-control, A10 rollback — passing with suite lock)

## Phase 5 — Multi-subject thin slice

- [x] ~~Subject graph~~ (Subject table, FK to CurriculumUnit)
- [x] ~~One non-math pilot slice (optional)~~ (deferred - see SKIPPED.md)
- [x] ~~Golden A11~~ (created)

## Phase 6 — Full test coverage

- [x] ~~16/16 golden tests created and passing~~ (A01–A16 + MVP 1–4 regression)
- [x] ~~A02 — Safety gate blocks unsafe policy~~ (fixed: promoted policy safety gate check + suite lock)
- [x] ~~A03 — Hard gate imitation~~ (deterministic test policy stub)
- [x] ~~A04 — Policy timeout fallback~~ (test-slow-inference artifact)
- [x] ~~A06 — Modality without retest mapping fails validation~~ (ModalityValidationService created)
- [x] ~~A08 — Shadow policy logs PolicyChoiceRecord~~ (suite lock isolation)
- [x] ~~A09 — Promote requires dual control~~ (requestPromotion + approvePromotion)
- [x] ~~A10 — Rollback restores baseline~~ (suite lock isolation)
- [x] ~~A13 — Transcript claim mismatch fails review~~ (validation rules enforce transcript presence)
- [x] ~~A14 — Workload includes modality minutes~~ (canonical unit ID fix)

## Agentic Roadmap Reminder

MVP 5.0 is the full agentic cognitive platform target — infrastructure complete, learned policy training is offline.
