# MVP 5.0 — Personalization

> Full personalization across subject, unit, modality, and policy — still evidence-bound and label-free.

## Layers

```text
Subject → Unit → Concept → Misconception → Modality → Policy choice
```

## Rules of care

- Prefer TEXT when modality evidence weak
- Learned policy never less constrained than baseline hard gates
- Cross-subject personalization defaults to abstain
- No clinical/personality labeling from modality engagement

## Measurement

ModalityOutcome + retest feeds explanation/module effectiveness analogs.

**Modality dwell time ≠ mastery update:**

```text
OPEN RESEARCH QUESTION (deferred measurement if unsolved by MVP 5.0 pilot):

Video/animation dwell time (watch duration) does NOT directly update mastery estimate without attempt evidence.
Completion of a modality asset may suggest engagement, but mastery change requires:
  - retest question attempted AND
  - correctness evidence (CORRECT/INCORRECT)

If a student watches a video explanation but does not attempt the linked retest question, mastery remains unchanged.
This prevents "passive watching = learning" assumption without validation.

Future work: model engagement × retest-lift as a weaker mastery signal; requires statistical validation before formula update.
```

**Why it matters:** Prevents inflating mastery from video views alone; maintains evidence-based personalization standard.
