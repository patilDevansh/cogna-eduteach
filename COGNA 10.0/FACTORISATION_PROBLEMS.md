# Lotus factorisation — problems and verification gaps

**Status:** Open test findings, 18 September 2026  
**Scope:** Grade 8 factorisation diagnostic on `codex/2026-08-12-improvements`  
**Sources:** Two real-browser observer sessions with demo Aarav; focused factorisation tests (45 passed); [factorisation handoff](./LOTUS_FACTORISATION_HANDOFF.md). No factorisation code was changed during this review.

The fast-next mechanism worked in the browser paths tested: Submit showed a staged next question without waiting for the four-stage AI review. After two matching errors, the plan removed dependent work and showed prerequisite questions. That is narrower than proving every transition meets a latency target, every question is AI-made, or every possible adaptive rewrite works.

## Confirmed in the browser or implementation

### F-01 — Fixed questions violate the AI-made-for-every-question requirement

**Priority:** High · **Status:** Partially addressed; regression test required

The opener was fixed in both browser sessions. The implementation now queues an AI write for Question 1 and waits for ten validated AI questions before revealing the test; the fixed opener remains an emergency fallback. Foundation questions used after a confirmed gap can still be fixed fallbacks, and the three-minute timeout can still permit fallbacks. The architecture therefore improves the requirement but does not yet guarantee an AI-written item on every turn.

**Acceptance criterion:** Either provide a durable, pre-generated and validated AI question for every turn before the student can encounter it, including openers and foundations, or explicitly change the product requirement and label fixed fallbacks as such. Never call a session fully AI-generated when a fixed item was served.

### F-02 — Base question writing does not use the learner's answer history

**Priority:** High · **Status:** Confirmed in code; degree of individualisation not proven by UI

`WriteRequest` in `apps/api/src/lotus/lotus-question-factory.ts` contains a slot specification, purpose, optional target mistake or avoided skill, and an avoid-duplicates list. The base writer prompt contains the skill, difficulty, shape, and mistakes, but no cumulative learner evidence. `buildSkeleton` in `apps/api/src/lotus/lotus.service.ts` queues `BASE` writes from slot specs. Thus base questions can vary in numbers and avoid repeats without being chosen or authored from the child's full diagnostic history. Targeted `CHECK` and `AVOID` writes do have limited mistake/gap context.

**Acceptance criterion:** Define and pass a bounded, privacy-safe learner state (all relevant prior answers, workings, verified skill evidence, and curriculum coverage) to planning and writing; test that materially different histories produce appropriately different future questions while retaining deterministic validation.

### F-03 — Background review falls behind the student

**Priority:** High · **Status:** Confirmed in browser; also reported in the handoff

In one observer run, five deeper reviews were still pending after eight answers. In the controlled run, three were pending when the observer ended after five answers. The report disclosed the missing reviews. The first completed review correctly explained that Aarav divided the first term but left the second unchanged, but late reviews cannot improve questions already shown. The handoff separately reports 27–71 seconds per review and 10 pending after a 25-question scripted run; those timing figures were not independently measured in this browser review.

**Acceptance criterion:** Measure review queue age and completion before subsequent affected turns; make the queue keep up with realistic student pace or explicitly defer any diagnosis that requires unfinished AI evidence. Add a visible/recorded distinction between code-confirmed and AI-reviewed conclusions.

### F-04 — Writer validation does not require the requested mistake patterns

**Priority:** High · **Status:** Confirmed in code; not isolated as a live failure

`checkWrittenItem` in `apps/api/src/lotus/lotus-question-factory.ts` checks that enough predicted wrong answers exist and that their mistake labels look like codes. It does not require the generated answers to cover the particular mistake codes requested by the slot or a targeted `CHECK` write. A generated question can therefore pass with two other wrong-answer patterns yet fail to provide the intended fast recognition or confirmation path.

**Acceptance criterion:** Validate required codes and the mathematical/structural meaning of their associated wrong answers; reject or regenerate an item that cannot test its targeted misconception. Add a test for an item with the right count but the wrong codes.

### F-05 — The displayed test length changes during play

**Priority:** Medium · **Status:** Confirmed in browser

The controlled run began at 25 planned questions, displayed 16 after the confirmed gap, and later displayed 18 as background replanning continued. A changing plan is expected, but `Question N of M` presents the number as a stable test length and can be confusing to a student.

**Acceptance criterion:** Show progress without implying a fixed total, or explain in student-friendly language that the diagnostic length adapts. Keep observer-only plan counts separate from the student experience.

### F-06 — Report can present indirectly inferred foundations as observed strengths

**Priority:** Medium · **Status:** Needs diagnosis; observed report wording

The five-answer report listed “Factor pairs of a number” under **Observed strengths**, although the student had not received a standalone factor-pairs question. A correct HCF answer may imply some related ability, but the report does not distinguish that inference from direct evidence. The report correctly marked dependent removed questions as **not tested**, not wrong.

**Acceptance criterion:** Trace every listed strength to a specific answer and skill-tagged step. Label indirect prerequisite inference separately, or require a direct item before calling it observed/secure.

### F-07 — “Nothing was written” hid a meaningful help signal

**Priority:** High · **Status:** Addressed

Previously, an “I don't know” response was rendered in the observer panel as “Nothing was written, so there is nothing for the AI to review.” That incorrectly made a learner's explicit uncertainty look like missing data. The system now records every explicit `DID_NOT_KNOW` response, regardless of how quickly it was selected, explains that it is evidence of a support need, and asks an easier prerequisite question where the skill map provides one. Only a submission without an explicit uncertainty signal is treated as a non-diagnostic skip.

## Existing handoff issues not independently reproduced here

These are reported in [handoff section 6](./LOTUS_FACTORISATION_HANDOFF.md#6-known-problems-and-limits-please-confirm-or-refute). Keep them open until a targeted UI/API test confirms or refutes each one.

| ID | Reported risk | Targeted verification |
|---|---|---|
| H-01 | A positive-only correct answer can clear a suspected sign mistake even though it could not expose that mistake. | Reproduce the Q12–Q15 sign sequence; require a later item capable of exhibiting the same error before clearing. |
| H-02 | A generated multiple-choice distractor can carry a plausible-looking but mathematically wrong mistake label. | Feed a distractor like `3 and 4` for product 18/sum −9; verify that code rejects the label rather than recording a sign misconception. |
| H-03 | A generated item can be harder than its specified level. | Review a sample of accepted `easy` items against a defined difficulty rubric and reject violations. |
| H-04 | Per-answer four-stage reviews, two-attempt writes, and blind MC solves may be expensive at classroom scale. | Record per-student and per-class call count, queue delay, cost, and completion rate under concurrent use. |
| H-05 | Real database persistence, learning-path handoff, and post-test personalized video were not exercised for this topic. | Test a production-backed session across process restart, then follow the completed report into teaching. |

## Coverage of this review

- **Passed in UI:** immediate visible next question in the exercised turns; an AI-written question served in one session where the fixed fallback appeared in another; predicted-wrong and equal-but-unfinished code verdicts; two matching errors confirming a gap; dependent-question removal; descent to powers and HCF foundations; report showing confirmed gap and “not tested” dependencies; one completed AI review correctly describing the student's work.
- **Not yet proved in UI:** a full natural run to completion; measured p95/p99 click-to-paint latency; history-personalised generation; a live side-step `AVOID` rewrite; late review never changing the already-staged next prompt under all races; every generated question's mathematical and diagnostic quality; production database durability; classroom-scale load.
- **Automated check:** 45 focused factorisation/ledger/session tests passed. Passing tests do not replace the missing browser and load evidence above.
