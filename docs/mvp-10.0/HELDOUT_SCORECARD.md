# Held-out scorecard v1 (28 October 2026)

**Simulation performance only.** Scripted students and a pretend AI. This shows the rules
behave as designed on students they were not tuned on. It is not accuracy with real children.

## What was run

24 simulated students, written before the first run and never used to tune a rule
(`apps/api/test/fixtures/lotus-heldout-students.ts`, frozen in commit `b8d17c0`). None is in the
P01–P10 or X01–X09 catalogues the rules were tuned on. Each student is a statement of truth:
which skills they truly lack, the one mistake they make on them, and how they behave (slips,
guessing, tiredness, tapping, a different valid method). They answer whatever question is actually
shown, wrong in their own way when it needs a skill they lack.

Each student was played **20 times** with the short foundation checks and **20 times without**
(`LOTUS_DISABLE_SKILL_CHECKS=true`): 480 plays per mode. The repeats were added after two single
runs differed for four students (question variants depend on a random session id); the students,
scoring and criteria did not change.

| Group | Students |
|---|---|
| Capable children (slips, odd methods, slow and unsure) | 6 |
| One foundation skill missing | 8 |
| One chapter skill missing | 4 |
| Several gaps | 2 |
| Messy (gap plus slips, guessing, "I don't know", not trying) | 4 |

**Scoring, declared in advance.** A *root gap* is a lacked skill with no lacked skill beneath it.
*Found at the root*: every root gap is confirmed. *Found above*: a skill built on a root is
confirmed, but not the root (the child can be taught at the right chapter, not at the true cause).
*Missed*: nothing relevant is confirmed. *False gap*: a confirmed skill the child does not lack and
that does not depend on one they lack. Pass criteria: found (root or above) not lower with the
checks than without; false gaps not higher; and zero false gaps (target).

## Result

| 480 plays per mode | With the checks | Without |
|---|---|---|
| Plays with a planted gap | 340 | 340 |
| Found at the root cause | **65.9%** | 29.4% |
| Found above the root | 28.2% | 64.7% |
| Missed | 5.9% | 5.9% |
| Gap found at all (root or above) | 320 / 340 | 320 / 340 |
| Median questions, children with a gap | **18** | 22 |
| Median simulated minutes, children with a gap | **7.5** | 9.2 |
| Capable children given a confirmed gap | **0 / 120** | 0 / 120 |
| Determinable child reported as "unclear" | 0 | 0 |
| Not-trying child reported as "unclear" | 100% | 100% |
| Plays with a false gap (all students) | 80 | 180 |
| Plays with a false gap (not-trying student excluded) | 60 | 160 |

**Pre-declared criteria:** found not lower — **met** (320 = 320). False gaps not higher — **met**
(80 ≤ 180). Zero false gaps — **not met** (80 plays).

The checks make the test reach the true cause far more often (66% vs 29%) and, for children with a
gap, usually sooner. The test is not shorter for every child: of the 17 students with a gap it is
shorter for 11, the same for 4, and longer for 2 (H12 identities forwards, +2 questions; H14 terms
and factors, +5).

## Per student

Median questions, then share found at the root, then plays with a false gap out of 20.

