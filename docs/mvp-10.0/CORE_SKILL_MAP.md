# Cogna Core Skill Map

The skill map is Cogna's shared description of the maths. It is not part of one test:
the Lotus diagnostic is the starting test that first writes evidence to it, and every
later interaction (lessons, checks answered alone, topic checks, catch-ups, delayed
checks) records evidence against the same skills. NCERT is a reference for the map, not
a limit; skills we add because they help the child more are marked `COGNA`.

Factorisation is the reference chapter. Code: `apps/api/src/lotus/lotus-skill-map.ts`.
Checks: `apps/api/test/golden/lotus-skill-map.v1.spec.ts`.

## What the map layer adds

| Piece | What it says |
|---|---|
| Skill cards | For each skill: definition, boundary, example, non-example, conditions, teaching focus, source. The other parts of a skill (owned mistakes, shared patterns, questions that test it alone, needs) are computed. |
| One owner per mistake | The nine mistakes that sat under several skills each get one declared owner. |
| Typed links | `NEEDS`, `EITHER_OR` (trinomial routes), `THIS_QUESTION_ONLY`, `SHARED_MISTAKE`, `ACROSS_CHAPTERS`, `CHECKS`. |
| Shared patterns | Sign handling, terms treated as factors, everything distributes, root of the number in front. A pattern triggers one direct question; it is never a gap by itself. |
| Version and fingerprint | `SKILL_MAP_VERSION` and `skillMapFingerprint()` so a record can say which map it was made against. |
| Coverage | In the live test's 25 slots: 21 of 38 skills have no question of their own; 38 of 72 mistakes have no question built to show them. With the question families below: every skill and every mistake has a verified question. A baseline check lets this improve and refuses to let it slip. |
| Question families | `apps/api/src/lotus/lotus-skill-checks.ts`: short code-made checks for 25 skills (the 14 that had no live question, 4 where the live test leaves a form out, and the 7 added skills). Each family has several conditions, a seeded variant for every child, and wrong answers that are named mistakes the skill lists. |
| Seven added skills (live) | Map version `factorisation-2.0.0`: 31 + 7 = 38 skills. Each has a card, its mistakes, links and a check family. Two merges are still proposals (38 − 2 = 36). See below. |

## How the question families are checked

Every variant must pass `assertFixedItemIsValid` before it is returned (the algebra engine
proves written answers; a number is proved by its check; multiple-choice options must be four
distinct choices with the key among them). On top of that, the tests rebuild the answer a
second way for the choice families (brute-force pair counts, re-reading b and c from the
expression shown, naming the identity from the coefficients) and run 60 seeds per condition.

## How the checks are used in the live test

The base plan of 25 slots is unchanged. The short checks are used only when the test needs
evidence on a skill the 25 slots never ask about, in three places in `planAdjustments`:

- **Going down under a confirmed gap** (and the one lower check after "I don't know"): a
  foundation with no slot is now checked directly instead of being passed over.
- **Re-checking a suspicion** on such a skill (it used to get no second check).
- **An AI-requested check** of such a skill.

Each is a request on a check slot (numbered from 100, clear of the 25 plan slots). The writer
builds the question by code (`codeProbeFor`, no model call, independent of the game switch),
picking a condition that can show the mistake being re-checked, a variant that is not already
in the test, and a different one for each child. If no variant fits, the request falls through
to the AI writer as before.

When a gap's own mistakes point at a shared pattern, the foundations in that pattern are
checked first: a sign error under a trinomial is checked at signed numbers before it is checked
at factor pairs.

**Off-switch:** `LOTUS_DISABLE_SKILL_CHECKS=true` puts the test back to passing over foundations
with no slot.

## Result on the simulated students

Same persona sessions, same scripted answers, with and without the checks. The same gap is
confirmed every time; the test reaches it sooner when a foundation can be checked directly.

