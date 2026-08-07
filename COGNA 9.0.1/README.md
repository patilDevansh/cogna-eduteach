# MVP 9.0.1 — Phase A, explained simply

This document only covers **Phase A** — the first, small piece of a much bigger plan. It's written to be readable without any technical background. For the detailed engineering plan, see [`BUILD_PLAN.md`](./BUILD_PLAN.md).

## What are we actually building?

A student solves an equation one line at a time — not by typing a final answer, but by writing out their working, the way they would on paper. As they go, the system checks each line, figures out exactly which step (if any) went wrong, and uses that to decide what to ask next. At the end, it gives the student (and eventually a parent) a plain-language summary of what they're already good at and what to work on next.

We're proving this whole loop on **one small topic first**: a student solving equations like `-2(x - 5) + 3 = 11`, where the common mistake is getting a negative-times-negative sign wrong. If this works end to end — real screen, real questions, real AI — we then repeat the same pattern for every other algebra topic (brackets, fractions, factorising, quadratics), which is where the bigger "2,000 questions" version of the plan comes from.

## Why start this small?

Because "AI decides everything, generates new questions on the fly, and grades the tricky cases" is a lot of moving parts, and if we build all of it across every topic at once, we won't actually know if any single piece works. Building it small first means: if something's wrong, we find out on one narrow topic, not across the whole curriculum.

## What does AI actually do here?

Three specific jobs, and nothing more:

1. **Picks the next question.** It looks at what the student has done so far — skill statuses, recent errors, context strengths/gaps, and every question already shown this session — and picks from a small set of pre-checked options, or asks for a fresh instance of a known template. When no template covers the case, it can ask for a brand-new equation (AI authoring). Before any AI-authored equation is shown, a separate verifier independently re-solves it and compares the AI's claimed answer; a mismatch or any other gate failure discards the question and a pre-checked one is used instead. Template rendering and authoring never trust the model's own arithmetic.

2. **Explains what's going on.** The system already knows, with certainty, whether each line the student wrote was mathematically right or wrong — that part is just arithmetic checking, not AI. What AI adds on top is turning that into an actual explanation: *why* does it look like this student is struggling, in a sentence a parent or the student themselves could understand. AI never gets to change the underlying right/wrong facts — it only explains them.

3. **Steps in when the rules get stuck.** Most of the time, checking a student's work is simple enough that plain code can do it instantly. Occasionally, a student writes something the code genuinely can't parse or classify. Only in that specific situation does AI get asked to make a judgment call — and even then, it's timed out quickly and the system just says "not sure yet" rather than guessing if the AI can't answer fast enough.

In every one of these three jobs, there's a safety net: a plain, non-AI fallback that keeps working even if the AI is turned off, slow, or wrong. AI never has the final word on whether a student's math is correct.

## How fast will it feel?

Picking from an already-checked question is fast — close to instant, just a database lookup. Writing a brand-new question and checking it is not instant — realistically a few seconds. So in this first version, AI writing new questions on the spot will occasionally cause a short pause. Making that feel instant too is a later piece of work (having the system prepare a few good questions quietly in the background, before the student even needs them), not something this phase solves.

## What a student experiences