| Student | Root gap | With checks | Without |
|---|---|---|---|
| H01–H06 capable (6 students) | none | 25 q, 0 false gaps each | 25 q, 0 each |
| H07 signed products | FND_SIGN_MUL_DIV | 18 q, root 100%, 0/20 | 24 q, root 0%, 0/20 |
| H08 factor pairs | FND_FACTOR_PAIRS | 9 q, root 0% (above 100%), **20/20** | 20 q, root 0%, **20/20** |
| H09 lowest power | FND_MIN_EXP_COMMON | 13 q, root 100%, 0/20 | 20 q, root 0%, 20/20 |
| H10 square roots | FND_RECOGNISE_SQUARE | 16 q, root 100%, 0/20 | 22 q, root 0%, 20/20 |
| H11 expand one bracket | EXP_EXPAND_SINGLE | 24 q, root 0% (above 100%), 0/20 | 25 q, root 0%, 20/20 |
| H12 identities forwards | ID_SQUARE_DIFF | 24 q, root 85%, 0/20 | 22 q, root 0%, 20/20 |
| H13 HCF as LCM | FND_GCD_NUMERIC | 17 q, root 100%, **20/20** | 21 q, root 0%, 20/20 |
| H14 terms and factors | ALG_IDENTIFY_STRUCTURE | 22 q, root 35%, 0/20 | 17 q, root 0%, 0/20 |
| H15 group with a minus | FAC_GROUP_SIGN | 23 q, root 100%, 0/20 | same |
| H16 minus square | FAC_PERFECT_SQUARE_MINUS | 22 q, root 100%, 0/20 | 25 q, root 100%, 0/20 |
| H17 reversed bracket | FAC_COMMON_BINOMIAL | 15 q, root 100%, 0/20 | same |
| **H18 cancel terms** | FAC_CANCEL_COMMON_FACTOR | **25 q, missed 100%, "ADVANCEMENT"** | same |
| H19 signs and pairs | two foundation roots | 9 q, above 100%, **20/20** | 20 q, above 100%, 20/20 |
| H20 powers and squares | FND_EXPONENT_PRODUCT, FAC_DIFF_SQUARES | 11 q, above 100%, 0/20 | 20 q, above 100%, 20/20 |
| H21 signs plus slips | FND_SIGN_MUL_DIV | 18 q, root 100%, 0/20 | 24 q, root 0%, 0/20 |
| H22 guesses on trinomials | FAC_PAIR_PRODUCT_SUM | 25 q, root 100%, 0/20 | same |
| H23 says "I don't know" | FAC_GCF_NEGATIVE | 24 q, root 100%, 0/20 | 25 q, root 100%, 0/20 |
| H24 not trying | none (unclear is correct) | 12 q, unclear 100%, 20/20* | 15–18 q, unclear 100%, 20/20* |

\* H24's report says the test was too rushed to act on (correct), but the per-skill list still
shows several skills as confirmed; the pre-declared rule counts those as false gaps.

## What it found that is not good

1. **A gap that is never asked about is reported as "no gap found" (H18).** A child who cancels
   terms instead of factors is missed in every play, in both modes. In the session inspected, the
   turn that held the cancelling question (slot 24 of 25) was repurposed to another skill, so no
   question about cancelling was shown, and the report says "No teaching gap found in factorisation
   from this test" without naming the skill that was never tested. Skills never tested should be
   named in the report, and the last skills should not be squeezed out.
2. **A foundation gap is sometimes blamed on a skill above it, and the early stop locks that in
   (H08, H13, H19).** When the child's real gap is under a skill that a question only *tags*, the
   evidence lands on the question's headline skill (here, finding the letters common to every term).
   For H08 and H19 the test then stops at 9 questions with that starting point, and never checks
   factor pairs or signed numbers. Part of this may come from the simulated students: they fail
   every question that touches a skill they lack through the fixed prerequisite map, where a real
   child might manage `x² + 5x` without HCF. That is the "prerequisites are fixed for every
   question" weakness in the skill-map document, so the held-out set cannot tell the rule from the
   model here.
3. **Several roots are not all found (H19, H20) and some roots sit out of reach (H11).** With two
   foundation gaps the test finds the skills above them, not both causes. For H11 (multiplies only
   the first term inside a bracket) the root is never confirmed.
4. **Per-skill states for a child who isn't trying (H24).** The outcome is right (unclear); the
   per-skill list should not show confirmed gaps for a test the report calls too rushed to act on.

## Limits

Scripted students and a pretend AI; the AI review's judgment on real working is not tested here.
Every wrong answer a student gives is one the system predicted, except the messy behaviours. A
student's truth uses the same prerequisite map as the rules, so this tests the rules against the
map, not the map against children. 24 students and 340 plays are enough to compare two versions of
the test, not to quote an accuracy.

## Status of the set

This set has now been used to report results. If a rule changes in response to what it found,
treat v1 as a tuning set and write a held-out v2 first, from a statement of truth, before running.
The two fixes below were designed from v1, so **v1 is now a tuning set** (see the update).

## Run it

