# Combined diagnostic — gaps vs a trustworthy assessment

What a parent/child would need from a real algebra diagnostic, versus what `COMBINED_ALGEBRA` + the five thin topic tracks actually deliver today.

**Combined session v1 (shipped):** one session walks NegDist → fractions → identities → factorising → quadratics using each topic’s existing thin backbone. That closes “no multi-topic session.” Everything below remains open.

## Gaps (≥20)

1. **Per-topic depth is too thin for mastery claims** — ~3–4 items per topic (entry → main → optional contrast → transfer), not enough samples for confidence.
2. **Most catalogue skills stay untested** — square identities `(a±b)²`, GCF factoring, quadratic formula, many supporting skills in `micro-skills.catalog.ts`.
3. **No versioned APPROVED question bank** — fixed items + templates only; no content-ops `Question` rows for DiagnosticV2.
4. **No adaptive cross-topic prerequisite routing** — failing factorising does not send the student back to expand/DoS; topics only advance forward on the combined ladder.
5. **Decline path skips contrast** — two “I don’t know”s can jump past the discriminating probe.
6. **Prerequisite probe exists only for NegDist** (`PREREQ_SIGN_PROBE`); other topics lack equivalent detours.
7. **AI Why invents gaps after perfect work** — documented in `TOP_5_CRITICAL.md` / 100-run batch (“many wrong answers” after clean MAIN/ENTRY).
8. **Selector sees polluted lifetime MicroSkillState** — “gap before tested” / wrong-skill Why when demo student history mixes topics.
9. **Assist-on-correct and “after teaching” overclaim** — assistance or Why text implies teaching when none occurred (`UI_FRACTION_AUDIT.md`).
10. **Only 4 of 8 assistance ladder levels are produced** — `GENERAL_PROMPT`, `LOCATION_HINT`, `MICRO_QUESTION`, `PARTIAL_WORKED_STEP` unused.
11. **Supporting / prerequisite skills are not scored** — evidence lands on primary skill only.
12. **Live AUTHOR is rare; B2–B4 AUTHOR deferred** — GENERATE templates dominate; bank cannot grow mid-session for identities/factor/quad.
13. **Selector timeout → silent RULE fallback** — student may rarely see a true AI next-item choice under load.
14. **Retention is scheduled but never executed** — `RevisionQueueItem` written; no delayed re-check runner.
15. **Retention uses stand-in `conceptId`s** — not a durable DiagnosticV2 concept graph.
16. **Parent summary is API-only** — `parentFacingSummary` from D.v2 is not shown in the student UI product surface.
17. **No weekly DiagnosticV2 rollup / email delivery** — session reports only; no parent digest.
18. **Early-exit “stop and see summary” claims incomplete coverage** — student can end before all five topics without a clear “incomplete assessment” banner.
19. **No production auth on `/diagnostic-v2/*`** — body `studentId` is spoofable (demo-only posture).
20. **Phase C buffer is process-local** — not durable across API replicas; instant next-item can miss in multi-instance deploy.
21. **No fatigue / idle / elapsed signals** — timing never informs routing or break suggestions.
22. **No single parent-facing “full algebra exam” product page** — D.v2 writes Report rows, but parent app still centres LearningSession reports.
23. **UI default vs API default historically mismatched** — mitigated for combined default in UI, but solo-track deep links still diverge from server default `NEGATIVE_DISTRIBUTION`.
24. **General adaptive scoring formula from Work Order 03 not implemented** — fixed backbone order, not evidence-weighted topic selection.
25. **Math input / accessibility not productized** — stacked fractions help display; keyboard/mobile answer entry remains a thin testing UI.

See live findings in [`COMBINED_AUDIT.md`](./COMBINED_AUDIT.md) when present.
