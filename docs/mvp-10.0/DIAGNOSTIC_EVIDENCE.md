# Diagnostic evidence qualification — MVP 10.0

**Status:** Implemented reporting policy, 26 October 2026; empirical validation pending.
This supplements the [classroom contract](./README.md). It changes no UI action, math marking, or classroom lifecycle.

## Observations and report claims

The diagnostic planner's historical `SECURE` evidence kind and ledger state are provisional routing signals. A successful item does not independently demonstrate every skill tagged on that item. They must not be described as validated mastery.

Newly built planned-topic reports qualify each positive skill record from the original response audits:

- A **direct success** requires a submitted response, no explicit “don't know,” verified correctness, positive skill evidence without conflicting negative evidence on that attempt, and the question's primary skill matching the reported skill.
- Positive evidence for another tagged skill is **supporting evidence**. Repeated supporting evidence cannot independently establish a strength.
- Missing question, response, or verification context is **unscoped evidence**. It cannot qualify a strength.
- A reported `SECURE` skill requires the internal ledger to remain positive and at least two distinct direct successful questions. Otherwise a positive ledger state is reported as `OBSERVED` (“more evidence needed”). Copies of the same expression, including variable-only renaming, count once. This does not prove diversity of representation or transfer.
- `evidenceAssessment` records the policy version, source turn numbers, and distinct direct success count. Delayed retention remains `NOT_MEASURED` in this diagnostic.
- Advancement/catch-up report outcomes use the qualified strengths, not the number of provisional positive ledger entries. Missing audit history yields an insufficient-evidence report, not fabricated certainty.

The two-question rule is a conservative product heuristic, **not** an empirically validated mastery threshold. An in-session demonstration is not proof of delayed retention, general memory, or mathematical competence beyond the tested context.

## Teaching targets and negative evidence

Teaching starts from an existing confirmed ledger entry. Similar sign-error labels on different skills must not synthesize a new confirmed foundational sign skill. A common-cause hypothesis requires a direct discriminating check before it can become an authoritative diagnosis.

The existing repeated-mistake/support-request policy still identifies support targets. Repeated difficulty with a skill does not, by itself, confirm a specific misconception or psychological explanation. Reports disclose this distinction.

## Deliberate boundaries of this change

- The internal diagnostic routing policy, skill prerequisites, and question count are unchanged. Routing may still use a provisional `SECURE` entry; report qualification does not establish that policy's scientific validity.
- Existing persisted reports are not silently rewritten. New or explicitly rebuilt reports carry the qualification metadata. A historical report without that metadata is not retrospectively validated.
- Mathematical verification remains authoritative within its supported forms. This change does not validate AI-authored misconception labels.
- No real student data is collected and no live-model accuracy claim follows from the regression tests.

## Choosing the next question's format

Each question format shows something the others can't, so the format of an upcoming question is chosen from what the last answer left unclear (`lotus-format-guide.ts`). It never changes what is asked or how the maths is marked.

- **On every answer, with no model call**, code reads the answer, the mistake it matched and what the play showed. A sign slip asks for the sign cases, a wrong pair asks to watch the search, "right but unsure" asks where the doubt is, and a wrong answer is checked in a different format from the one that raised it. A sure, careful right answer asks for nothing and the plan's rotation continues.
- **When an AI review runs**, it is given the format guide, how the student played and the formats already seen, and may name one format with a reason. Its choice is tried first.
- **The server has the final say.** A format must exist, be one that can dress a written question, and fit the question. Otherwise the evidence's choice is used, or the question stays as it is. The audit records who chose, what was asked for, what happened and on which question, so nothing claims a change that didn't happen. All of this is hidden from the student while the test runs.
- **The question the browser may already hold next is never changed.** A later question gets a new version with a new id; the older version stays valid for a browser that already has it.

Limits: the AI only weighs in on answers code can't explain, to keep the cost of a test down, so most choices come from the evidence rules. Formats that come with their own question (Stop the tape, Find them all and others) are placed by the plan and can't be requested. These rules are an engineering heuristic that has not been validated with students.

The next gate is the [factorisation validation plan](../../COGNA%2010.0/FACTORISATION_VALIDATION_PLAN.md).
