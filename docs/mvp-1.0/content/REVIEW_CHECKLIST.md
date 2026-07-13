# MVP 1.0 — Human math review checklist

> **S014 workflow:** Formal CBSE math sign-off before external pilot.  
> Agents cannot complete this — a human reviewer must check each item and sign below.

## Milestone slice scope

The seed marks **17 milestone question IDs** as `APPROVED` for local/dev (C2 sign-handling path + baseline blueprint anchors). This is **not** the full ~200-question bank.

## Per-question checklist

For each `APPROVED` question in `docs/mvp-1.0/content/question-bank/questions.json`:

- [ ] Stem matches CBSE Grade 8 intent (no ambiguity)
- [ ] `acceptedAnswers` are mathematically correct (all variants)
- [ ] `misconceptionAnswerPatterns` map to real student errors (not guesswork)
- [ ] `hintLadder` steps are correct and do not leak the final answer too early
- [ ] Difficulty 1–5 is appropriate for the concept
- [ ] `reviewStatus` flipped to `APPROVED` only after all boxes checked

## Sign-off

| Reviewer | Date | Bank slice verified | Notes |
|---|---|---|---|
| | | | |

## After sign-off

1. Re-run `pnpm db:seed` if JSON changed
2. Set `ALLOW_PENDING_REVIEW_QUESTIONS=false` on staging
3. Log completion in `COGNA 1.0/SKIPPED.md` (S014 resolved)
