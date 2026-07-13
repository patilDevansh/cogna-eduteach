# Cogna MVP 3.0 — Build Care

> Guardrails for MVP 3.0 planning and future implementation.

## Non-Negotiables

- [ ] Do not implement from `/docs/mvp-3.0/` until Canonical / Frozen + AGENTS.md promotion
- [ ] Preserve `LearningDecision.uiAction + learningIntent`
- [ ] Allowed uiActions only: SHOW_QUESTION | SHOW_EXPLANATION | SHOW_HINT | END_SESSION | SUGGEST_BREAK
- [ ] Raw events immutable; `eventId` idempotent
- [ ] Only APPROVED content to students
- [ ] No unchecked LLM math
- [ ] No clinical / attention / personality labels
- [ ] Weak evidence abstains
- [ ] LLM off hot path only
- [ ] Scorer cannot override END_SESSION / SUGGEST_BREAK hard gates
- [ ] Experiment assignment sticky and audited
- [ ] G## + R## remain green

## Pitfalls to Watch

- Treating Draft / Planning specs as implementation authority
- Rubber-stamping LLM drafts without re-checking math
- Wiring scored policy as default traffic without experiment evidence
- Letting Decision Engine call the LLM
- Inventing flat UI actions for "easier/harder"
- Renaming concept IDs
- Expanding to multi-unit before 3.0 pilot exit criteria
- Parent reports leaking experiment jargon without consent policy

## Enforced in P0/P1 Documentation Pass (2026-07-13)

- [x] Feature flag behavior matrix documented (EXPERIMENTS_ENABLED, CONTENT_LLM_DRAFTS_ENABLED precedence and safety)
- [x] LLM provider key management process defined (keys never in client, staging vs prod separation, provider choice pre-freeze requirement)
- [x] README freeze gates clarified (human/pilot gates vs doc-ready gates)
- [x] Candidate score weights rationale and sensitivity documented
- [x] S21/S22 goldens added (tie-break policy, LLM timeout durability)
- [x] Sample reject-reason appendix for LLM drafts in review checklist
- [x] Manifest 280 clarified as pilot floor (not aspirational)
- [x] Shadow mode N=500 default set with agreement analysis threshold