```bash
cd apps/api
LOTUS_HELDOUT_REPEATS=20 node --import tsx --test test/golden/lotus-heldout-scorecard.v1.spec.ts   # the published numbers, about a minute
node --import tsx --test test/golden/lotus-heldout-scorecard.v1.spec.ts                           # 5 plays each, as in the normal suite
```

**Margin on "found not lower" (added 4 November 2026).** Question variants depend on a random session id, so runs of identical code differ by a few plays, and the original rule of no margin failed about half the time. The test now fails only when "with the checks" is lower by more than 3% of plays with a gap. The published comparison above is unchanged.

---

# Update: the two fixes, measured on held-out v2 (28 October 2026)

**Simulation performance only**, as above. Held-out set v2 (`lotus-heldout-students-v2.ts`, frozen in
commit `973b5d6` with its criteria) was written before the fixes and before any v2 run, and nothing
was designed from it. The "before" figures are one run of 20 plays per student on the code as it was
before the fixes.

## What changed

1. **A skill the test never asked about is named.** The report now lists every skill the plan meant
   to ask about and never did, in the starting point, the uncertain areas, the next step, the limits
   and the skill list ("Not asked in this test: cancelling factors, never terms"). The outcome is
   unchanged; the report says what it does not cover. Catch-ups are exempt.
2. **Widening a secure skill no longer uses up the only question left for a skill nobody has
   asked about.** A real gap check or a going-down question still may, as a last resort, because
   evidence about a gap outranks coverage of an unasked skill.
3. **The early stop waits while any confirmed gap has an untested or shaky prerequisite**, not only
   the first one it finds. (H08 and H19 stopped at 9 questions on the wrong starting point.)
4. **A gap whose only evidence could be another branch's doing is shown as suspected, with the
   reason.** When every question a skill went wrong on also needed a skill built on a confirmed gap
   in an unrelated branch, that gap may be the cause. A skill built on the cause, a skill the cause
   is built on, and a gap from the student's own "I don't know" are left alone.

Unit tests cover each change and its negative controls (`lotus-factorisation.v1.spec.ts`).

## v2: before and after (360 plays with a gap, 480 in all)