1. Signs in, sees a short "let's find out what you know" welcome — no timer, no pressure.
2. Does one practice question just to learn how to type a line at a time (this one doesn't count).
3. Solves a few real equations, one line at a time, hitting "submit" after each line.
4. If a line is wrong, the system doesn't just say "wrong" — it may quietly let them look again, or eventually ask a small guiding question like "what's negative two times negative five?"
5. Gets a short, plain summary at the end: what they already know, what we're going to work on, no scores or jargon.

## What we track, and what we deliberately don't

For every question, we keep: which question it was, and whether it's finished.

For every line the student writes, we keep: what they wrote, whether it was mathematically right, and — if it was wrong — exactly which part went wrong and which skill that points to. We only save a line once they hit "submit" — we don't record every keystroke while they're still typing.

From that, we build up, per skill, a running count: how many times they got it right on their own, how many times they needed help, how many times they got it wrong. That's what tells the system "this student is solid here, shaky there."

We also tag each line with *which topic and skill-group it belongs to* and *the conditions it was tested under* (for example: did they do it on their own or with help, was this a brand-new problem testing the same skill in a fresh way). We're not doing much with those tags yet in this phase — but we're recording them from day one, because if we didn't and later wanted to ask "does this student do fine with easy numbers but struggle with harder ones," there'd be no way to go back and find out for anything already recorded. Easy to save now, impossible to add after the fact.

When AI writes an explanation or picks a question, we keep a record of that too — what the plain rules would have done, what AI actually did, and whether AI's answer was used or not — so it's always possible to look back and check.

**What we don't track, on purpose:** how long a line took to type (timing isn't used to judge ability — a slow answer isn't a worse answer), any camera or microphone data, mood or attention guesses, how the student rates their own confidence, school marks, or anything resembling an IQ or clinical label. If a question ever comes down to "should we record X to make the AI smarter," the default answer is no unless there's a clear, specific reason a human tutor would also want to know it.

Two things get *scheduled* but not yet *done* in this phase: a follow-up check to see if a repaired skill stuck around next session (we note that it's due, we don't run it yet), and anything resembling a parent-facing report (that's its own later piece, Phase D).

## How we're going to build it, in order

1. **Set up the storage** — create the new database tables for tracking each line a student writes and what the system learns from it.
2. **Write the rulebook** — the plain code that checks whether a line of algebra is correct, with no AI involved at all.
3. **Turn on AI, one job at a time** — first "explain what's going on," then "pick the next question," then "help when the rules get stuck" — each one wired to fall back safely if AI isn't available.
4. **Build the actual screen** the student uses.
5. **Test it thoroughly**, including running the exact same scenario with AI turned on and turned off, to make sure AI changes *how it's explained*, never *whether it's marked right or wrong*.
6. **Walk through it ourselves** in a browser before calling it done.

## What this phase does NOT include

- Identities, factorising, and quadratics — later Phase B topics, each with its own verifier ([`BUILD_PLAN_B.md`](./BUILD_PLAN_B.md) covers **B1 only**: fraction-linear clearing).
- AI authoring new fraction equations — templates only until the fraction verifier is proven (B1.5).
- The full 2,000-question bank — each topic slice still uses a small fixed set plus templates.
- Making AI-generated questions feel instant — that's a background-preparation trick we'll build once this works (Phase C).
- AI-written parent/student reports — a separate, easier piece we can build in parallel, but it's not part of this phase (Phase D).
- Any decision about whether this replaces the older version of Cogna's diagnostic system — we're deliberately not deciding that yet.

## Phase B status

| Slice | Doc | Status |
|---|---|---|
| **B1** fractions track | [`BUILD_PLAN_B.md`](./BUILD_PLAN_B.md) | **Shipped** — Rational/Frac clearing is fraction-safe with dedicated first-invalid codes |
| **B1.5** fraction AUTHOR | [`BUILD_PLAN_B1.5.md`](./BUILD_PLAN_B1.5.md) | **Shipped** (gate + goldens; live AUTHOR still rare per G1.3) |
| **B2** difference of squares | [`BUILD_PLAN_B2.md`](./BUILD_PLAN_B2.md) | **Shipped** (DoS expand/factor thin track). `(a±b)²` square identities → B2.x / SKIPPED |
| **B3** trinomial factorisation | [`BUILD_PLAN_B3.md`](./BUILD_PLAN_B3.md) | **Shipped** — monic primary + non-monic transfer (`2x²−5x−3`); three-piece kit |
| **B4** quadratic zero-product | [`BUILD_PLAN_B4.md`](./BUILD_PLAN_B4.md) | **Shipped** — rearrange → zero-product → roots; integer-factorability reject |

Every topic uses the same three-piece kit: **parser → independent solver → first-invalid-action finder** (rebuild per topic; do not generalize bracket diffing).

UI adversarial audit of B1 + AI Why/hypothesis: [`eval-ledgers/UI_FRACTION_AUDIT.md`](./eval-ledgers/UI_FRACTION_AUDIT.md).
