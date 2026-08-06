# Chain evaluation — run 01 (15 cases)

Live run against the real API and real model. Unit of evaluation is the **link**: what was typed → how it was read → what was served next → *on what basis*. Pilot for a 200-case run.

Raw data: `results15.json`, `results_s3.json` in the session scratchpad.

---

## Findings, most important first

### 1. A correct answer is marked wrong when written as a bare number — DEFECT

| Case | Question | Typed | Verdict |
|---|---|---|---|
| C07 | `3x + 5 = 20` | `5` | **INVALID** |
| C15 | after `3x = 15` | `5` | **INVALID** |
| C09 | `4x - 7 = 2x + 9` | `x = 8` | VALID |

`5` **is** the correct answer to `3x + 5 = 20`. The student is right and gets marked wrong.

What happens: the deterministic parser correctly refuses `5` (it isn't an equation), returns unparseable, and the AI fallback then commits to `INVALID` — *"The new line '5' does not represent a valid transformation or equivalent expression."* Mathematically defensible, pedagogically wrong: a Grade 8 student who solves in their head and types the number is told they're wrong, and negative evidence is written against a skill they demonstrably have.

The spec calls for final-answer-only to yield **low-resolution evidence, not a penalty**. `INVALID` is a penalty. Note the failure is in the AI fallback's binary choice — it can only say VALID or INVALID, so "this is probably right but you haven't shown enough" isn't expressible.

**Not a formatting-tolerance problem.** C08 (`x=5`, no spaces) parsed fine deterministically. C09 shows jumping straight to `x = 8` is accepted. The gap is specifically a bare number with no `x =`.

### 2. The teaching ladder works — and this is the first time it has run live

My earlier sweep found zero steps had ever reached any assistance level. This run fired it repeatedly with real, correct, child-appropriate text:

- **C06** (second sign error) → `RULE_PROMPT`: *"The number outside the bracket multiplies every term inside it — including its sign. What is (-3) × (-4)? Two negatives…"*
- **C08** (first error) → `REVIEW_OPPORTUNITY`: *"Have another look at that line whenever you're ready."*
- **C11** (decline) → `RULE_PROMPT` matched to the declined item's skill

The escalation is correct: a first error gets a quiet look-again; a repeated one gets the rule. It does not dump the answer.

### 3. Error localization genuinely distinguishes different mistakes

Not one generic "wrong" — three different, accurate diagnoses:

- **C05** `-2x - 10 + 3 = 11` → *"(-2)(-5) was evaluated as -10, but multiplying those two signs gives 10"* — the sign product
- **C12** `4x = 2x + 15` → *"the outer factor -2 was not applied to x — the coefficient became 4 instead of -2"* — a structurally different error, correctly separated
- **C06** → *"Expanding -3(y - 4) gives -3y + 12, not -3y - 12, and the original expression does not equal zero"* — caught **two** faults in one line

This is the core product claim, and it holds.

### 4. AI's next-question reasoning is grounded, not generic

Every AI-sourced choice cited a specific observed fact:

> C05 → *"The student made an error in distributing a negative multiplier, so giving a focused expansion task **without an equation** will directly target the gap."*

That is a real pedagogical decision — strip the equation-solving load to isolate the bracket skill. It then escalated correctly:

> C06 → *"repeated errors multiplying negatives, so the next question should be a **transfer check**."*

Two failures → move from diagnosis to teaching to transfer. The chain is coherent.

### 5. Unparseable input is handled correctly

C10 (`umm i think ?? maybe x`) → routed to AI fallback, marked invalid with a sane reason, session continued. Never crashed, never guessed.

---

## Test-design problems in this run (mine, not the system's)

Recorded so run 02 doesn't repeat them:

- **C08, C12, C13 fed answers for the wrong question.** The question advances when an item completes, and my script kept sending pre-written lines. C08's `x=5` was genuinely wrong for `4x - 7 = 2x + 9`. **The harness must derive input from the question currently on screen.** This is the single biggest fix needed before scaling to 200.
- **C13 never tested self-correction** — by then the session had moved to a different item, so it tested unrelated-input handling instead. Self-correction remains unproven live.
- **Transient 500s and dropped responses** on back-to-back AI calls; retry + 400ms pacing fixed it. At 200 cases this needs proper handling, not a workaround.
- The decline path returns `{outcome: "DECLINED"}` with no `validity` field — legitimate, but a different response shape that any consumer must handle.

---

## Still unproven after this run

- **Self-correction** (wrong → invited to review → fixed) — never executed
- **Assisted-correct evidence** — the ladder fires, but no case yet answers correctly *after* help, so `ASSISTED_CORRECT` still has never been written
- **`FULL_EXPLANATION`** — the ladder reached `RULE_PROMPT`, never the top rung
- **Right-answer-via-wrong-route**
- **AI authoring in a real session** — still zero; selector always found a template

---

## Changes before the 200-case run

1. **Fix the bare-number verdict** (finding 1) — decide whether `5` should be accepted as an answer, or produce low-resolution/insufficient evidence rather than `INVALID`. This needs a product decision, not just a code change.
2. **Harness derives every input from the current question** — parse the served prompt, then construct correct/wrong/slip variants from *it*. Without this, most of a 200-case run will be testing my script's bugs.
3. **Add a case class that answers correctly after help**, to exercise assisted evidence and drive the ladder to the top.
4. **Record skill-state deltas per link** — currently captured only at session end, so evidence containment can't be checked link by link.