| | Before | After |
|---|---|---|
| Root cause found | 52.2% | 52.5% |
| Found above the root | 20.0% | 19.7% |
| Missed | 27.8% | 27.8% |
| **Silent misses** (a gap not found, and the report doesn't name the skill) | **100 plays (27.8%)** | **60 plays (16.7%)** |
| Plays with a false gap | 20 | 20 |
| Capable children given a gap | 20 of 120 | 20 of 120 |
| Reported "unclear" although determinable | 20 | 40 |
| Median questions, children with a gap | 22 | 25 |

**Criteria declared in advance:** A (no silent miss) **not met** (60 remain). B (found at least as
often) **met**. C (false gaps not higher) **met**, but no capable child may be given a gap and one
still is (the same student before and after, see below). D (median questions no more than 2 higher)
**not met** (+3).

## What the fixes did

- **Fix 1 worked where it was aimed.** The student who cancels one term (V18) and the one who
  guesses on grouping (V23) were silent misses in 20 of 20 plays; now they are named in the report
  in every play. V18 is now reported "unclear: one mistake, not confirmed", where before it read as
  an all-clear. That is the "unclear although determinable" that rose from 20 to 40: honest, but
  the gap is asked about once, at the last slot, so it cannot be confirmed.
- **Fix 2 was not exercised by v2**, so it is not verified on held-out data. v2's student model gives
  no wrong answer a predicted code unless the question lists a mistake behind the skill they lack,
  so the confusion v1 showed does not arise. On the v1 tuning set it did what it was designed for:
  false-gap plays 80 → 20 (the 20 are the not-trying student), the two students that stopped at 9
  questions on a wrong starting point now run to 22 and find the true cause in half the plays, and
  the gap found at all is unchanged (320 of 340).
- **Cost.** The stricter stop makes some tests longer: two students with a signed-sum gap went from
  22 to 25 questions in v2 with no gain in accuracy; on v1 the median for children with a gap went
  from 18 to 23.5, mostly because the 9-question stops were wrong.

## What v2 found that is still not good

1. **A foundation gap can be missed silently when the wrong answers above it are unexplained
   (V08 powers, V11 square roots, V14 which identity).** The test only asks about a skill with no
   slot after it finds a gap above it. When the child's wrong answers don't match anything the
   system predicted, the pretend AI gives no evidence, no gap is found above, nothing sends the test
   down, and the report says ADVANCEMENT (or unclear) without naming the foundation. With a real AI
   review some of these wrong answers would become evidence, so this is partly a limit of the
   pretend AI, but "several answers were wrong and the cause couldn't be linked to a skill" should
   itself keep the outcome from being an all-clear and should send the test down.
2. **A solid child who gets tired near the end is given a gap (V04, tired from question 20).**
   Every play ends SOLID_GAP on factorising fully and trinomials. The tiredness guard did not catch
   a tired spell that starts only six questions before the end.
3. **The cost in questions** (D above) needs a look: a stop that waits for settled prerequisites is
   right when a prerequisite really is unchecked, but not when the plan has nothing left to ask.

## Status of the sets

v1 is a tuning set (the fixes were designed from it). v2 was held out for these fixes; it has now
shown three new problems, so a fix designed from it makes v2 a tuning set too. Write v3 first.
(Done: see the next update. v1 and v2 are tuning sets; v3 was held out for it.)

---

# Update 2: the two open problems, measured on held-out v3 (28 October 2026)

**Simulation performance only.** v3 (`lotus-heldout-students-v3.ts`, frozen in commit `84ca640` with
its criteria) was written before the fixes and before any v3 run. The "before" figures are one run
of 20 plays per student on the code before these fixes.

## What changed

1. **A wrong answer the review called a misunderstanding but gave no step for is no longer
   invisible.** Such an answer taught the rules nothing about any skill, so no gap was found above
   it, the test was never sent down, and the report read as an all-clear. Now it is counted on the
   question's skill; the plan sends the test down one prerequisite (the foundations a gap sits on
   are checked with the short checks); and **two or more such answers are not an all-clear**: the
   outcome is unclear and the report says "N answers were wrong but the cause couldn't be linked to a
   skill". A slip, a guess, an unreadable answer and a review still running are not counted.
2. **A short tired spell at the very end is found.** The old guard needed half of the second half of
   the test to be fast and wrong. Three or more fast wrong answers in a row at the end, after a
   careful and mostly right start, now count too, so a gap confirmed only by that spell is shown as
   suspected ("may be tiredness"), not confirmed.

Unit tests cover each, with negative controls (`lotus-factorisation.v1.spec.ts`).

## The pretend AI changed for v3

The earlier pretend AI gave every answer the same flat review with no label, so slips, guesses and
real misunderstandings could not be told apart. For v3 it labels a wrong answer the way a real
reviewer is asked to (`lotus-labelling-models.ts`): a slip if the working already reached the right
answer, a guess if the working says so, unreadable if the code couldn't read it, otherwise a
misunderstanding with no step named. **I wrote it knowing what the first fix handles**, so v3
shows the rule does what it was designed to under that model, not that real reviews look like it.

## v3: before and after (340 plays with a gap, 480 in all)

| | Before | After |
|---|---|---|
| Gap found at all (cause or something above it) | 280 / 340 (82.4%) | **320 / 340 (94.1%)** |
| Found at the root cause | 57.4% | **74.7%** |
| Missed | 17.6% | 5.9% |
| **Silent misses** | 40 plays | **0** |
| Plays with a false gap | 40 | **0** |
| Solid children given a gap | 20 of 140 | **0 of 140** |
| Solid children reported ADVANCEMENT | 80 of 140 | 80 of 140 |
| Median questions, children with a gap | 24 | **23** |
| Reported "unclear" although determinable | 60 | 80 |

**Every criterion declared in advance is met:** A (no silent miss), B (found at least as often, and
at the root more often), C (no solid child given a gap, tired or not; no false gap), D (median no
more than 2 higher), E (solid children reported ADVANCEMENT at least as often).

What moved: the two students whose foundation gap hid behind unexplained wrong answers (square roots,
the middle term of a square) went from silent in 20 of 20 plays to found at the root in 100% and 95%;
the solid child tired from question 19 and the signed-products child tired from 21 went from a false
gap in 20 of 20 plays to none; signs and square roots together went from "found above" to the root.

