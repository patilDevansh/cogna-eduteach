# Lotus qualification v1

## Rating oracle

The controlled qualification oracle is `factorisation-rating-v1`.
It contains 190 exact learner-evidence cells: each of the 38 current
factorisation microskills is exercised as slow clean evidence (3), fluent
clean evidence (4), fast independent mastery (5), a repeated confirmed gap
(1 for critical foundation/sign skills, otherwise 2), and no direct evidence
(unrated). It prevents an unasked microskill from being silently converted
into a low score.

Evidence command, 10 November 2026:

```text
pnpm test:lotus:qualification:ratings
191 passed, 0 failed
```

## Browser campaign safety

`scripts/lotus-autonomous-persona-eval.ts` now requires a distinct
`LOTUS_AUTONOMOUS_EVAL_DATABASE_URL` for either live evaluation or the named
browser qualification command. It writes a transcript-only blind analysis
before reading a completed Lotus report, and stores the later Cogna result and
comparison alongside it. Each browser session asserts slots 1–15 exactly once
and no more than two `.5` elastic probes.

The disposable local database `cogna_lotus_qualification` was created and
migrated for this evaluation only. No ordinary learner database was used.

## Browser finding — not a pass

The first controlled P01 browser smoke created a valid isolated session and
staged question 1, but the autonomous Playwright runner did not advance to
its first answer. Its original exact `Question 1` selector was updated for
the current `Question 1 of 15` UI, yet the smoke remained stalled before its
first audit. The runner was stopped and no browser qualification pass is
claimed. The next gate is to capture a Playwright trace/DOM snapshot at this
wait and repair the remaining UI synchronization issue, then rerun the full
ten-persona controlled campaign before spending on the live-model canary.

## Live-model status

Live model configuration is present, but no live-model calls were made. The
live canary remains intentionally blocked until the controlled browser
campaign passes on the isolated database.
