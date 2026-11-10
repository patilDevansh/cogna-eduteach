# Phase 2 independent verification — FAILED / reopened

Date: 2026-11-10. Runner: Codex `/root/gate2`; builder: separate prior session.
Worktree: `.claude/worktrees/lotus-new-architecture`, branch `feat/lotus-new-architecture`, starting commit `607060e`.

## Results

Fresh live answer-route run, persona P01_SECURE_ADVANCED, session `0b470310-c5a7-456d-90bd-376274f92b15`: **FAILED**. Seventeen successful answers were all server-marked `VERIFIED_CORRECT`, but the session remained ACTIVE and requested another answer. Durable observer audit slots were `[1,2,1,3.5,3.5,3.5,4,5,6,7,8,10,9,11,12,15,14]`: repeated slot 1, three follow-ups, and out-of-order spine slots. Full server evidence saved locally at `test-results/lotus-remediation/failed-p01-live.json`. No completion/report screenshot is claimed for this failed session. Runtime was rebuilt API on port3001 and isolated production web on3002.

- Existing Phase 1 and Phase 2 service suites: **17/17 passed**, zero failed, zero skipped. Command from `apps/api`: `node --import tsx --test test/golden/lotus-spine-coverage.v1.spec.ts test/golden/lotus-spine-paper.integration.v1.spec.ts`.
- Existing local web `/student/lotus` and API `/health`: HTTP 200 when checked outside the restricted shell sandbox. Initial sandbox HTTP 000 was an access restriction, not evidence of service failure.
- Fresh headless Chromium opened the factorisation start page successfully. Visible text included `GRADE 8 · CBSE`, `FACTORISATION · 15 QUESTIONS`, and `Start for student`. Landing screenshot: `/private/tmp/lotus-gate2-landing.png` (local temporary evidence only).

## Verification limitations

This is **not a Gate 2 pass**. No fresh completed browser/persona sessions, durable audit rows, or report screenshots have yet been collected by this runner. No live-answer-route completion is claimed.

The existing spine coverage test instantiates `LotusService` and calls `.start()`/`.answer()` directly. Its description calls this the real route, but it does not exercise HTTP routing, authorization, DTO validation, or browser submission. It proves useful service behavior only.

The existing browser script `tests/e2e/run-lotus-browser-test.js` guesses answers and increments its local counter without asserting a saved answer. It has no complete slot-sequence assertion and writes artifacts to a different tool's private directory. Its success message is insufficient gate evidence.

The coordinator clarified that Gate 2 preserves stable slots with the Phase 1 permitted stretch substitution; baseline topic coverage is required for non-escalated personas. The literal requirement that every original spine topic appears even after Q7 stretch substitution conflicts with Phase 1; do not silently claim both.

## Handoff

Continue with a browser harness that records each successful POST, retrieves server observer audit rows, asserts stable slots 1–15 plus at most two `.5` inserts, and stores portable screenshots. Run all four designated personas plus a manual browser run before closing this gate. Recheck Phase 1 after the concurrent Phase 3 work is built and served.
