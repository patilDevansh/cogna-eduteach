# How Cogna Works (plain English)

> Manager-readable. Not an engineering contract. Spec truth: `/docs/mvp-2.0/`.

## The short version

A child practices math. Every answer, hint, skip, and confidence rating is **evidence**. The system updates a **learner profile**, chooses the **next teaching move**, and shows content that matches that move. Parents get a short letter about what happened — never clinical labels.

```text
Child answers → Evidence stored → Diagnosis updates profile
  → Decision picks next move → Content shown → Repeat
```

## What “understood” means (and what it does not)

Cogna estimates things like: how solid a concept looks, whether a recurring error pattern shows up, whether confidence matches correctness, whether something needs a refresh later, and whether the session should pause.

**We never claim:** IQ, ADHD, autism, depression, anxiety, personality, or mental health diagnoses. Those are ethically off-limits and not part of the product.

## How kids are assessed (research-backed, non-jargon)

1. **Mastery from evidence, not vibes** — Repeated success on a concept raises mastery; thin evidence does not. (Mastery learning tradition; modern knowledge tracing uses the same idea.)
2. **Forgetting is real** — If they succeeded days ago and haven’t revisited, retention risk rises. (Spaced retrieval / forgetting-curve research.)
3. **Wrong answers often show a pattern** — Especially in algebra (signs, balance, variable misreads). We tag patterns so the next move can target the bug, not randomly punish them.
4. **Confidence vs correctness matters** — Overconfident wrong needs different help than unsure wrong. (Metacognition / calibration research.)
5. **Hints and time are signals** — Many hints or long idle changes the next action (simpler item, explanation, or break). Cognitive load and help-seeking research supports this.

## Decision → what the child sees

The decision engine picks a **move** (`uiAction` + `learningIntent`). The UI does **not** invent teaching moves.

| Move | Child sees |
|---|---|
| Show a question | Equation + answer box |
| Show a hint | Progressive hint ladder |
| Show an explanation | Step-by-step “let’s look together” |
| Suggest a break | Calm pause screen |
| End session | “Good work today” + next step |

## What parents see

Letter-style reports, not dashboards:

- **What happened** — observations only  
- **What it might mean** — cautious; one session ≠ a label  
- **What to do next** / weekly plan  
- An **uncertainty note** — patterns only after several sittings  

## Live agentic path (how generation fits)

Day one with generation enabled:

1. Optionally generate a candidate (C-lite params → templates, or free-form behind a flag).  
2. **ContentVerifier** checks math, steps, pedagogy, voice, and hint leakage.  
3. **Shadow mode:** log pass/fail; **still serve the approved bank** until a serve flag flips.  
4. When metrics clear and `LIVE_AGENTIC_SERVE_GENERATED=true`, verified items may be shown.

**Next-step decisions** are separate from content generation: rules build a legal candidate list; with `AI_QUESTION_RECOMMENDER_SERVE=true` the model may re-rank inside that list only. See flags in [`LIVE_AGENTIC_PLAN.md`](./LIVE_AGENTIC_PLAN.md).

See [`LIVE_AGENTIC_PLAN.md`](./LIVE_AGENTIC_PLAN.md) and [`PRIVACY_AND_DATA.md`](./PRIVACY_AND_DATA.md).

## Related

- Voice rules: [`LANGUAGE_AND_VOICE.md`](./LANGUAGE_AND_VOICE.md)  
- Question inventory: [`QUESTION_BANK_ATLAS.md`](./QUESTION_BANK_ATLAS.md)  
- Demo accounts: [`DEMO_STUDENTS_AND_TRAINING.md`](./DEMO_STUDENTS_AND_TRAINING.md)  
- Local walkthrough: [`COGNA 2.0/DEMO_WALKTHROUGH.md`](../COGNA%202.0/DEMO_WALKTHROUGH.md)  