## What is still not good

1. **A gap on the last skill still can't be confirmed (W18, cancelling terms).** It is asked once, at
   the last slot, so one mistake can't be confirmed. It is named and reported unclear, not silent.
2. **A solid child who tires near the end is reported unclear, not ADVANCEMENT (W03-W05).** That is
   better than a false gap, but the careful first 16–22 answers could support an advancement.
   "Unclear although determinable" rose from 60 to 80 only because the child who used to be given a
   false gap (W04) is now unclear.
3. **A foundation root is not always reached.** Factor pairs is found only 35–40% of the time (W14,
   W22), and "expand one bracket" (W11) never at the root, only above it.
4. **Unverified on a real reviewer.** If a real review names a step, evidence exists and fix 1
   never triggers; if real reviews call slips "misunderstanding", two of them would keep a solid
   child from an all-clear. Run it on a sample of real reviews before relying on it.

These are kept as visible `todo` tests. v1, v2 and v3 are now all used: a fix designed from any of
them needs a new held-out v4 first.

---

# Update 3: the rules checked against real AI reviews (4 November 2026)

**One run, 27 cases.** The review probe (`apps/api/scripts/lotus-review-probe.ts`) sent 27 wrong
answers to the real AI review in its default one-call mode and read the result with the product's
own rule for turning a review into skill evidence. Nine cases are the errors listed in the NCERT
Class 8 textbook's "find and correct the errors" exercise; 18 are messy cases written for this test
(slips, a guess, an unreadable answer, a lucky right answer), each labelled in advance with what a
careful teacher would call it. All 27 reviews came back with no errors. Raw results:
`COGNA 10.0/lotus-live-run/review-probe-live-2026-11-04.json`. This is a small sample from one
model on one day, not a measurement of accuracy.

| What the rules depend on | Result |
|---|---|
| A real gap: the review names a step | **20 of 20** |
| A real gap becomes skill evidence | 19 of 20 (the 20th, a sign slip in grouping, was called a slip) |
| A review calls a wrong answer a "misunderstanding" and names no step (the *unexplained* answer) | **0 of 27** |
| A slip or unreadable answer is called what it is | 3 of 4 |
| A slip still turns into skill evidence | 1 of 4 (M13: cancelling a common factor) |
| A guess is called a guess | 1 of 1 |

## What it means for the rules

- **The unexplained-answer rule never fired.** Not once in 27 real reviews did the review say
  "misunderstanding" without naming a step. It also did no harm: it wrongly counted none of the slips,
  so a solid child's test would not have been kept open by it. But the problem it was written for (a
  foundation gap hiding behind wrong answers that give no evidence) came from the pretend AI, which
  names no step. With a real reviewer, the same answers get evidence, on the skill the review blames.
  The rule is a safety net for a reviewer that stays silent, which this one did not. It is cheap to keep
  and should not be counted as a gain on real children.
- **The review names a step when it sees a gap.** That is what lets one gap become evidence at all.
  The risk moves to *which* skill it blames: it named a step on all 20 gaps, 19 became evidence, and
  all 19 landed on the expected skill, but these cases have one obvious cause each.
- **Slips are mostly safe.** One slip in four became evidence (M13). One wrong answer on a skill makes
  it suspected, not a gap, so a single slip cannot confirm one; two such slips on the same skill could.
- **The one real gap treated as a slip** (M09, a minus left out of the second group) is the safe
  direction: a missed suspicion, not a false gap.

## Limits

27 cases, one model, one run; 18 of them written by Claude, not independent. Each is a single answer
sent on its own, not a whole test, so nothing here shows how the plan behaves over 25 questions with a
real reviewer. The held-out scorecards above still use pretend AIs.

## Run it

```bash
cd apps/api
node --import tsx scripts/lotus-review-probe.ts                                  # pretend AI, free
LOTUS_REVIEW_PROBE_MODE=simulated node --import tsx scripts/lotus-review-probe.ts   # simulated reviewer, free
LOTUS_REVIEW_PROBE_MODE=live node --import tsx scripts/lotus-review-probe.ts        # real AI, spends money
# from a worktree: LOTUS_REVIEW_PROBE_ENV_FILES=/path/to/.env,/path/to/packages/database/.env
```
The script reads the `.env` files itself, the way the API does (first file wins, an empty value never
overrides a real one). Node's own `--env-file` cannot read this repo's `.env`.

