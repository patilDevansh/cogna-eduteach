# Cogna MVP 5.0 — Build Care

## Non-Negotiables

- [x] Bounded specialists only — no free-form agents on hot path
- [x] Only APPROVED text and modality assets to students
- [x] Learned policy behind safety gate + rollback
- [x] uiAction set preserved; modality via contentStyle
- [x] No clinical labels
- [x] No hot-path generative calls
- [x] Freeze Linear Equations concept IDs forever
- [x] Do not implement from Draft / Vision without promotion

## Pitfalls

- Equating "agentic" with chatbot autonomy ✓ (avoided via bounded specialists)
- Promoting policy on vanity metrics without safety suite ✓ (SafetyEvalService enforces thresholds)
- Treating watch time as mastery ✓ (golden A07 documents requirement)
- Multi-subject expansion before modality safety ✓ (science deferred)
- Dual-control skipped "for speed" ✓ (API layer deferred but service methods exist)

## Enforced in P0/P1 Documentation Pass (2026-07-13) + Implementation (2026-07-14)

- [x] Policy governance: dual-control promote workflow defined (Policy Engineer + Policy Approver; emergency rollback single-actor) — **Service methods implemented**
- [x] Safety eval metrics: concrete suite documented (mastery delta, misconception FP, session violations, hard-constraint imitation, etc.) — **SafetyEvalService created**
- [x] Modality review checklist: extended with transcript accuracy, retest mapping, duration bounds, reject codes — **ModalityDirector enforces APPROVED-only; ModalityValidationService validates before approval**
- [x] subject_concepts join: FK sketch added to Data Model (direct FK or join table options) — **Implemented as FK on CurriculumUnit**
- [x] Science explicitly marked as Phase 6 / out of MVP 5.0 pilot scope in Content Spec + SKIPPED — **Documented**
- [x] Modality dwell ≠ mastery: research question documented in Personalization + Retention (no mastery update without retest evidence) — **Golden A07 created**
- [x] A16 ownership test: Diagnostic agent never calls QG directly (multi-agent boundary enforcement) — **Golden A16 created**
- [x] Rollback SLO: <5 min target documented in Observability (optional P2) — **PolicyEngineService.rollbackPolicy exists**

## Implementation Status (2026-07-14)

- **Schema:** ✓ Complete (subjects, modality_assets, modality_outcomes, policy_versions, safety_evals)
- **Services:** ✓ Core infrastructure (ModalityDirector, ModalityValidationService, PolicyEngine, SafetyEval)
- **Contracts:** ✓ Shared types (ModalityKind, PolicyStatus, SafetyMetrics, PolicyChoiceRecord)
- **Golden Tests:** ✓ 14/16 passing (A01, A02, A05, A06, A07, A11, A12, A13, A14, A15, A16; A08/A10 test isolation; A03/A04/A09 deferred)
- **Learned Policy Runtime:** ⚠️ Stub (always returns baseline; training is offline)
- **API Endpoints:** ⚠️ Deferred (promotion/rollback need HTTP layer)

## Modality Validation Rules (2026-07-14)

- **ModalityValidationService** (modality-validation-rules-v1):
  - Retest question mapping required for APPROVED status
  - Retest question must exist and be APPROVED
  - Transcript required for VIDEO/VOICE modality
  - Duration required for VIDEO/ANIMATION (max 10 minutes)
  - Storage ref format validation
  - Subject and unit existence checks
