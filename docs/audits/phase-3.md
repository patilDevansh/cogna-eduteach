# Phase 3 independent gate — partial verification

Independent runner: Codex classroom subagent (implemented classroom/board work, not diagnosis changes). Worktree: `lotus-new-architecture`, branch `feat/lotus-new-architecture`.

Status: **OPEN**. The required original manual replay and Sarah browser evidence have not yet passed.

## Four support requests

After rebuilding the API, live session `5719e882-ddd4-4161-8d4a-c3df4da82b00` submitted four consecutive “I don't know” answers through `POST /lotus/sessions/:id/answers`. The session completed after four answers and every report skill had no numeric rating. Chromium opened the real report at port 3002; its report content and screenshot were inspected. No 3/5 appeared.

Evidence: `test-results/lotus-phase3-independent/four-idk.json` and `four-idk-report.png`; runner: `tests/e2e/lotus-phase3-independent.mjs`.

The existing demo Divya profile carries prior evidence: the report mentions that prior gap and recommends foundational work. This run verifies absent ratings for the current support-only answers; it does not establish absence of historical evidence.

An earlier run against the stale API returned numeric ratings. The rebuilt API corrected that result; a second old-runtime run was interrupted by the API restart.

## Regression checks

Independent execution of the diagnosis, retrospective clearance and competency-rating suites initially returned 23/25 passing. The builder was notified of both failures, including perfect-square signed multiplication clearance. After correction, the independent runner repeated all three suites: **25/25 passing**.

The grouping clearance matcher also requires review for multi-letter grouping expressions and unrelated minus signs. No complete Gate 3 sign-off is asserted.

## Live Sarah scenario

Session `750a651c-add8-4f14-bad4-05a0de595d05` completed via the live answer route with a deliberate product-sum mistake followed by correct mixed-sign monic factorisation. Its report evidence includes “retroactively cleared” and `CARELESS_DRILL_SLIP`. Evidence: `test-results/lotus-sarah-independent/session.json` and `report.png`; runner `tests/e2e/lotus-sarah-independent.mjs`. The original audit transcript was unavailable, so this is a functional scenario rather than an exact replay of `4441402b`.

The live run exposed legacy bank slot labels and therefore did not reproduce the prescribed Q13/Q15 positions. It also exposed an advanced Day 1 rationale claiming ratings 4–5 while the report contained ratings 3. The diagnosis builder corrected the rationale in source after this run; a fresh runtime verification remains required.

The browser screenshot confirmed that the backend clearance note was absent from the visible report. At the coordinator's request this runner then implemented note rendering under the relevant rating card. Consequently **a different runner must verify note visibility**; this agent cannot sign off its own UI change. The independent backend clearance check above predates that UI change.
