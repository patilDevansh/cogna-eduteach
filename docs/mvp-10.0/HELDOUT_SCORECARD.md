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

## Run it

```bash
cd apps/api
LOTUS_HELDOUT_REPEATS=20 node --import tsx --test test/golden/lotus-heldout-scorecard.v1.spec.ts   # the published numbers, about a minute
node --import tsx --test test/golden/lotus-heldout-scorecard.v1.spec.ts                           # 5 plays each, as in the normal suite
```
