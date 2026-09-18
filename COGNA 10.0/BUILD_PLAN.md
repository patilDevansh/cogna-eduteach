# Build plan

- [x] Persistent teacher, classroom, enrollment, run, and assignment schema
- [x] Teacher and student classroom APIs with ownership boundaries
- [x] Production classroom creation and code-join screens
- [x] Teacher phase launcher and student assignment polling
- [x] Lotus completion persisted into classroom assignments
- [x] Verified personalized video connected to teaching assignments
- [x] Scored gamified practice stored separately from independent evidence
- [x] Personalized independent exit route and persistence
- [x] Real-data teacher report with explicit demo report mode
- [x] Automated lifecycle test suite (ownership, enrollment isolation, gates, idempotency, phase transitions, aggregation)
- [ ] Full browser acceptance walkthrough
- [ ] Production deployment migration verification
- [x] Lotus code-path latency policy (bounded output, cache-friendly prompts, configurable reasoning budgets)
- [ ] Syllabus ingestion, versioned objectives, provenance, and vetted Lotus question generation ([architecture](./LOTUS_ARCHITECTURE.md))
- [ ] Durable full-history Lotus learner state and high-confidence ready-item shortlisting
- [ ] Shadow evaluation of fast-next selection, diagnostic quality, safety, and student-visible latency before rollout

## Diagnostic-quality and adaptive-action repair

These are **open** requirements in the [continuous diagnostic plan](./LOTUS_CONTINUOUS_DIAGNOSTIC.md#8-repair-diagnostic-interpretation-and-the-action-loop-before-claiming-adaptivity), not completed functionality.

- [ ] Persist pseudonymous standalone-demo and production response, analysis, timing, and plan-decision events so the previous 24 hours can be audited.
- [ ] Calibrate per-skill evidence: separate verified result from hypothesized cause; treat “I don't know” as support, and avoid blanket mastery or gap claims from one nondiagnostic response.
- [ ] Give AI review the remaining 25-slot map and require a specific, uncertainty-aware recommendation with competing explanations and an expected discriminating observation.
- [ ] Bind recommendations to validated near-term unseen questions, prevent duplicate/far-future generic checks, and record when KEEP or deferral is the correct action.
- [ ] Make AI Studio show proposed, installed, and actually shown actions separately; never report “implemented” from placeholder analysis or a generic planning note.
- [ ] Replace all-answer four-call serial review with a measured selective/escalating pipeline, bounded concurrent jobs, deadlines, and version-safe late-result handling.
- [ ] Repair obsolete hardcoded-fixture factorisation tests and add replay, latency, coverage, and educator-scored diagnostic-quality release gates.
- [ ] Build Playwright factorisation journeys for synthetic capability profiles through the real student UI, API, observer view, and final report, with isolated persistent audit data.
- [ ] Run both controlled-model CI scenarios and repeated live-model scenarios; compare each final skill report and actual question path with an independently written educator reference profile.
- [ ] Publish per-skill confusion matrices, missed/false gaps, action relevance, coverage, and latency; block rollout on failed safety invariants or unmet educator-reviewed diagnostic-quality gates.

## Phase gates and AI Studio delivery

- [ ] Phase 0 — mandatory durable database persistence for demo and production diagnostics, isolated persistent audit environment, per-turn event timeline, recovery/outbox tests, and AI Studio review-status strip.
- [ ] Phase 1 — evidence-calibrated learner model and AI Studio Evidence panel.
- [ ] Phase 2 — structured adaptive decisions, near-term validated placement, and AI Studio Decision panel.
- [ ] Phase 3 — all-AI question readiness/provenance/validation and AI Studio question-supply panel.
- [ ] Phase 4 — selective concurrent review with deadlines and AI Studio latency/effect detail.
- [ ] Phase 5 — truthful proposed/installed/shown action timeline and evidence-traceable teacher report.
- [ ] Phase 6 — controlled and live-model Playwright intellectual-profile evaluation with educator scoring.
- [ ] Phase 7 — consented shadow pilot, educator review, policy promotion, and rollback drills.
- [ ] AI Studio redesign — session overview, compact turn Decision Cards, unseen-plan transparency, question provenance, and advanced audit drawer.
- [ ] AI Studio usability gate — Playwright desktop/mobile/accessibility coverage plus educator task review showing readers can identify evidence, decision, and actual outcome without opening raw model details.

Before executing each phase's test gate, notify the product owner in the active Codex thread with the test scope, environment, live-model/cost impact, expected duration, and any test-data reset; wait for acknowledgment and report the results before starting the next phase.
