# Asking the five unasked added skills: proposal (draft)

Status: **draft for a decision, no code yet.** Tracks DEV-7 in Linear.

## The problem

Five of the seven skills added in map `factorisation-2.0.0` sit above nothing: rearranging to group,
a bracket as one quantity, splitting the middle term, dividing a term by a term, dividing an expression
by a term. The 25 planned questions never ask them, and the live test only goes down from a gap, never
up. On held-out v4 (see [HELDOUT_SCORECARD.md](./HELDOUT_SCORECARD.md)) a child missing any of them is found
0% of the time. The report now names them as not asked, but the gap itself stays hidden.

## The constraint

A solid child already answers all 25 questions, inside the 15-minute time box. A child with a gap stops
early once the starting point is settled (about 11 to 24 questions). So the five checks cannot simply be
added: they must fit in the 25, or the test gets longer for everyone.

## Options

1. **Add five questions (30 in all).** Simple, but the median rises by about 5 and the time box is at risk.
   Fails criterion D below (no more than 2 extra at the median).
2. **Give each of the five a fixed plan slot** by dropping a second question from skills that have two.
   Everyone loses the same re-check, including children who would have stopped early anyway.
3. **Going-up checks (recommended).** When a skill one of the five builds on becomes secure, spend a later
   question that would only re-check secure ground on a short code-made check of the skill above it. The
   planner already prefers such turns when it needs room (`pickVictim` takes turns whose skills are all secure).
   No extra questions; only a child doing well so far gets them; a child with a gap keeps going down.

| Skill asked | After this is secure |
|---|---|
| Rearranging to group | Grouping four terms |
| A bracket as one quantity | Difference of two squares |
| Splitting the middle term | Product and sum, and grouping |
| Dividing a term by a term | Signed products, and dividing powers |
| Dividing an expression by a term | Dividing a term by a term (a chain: ask the first before the second) |

## Decisions needed

- Which questions to give up when there is not enough spare room (the plan's repeat questions on
  secure skills are the first candidates).
- Whether one wrong answer on a going-up check is enough: it can only mark the skill *suspected* (the report
  then names it), or the check may be repeated once, which costs another question.
- If fewer than five spare turns exist for a solid child, which of the five come first.

## Open risk

For a child who is solid everywhere, how many spare turns exist is a count that has to be made in code
before promising all five. If it is fewer than five, the choice above matters.

## How it will be measured

Held-out v4 (written before this change, baseline in the scorecard doc) with the criteria declared in
its fixture header: gap in an added skill found at least 80%, no capable child given a gap, false gaps
not higher, median questions at most 2 above 24, capable children advanced no less than 50%. The v1 to v3
guard-rails must still pass. A new persona test would cover the going-up check itself.