## Held-out v4: the baseline (5 November, before the change it measures)

Set v4 (`test/fixtures/lotus-heldout-students-v4.ts`, scorecard `test/golden/lotus-heldout-scorecard.v4.spec.ts`)
has 24 new students: 6 capable, 7 missing one of the seven added skills, 7 missing one older skill where v1–v3
were weak or silent, 2 with two gaps that involve an added skill, 2 messy. It was written before the change that
asks the added skills in the live test, and the students are frozen: this run is the "before". Map
`factorisation-2.0.0`, 20 plays per student (480 in all, 360 with a gap), the labelling pretend AI.
Criteria A–E for the change are declared in the fixture's header.

| | Before |
|---|---|
| A gap found at all (root or above) | 68.3% (246 of 360) |
| Found at the root | 44.4% |
| Silent misses (gap not found, skill not named) | 114, of which 105 are added-skill students |
| False gaps; capable children given a gap | 0; 0 |
| Capable children reported ADVANCEMENT | 50% (60 of 120) |
| Median questions with a gap | 24 |

**The one big finding: a gap in an added skill the test never asks is an all-clear.** The five added skills
that sit above nothing (rearranging to group, a bracket as one quantity, splitting the middle term, dividing a
term by a term, dividing an expression by a term) were missed in all 100 plays, and every one of those tests
ended "ADVANCEMENT" with no mention of the skill. The report names planned skills it never asked, but these are
not in the 25 planned questions, so they are not named either.

| Added skill missing | Found | Notes |
|---|---|---|
| Irreducible factors | at the root, every play | in 11 questions |
| Dividing powers | above it only (75%); 25% missed | never at the root |
| The five unasked skills | 0% | every play reported as an all-clear |

Other findings, none of them caused by the added skills:
- **Expand one bracket and signed sums are found only above their root** (X15, X16: 100% above, 0% at the root),
  the same pattern as v3's expand-one-bracket student.
- **A capable child with three slips (X02: questions 3, 11, 17) is reported "unclear" in every play**, where v3's
  three slips at 5, 12, 19 were advanced. Tired children (X03, X04) are also "unclear", as in v3.
- No capable child was given a gap, and no student had a false gap.

What the change that follows must do (declared before it is written): no silent miss among the added-skill
students, at least 80% of their gaps found, no capable child given a gap, false gaps not higher, no more than
2 extra questions at the median, and capable children advanced no less often than 50%.

```bash
cd apps/api
LOTUS_HELDOUT_REPEATS=20 node --import tsx --test test/golden/lotus-heldout-scorecard.v4.spec.ts
```

### v4 after the first change: the report names what the test did not ask

The report now names two more kinds of skill, in the starting point, the uncertain areas, the limits, the
next step and the skill list: (1) a skill no question in the plan asks about with nothing tested above it
(the five added skills that sit above nothing), and (2) a skill with no question of its own that sits
under a skill that went wrong and was never checked ("dividing powers: never checked, and dividing every
term went wrong, so it could be the cause"). The outcome is not changed: asking the five would be the real
fix, and calling every test "unclear" because they cannot be asked would take the all-clear from solid children.

| | Before | After |
|---|---|---|
| Silent misses | 114 (105 added-skill students) | 0 |
| A gap found at all | 68.3% | 69.4% |
| Found at the root | 44.4% | 44.4% |
| False gaps; capable child given a gap | 0; 0 | 0; 0 |
| Capable children reported ADVANCEMENT | 50% | 50% |
| Median questions with a gap | 24 | 24 |

Same 480 plays, 20 per student. v1, v2 and v3 guard-rails still pass. Criterion A is met; B (found at least
80% for the added-skill students) is not: those gaps are now named, but a child missing one of the five is
still reported ADVANCEMENT with the skill named as not asked (the report says to check it), and the gap
is not found. Finding them needs the test to ask them.