| Persona | Questions without | Questions with |
|---|---|---|
| P02 Numeric-HCF-only | 21 | 8 |
| P03 Variable common factor | 21 | 8 |
| P04 Divides only the first term | 20 | 8 |
| P05 Negative-factor sign error | 24 | 17 |

The other six personas are unchanged. This is simulation performance: scripted students with a
pretend AI, used while tuning. It shows the rules behave as designed, not accuracy with real
children, and a shorter test is only better if it stays as accurate (held-out scorecard below).

## The seven added skills

| Skill | Group | Sits under | Source |
|---|---|---|---|
| Dividing powers (`FND_EXPONENT_QUOTIENT`) | foundations | multiplying powers | Cogna (beyond the book) |
| Irreducible factors (`FND_IRREDUCIBLE_FACTORS`) | foundations | factor pairs | NCERT ch. 12 |
| Rearranging to group (`FAC_REARRANGE_TO_GROUP`) | grouping | grouping four terms | NCERT ch. 12 |
| A bracket as one quantity (`ID_BRACKET_AS_ONE`) | identities | difference of two squares | NCERT ch. 12 |
| Splitting the middle term (`FAC_SPLIT_MIDDLE`) | trinomials | product and sum; grouping | NCERT ch. 12 |
| Dividing a term by a term (`DIV_TERM_BY_TERM`) | new group: dividing expressions | signed products and quotients; dividing powers | NCERT ch. 12 |
| Dividing an expression by a term (`DIV_EXPR_BY_TERM`) | dividing expressions | dividing a term by a term | NCERT ch. 12 |

Splitting the middle term is the second route to a trinomial (`EITHER_OR` with product and sum).
Each skill has two to four conditions, seeded variants and wrong answers that are the skill's
named mistakes; three of the new mistakes can show up as an unfinished answer.

**Two existing skills now list one of the new ones as something they build on**: dividing every
term (needs dividing powers) and taking out the full common factor (needs irreducible factors).
They are *soft* prerequisites (`SOFT_PREREQUISITES`): the short checks can test them and a
failure counts like any other, but an unasked one never holds the early stop open. Making them
hard stretched a child who divides only the first term from 8 questions to 17–23, because
no plan slot asks dividing powers and the test waited for it. The simulated guard-rails
(held-out v1–v3) are unchanged with them soft.

**Reach.** Only dividing powers and irreducible factors sit under a skill the test already
visits. The other five sit above nothing, so the 25-question test does not ask them on its own:
they have cards, mistakes, links and verified questions, but nothing in the live test sends a
child to them yet. The blame rule and the prerequisite rule still use the old owners and links
until a fresh held-out set (v4) says the switch is safe.

## What this does not change

The 25-slot base plan, the evidence rules and the blame rule (`ownerOfMistake`) behave as
before. Three older tests that encoded "going down never serves a foundation question" now
state the new behavior: a confirmed gap goes down to foundations with short checks.

## Next steps, in order

1. Real AI reviews were checked on 4 November ([HELDOUT_SCORECARD.md](./HELDOUT_SCORECARD.md), update 3): a real review always named a step, never left an answer unexplained, and called most slips slips. Next: a whole-test check with a real reviewer, and what held-out v3 left open: a gap on the last skill can't be confirmed from one question; a solid child who tires near the end is "unclear" rather than advanced; some foundation roots are reached only 35–40% of the time. Held-out v4 is written and its baseline recorded ([HELDOUT_SCORECARD.md](./HELDOUT_SCORECARD.md)): a gap in any of the five unasked added skills is an all-clear today, which the next change must fix.
2. Decide the two merges (the highest-common-factor pair has a concern recorded). Then make the two soft prerequisites hard only if held-out v4 shows it costs few questions, and give the five unreachable new skills a place in the test.
3. Switch the blame rule and the prerequisite rule to the owner table and the typed links.
4. Record conditions and help on every stored answer; keep the four layers apart (shared map, evidence history, current estimate, next step).
5. Held-out scorecard before the 22 November freeze.
