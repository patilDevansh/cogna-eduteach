# Cogna MVP 5.0 — Build Care

## Non-Negotiables

- [ ] Bounded specialists only — no free-form agents on hot path
- [ ] Only APPROVED text and modality assets to students
- [ ] Learned policy behind safety gate + rollback
- [ ] uiAction set preserved; modality via contentStyle
- [ ] No clinical labels
- [ ] No hot-path generative calls
- [ ] Freeze Linear Equations concept IDs forever
- [ ] Do not implement from Draft / Vision without promotion

## Pitfalls

- Equating "agentic" with chatbot autonomy
- Promoting policy on vanity metrics without safety suite
- Treating watch time as mastery
- Multi-subject expansion before modality safety
- Dual-control skipped "for speed"

## Enforced in P0/P1 Documentation Pass (2026-07-13)

- [x] Policy governance: dual-control promote workflow defined (Policy Engineer + Policy Approver; emergency rollback single-actor)
- [x] Safety eval metrics: concrete suite documented (mastery delta, misconception FP, session violations, hard-constraint imitation, etc.)
- [x] Modality review checklist: extended with transcript accuracy, retest mapping, duration bounds, reject codes
- [x] subject_concepts join: FK sketch added to Data Model (direct FK or join table options)
- [x] Science explicitly marked as Phase 6 / out of MVP 5.0 pilot scope in Content Spec + SKIPPED
- [x] Modality dwell ≠ mastery: research question documented in Personalization + Retention (no mastery update without retest evidence)
- [x] A16 ownership test: Diagnostic agent never calls QG directly (multi-agent boundary enforcement)
- [x] Rollback SLO: <5 min target documented in Observability (optional P2)
