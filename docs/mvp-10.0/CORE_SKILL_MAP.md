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
| Coverage | Today: 14 of 31 skills have no question of their own; 27 of 61 mistakes have no question built to show them. A baseline check lets this improve and refuses to let it slip. |
| Proposals (data only) | Seven new skills and two merges (31 + 7 − 2 = 36). Each goes live only when it has two code-checked questions. |

## What this does not change

The live test, the evidence rules and the blame rule (`ownerOfMistake`) behave exactly as
before. Switching them to the new owners and links is a separate change, to be checked
against the simulated-student scorecard.

## Next steps, in order

1. Question families for the 14 skills with no question of their own (signed numbers, factor pairs and trinomial signs first).
2. Make the proposed skills live as each gets two code-checked questions; decide the two merges.
3. Switch the blame rule and the prerequisite rule to the owner table and the typed links.
4. Record conditions and help on every stored answer; keep the four layers apart (shared map, evidence history, current estimate, next step).
5. Held-out scorecard before the 22 November freeze.
