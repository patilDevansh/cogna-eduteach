# Lotus Factorisation — 60-persona QA plan

**Purpose.** A deterministic, reusable test catalogue for the Grade 8
factorisation diagnostic. Personas are synthetic test data, never real
children. The existing service-level scripts drive `LotusService` with
scripted answers and model results. The browser-driven extension below tests
whether a complete, live diagnostic reconstructs a student's predeclared
intellectual profile and takes defensible actions.

**Migration status, 18 September 2026:** Some older rows below described
fixed fallback questions and overly simple secure/suspected/confirmed rules.
Those are not release criteria for the all-AI-question redesign. Migrate the
60 persona expectations to the evidence-calibrated rules in the
[continuous diagnostic plan](./LOTUS_CONTINUOUS_DIAGNOSTIC.md#8-repair-diagnostic-interpretation-and-the-action-loop-before-claiming-adaptivity)
before claiming this catalogue passes.

This does not prove the experience is “100% usable.” Automated tests prove
specified behaviour. A small, supervised pilot with students and maths
teachers is required to learn whether wording, pacing, and reports are usable.

## Browser-driven intellectual-profile evaluation

The latent oracle is a **learner capability profile written before the run**,
not the AI's own skill labels. Every profile specifies solvable item families
and difficulty, a stable error rule (if any), the working the learner would
show, and when they would say “I don't know.” The runner applies these rules
to whatever validated AI item is actually shown, so the test does not depend
on a fixed Q1 or fixed numbers. Afterward, two maths educators independently
label what the *actual response transcript* supports while blinded to Lotus's
analysis; their adjudicated report is the observable-evidence reference.

Represent each browser persona with a capability matrix keyed by skill,
item family, difficulty, and representation. Each cell defines `SOLVE`, a
specific repeatable `MISTAKE`, or `DID_NOT_KNOW`, plus a working-step rule,
confidence band, and response-time band. This makes intellectual level an
explicit test input rather than an answer script tied to fixed question IDs.

| Profile | Can solve | Deliberate response on a gap | Expected intellectual report and action |
|---|---|---|---|
| E01 secure transfer | Common factors, signs, grouping, identities, and trinomials at tested levels | Correct answers with coherent working in fresh forms | No confirmed gap; difficulty may rise while coverage remains broad; no gratuitous probes. |
| E02 numeric HCF gap | Factor pairs and straightforward variables, but not greatest numeric factors | Extracts a shared non-highest number repeatedly; working shows factor choice | Numeric-HCF suspected then confirmed only after a capable fresh probe; prerequisite HCF/factor-pair evidence, not a generic “factorisation” label. |
| E03 variable-common-factor gap | Numeric HCF and basic division | Takes a power/letter absent from one term or picks the highest power | Variable common-factor finding; numeric HCF remains distinct; a fresh item tests the variable rule. |
| E04 divide-one-term gap | Identifies the full common factor | Divides the first term correctly but leaves or changes the second quotient, with working | Term-division hypothesis versus transcription slip; an isolated quotient probe soon, not two generic checks at the end. |
| E05 sign gap | Positive common factors and basic grouping | Keeps an inside sign wrong after extracting a negative factor | Negative-factor/sign skill is tested on a second capable item; positive-factor successes are retained. |
| E06 identity gap | Common factors, grouping, and expansion | Treats a difference of squares as a perfect square or misses its roots | Identity-pattern gap with suitable alternate form; no invented common-factor gap. |
| E07 grouping gap | Common factors and identities | Groups four terms into pairs that cannot share the resulting bracket | Grouping step identified from working; simpler prerequisite is tested only if evidence supports it. |
| E08 support need | Easy numeric factorisation, not multivariable powers | Explicit “I don't know” on harder items, even when submitted quickly | Support signal, no disengagement claim or fake GPT review; a genuine easier prerequisite is shown or unavailability is explained. |
| E09 one-off slip | Same methods as E01 | One wrong symbol/quotient followed by a correct independent discriminator | Suspected error clears; no confirmed gap and no repeated same-skeleton checks. |
| E10 low-confidence correct | Solves tested methods correctly | Correct working with low confidence and slow pace | Correctness retained; confidence informs caution but is not a maths error or difficulty penalty by itself. |

For each profile, run a normal-paced and a rapid-response variant where
backlog matters. The latent profile, the **observable-evidence reference**,
and the actual AI report are separate records: if Lotus never tests a skill,
“untested” is honest, but missing a high-priority known gap counts as a
coverage failure. Score per-skill true/false confirmed gaps, first-wrong-step
accuracy, prerequisite choice, uncertainty calibration, and whether the
student's report matches the reference strengths and next teaching point.

### Playwright execution and comparison

1. Add a dedicated factorisation Playwright runner beside the existing
   `scripts/ui-e2e-playwright.mjs`, exposed by a separate package test script.
   Start an isolated API/web pair and test database with pseudonymous persona
   IDs. Run a controlled-model suite in CI and a repeated real-model suite for
   diagnostic-quality evaluation. The controlled suite proves browser-to-plan
   wiring; only the real-model suite can test AI interpretation quality.
2. Playwright starts the diagnostic in the student UI and uses accessible
   labels for final answer, working steps, confidence, “I don't know,” and
   Submit. The persona driver reads validated item diagnostics from the
   server-side test audit store—not from browser answer-key fields—and applies
   its capability/error rule to the item shown. It never submits via a direct
   API shortcut. Store a stable persona seed and repeat live runs to expose
   question-generation variability. Test-only question fixtures may control
   model behavior in the deterministic suite but must never populate the
   student-facing AI-question bank.
3. At each turn, compare the question actually displayed with the authorized
   plan; capture answer, instant verdict, queued/completed analysis, proposed
   action, validated candidate, installed slot, and item eventually shown.
   Wait for observable UI/database states rather than fixed sleeps. Replay
   slow Q2 analysis while the mock learner reaches Q5, timeout/retry, refresh,
   duplicate Submit, mobile layout, and the observer's action-status display.
4. At the end, have two educators independently label the actual response
   transcript, blinded to Lotus's report; adjudicate disagreements while
   retaining genuinely ambiguous labels. Compare structured final skill
   states, evidence links, root teaching point, limitations, and the actual
   question path with this reference. Separately score whether the path
   uncovered the predeclared latent gap. Do not assert exact AI prose. Flag
   separate failure classes: wrong analysis, correct analysis but wrong plan,
   good plan but failed generation/installation, false observer claim,
   insufficient coverage, or late analysis.
5. Save a redacted event timeline, plan diff, Playwright trace, screenshot,
   and video for each failure. Check Chromium desktop and mobile in the full
   suite, with Firefox/WebKit smoke coverage. Run the same profiles against a
   no-swap 25-slot baseline to establish whether adaptation actually improves
   gap discovery and next-teaching-point selection.

Run the ten E01–E10 profiles at normal and rapid pace, with at least three
fresh live-model sessions per combination (60 sessions), in addition to the
migrated 60 service personas and deterministic browser journeys. Predeclare
the release gates before examining live results: 100% of displayed answer
keys independently valid; zero changed already-shown questions, false
“implemented” claims, or stale-result overwrites; at least 90% agreement on
the main supported gap/strength among evidence-sufficient transcripts; no
more than 5% harmful false confirmed gaps; and at least 90% educator-rated
relevance of installed adaptive probes. Report coverage misses and genuinely
uncertain cases separately, not as model successes. Record p50/p95 analysis
queue age and end-to-end review latency; establish and publish a latency gate
from the isolated baseline *before* judging an optimized pipeline. Publish
the confusion matrix by skill and difficulty plus plan-action and cost
metrics; no aggregate pass rate may conceal a repeated harmful diagnosis.
Real student/teacher pilots remain a separate gate.

## The test harness contract

Each persona stores:

```ts
type PersonaScript = {
  id: string;
  profile: string;
  answerPattern: string;       // correct, predicted misconception, unreadable, or skip
  working: "clear" | "blank" | "misleading";
  timing: "fast" | "normal" | "slow";
  ai: "not-needed" | "step-N" | "late-step-N" | "fails";
  expected: string[];          // assertions, not model judgments
};
```

Use a fake model service. It must be able to delay a review, return a selected
`firstWrongStep`, disagree between reviewers, return invalid generated items,
or fail. Never run these tests against a live model and assert a particular
free-text response.

For every scripted test, capture a trace such as:

`started → question-staged → answer-received → instant-verdict → review-finished → plan-version → question-replaced/skipped → report-created`.

## Acceptance rules shared by every persona

1. Q1 is a validated AI item; 15 validated questions are ready before the test begins. Remaining turns are prepared during play or supplied from a vetted AI-generated bank. If none is ready, the UI waits honestly; no hardcoded student-question fallback is served.
2. Submit always advances to the browser-authorised staged next item, with no
   wait for AI.
3. Only an unreached item may be replaced. A background review must never
   change the current or already-staged next question.
4. One negative evidence item is at most a suspicion. Confirmation or clearing
   needs a later item capable of exposing the same hypothesis; a correct
   final answer without working does not secure every tagged prerequisite.
5. Code verdicts are authoritative. AI may only add a first-wrong-step finding
   where code has not already explained the response.
6. A confirmed prerequisite causes later dependent items to be skipped or
   rewritten; up to two unused prerequisite probes may occupy freed turns.
7. Skipped items appear in the report as not tested because of a dependency,
   never as a student failure.
8. AI-written items must pass exact algebra, full-factorisation, duplicate,
   targeted-mistake, predicted-wrong-answer, and (for choice items)
   blind-solver checks. Failed writes are retried or use a validated
   AI-generated reserve; if no eligible item is ready, the test waits honestly.

## 60 synthetic student personas

The expected outcome is deliberately short; test code should expand it into
exact question IDs, plan versions, skill evidence, and report assertions.

| ID | Learner profile and scripted behaviour | Expected diagnostic/product result |
|---|---|---|
| P01 | Secure throughout; normal pace; clear working. | No confirmed gap; strengths only; full plan runs out. |
| P02 | Secure but uses factors in reverse order. | Algebraic equivalence accepted; no false gap. |
| P03 | Secure; writes Unicode powers and multiplication signs. | Normalisation accepts valid notation. |
| P04 | Secure; leaves working blank but answers correctly. | Code verifies the answer; do not blanket-secure unobserved prerequisite methods. |
| P05 | Secure but slow and low-confidence. | Correctness outweighs confidence; no difficulty penalty. |
| P06 | Makes one numeric-GCF slip, then corrects later. | `SUSPECTED` then cleared; report calls it a slip. |
| P07 | Makes one variable-GCF slip, then corrects later. | Suspected variable GCF is cleared. |
| P08 | Gives incomplete but equal `3(x^2-4)`. | `VERIFIED_UNFINISHED`, not correct; correct owner skill. |
| P09 | Factors fully correctly after an earlier unfinished response. | Earlier suspicion clears, never becomes a gap. |
| P10 | Takes a non-highest common factor but expression is equal. | Unfinished/common-not-highest; never marked fully correct. |
| P11 | Divides first term only twice on later distinct items. | `FAC_DIVIDE_TERMS` confirmed; dependent future turns replan. |
| P12 | Divides first term only once, then performs full monomial factor. | Suspected divide-terms clears. |
| P13 | Drops the `1` twice in common-factor questions. | Divide-terms confirmed with `DROPPED_THE_ONE`. |
| P14 | Uses highest variable power twice. | Variable-GCF diagnosis, not a generic factorisation gap. |
| P15 | Uses LCM instead of HCF twice. | Numeric-GCF gap; descent offers HCF/factor-pair evidence. |
| P16 | Takes out a negative factor but keeps both inside signs. | Negative-GCF suspected then confirmed on a fresh later item. |
| P17 | Flips only one sign after negative factor. | Same skill can confirm even with a different error code. |
| P18 | Correct common factors but cannot factor a shared bracket. | Common-binomial gap; no blame assigned to GCF. |
| P19 | Stops grouping at a sum of two bracketed terms. | `FAC_MEANING` / unfinished evidence; later re-check protected. |
| P20 | Pairs four terms that share nothing; clear working. | AI first-wrong-step maps to grouping, not every later step. |
| P21 | Groups correctly once, then makes sign error in second group. | `FAC_GROUP_SIGN` is suspected; confirmation question is added. |
| P22 | Treats `x^2-9` as `(x-3)^2` twice. | Difference-of-squares confirmed. |
| P23 | Writes roots as coefficients, e.g. `(49a-25b)(...)`. | Perfect-square-recognition evidence, not only identity evidence. |
| P24 | Correct simple difference of squares; fails coefficient roots later. | Earlier secure evidence does not conceal later distinct skill evidence. |
| P25 | Recognises plus perfect square and succeeds. | Secure positive-perfect-square evidence. |
| P26 | Calls a non-identity a perfect square; working shows no middle-term check. | First wrong step maps to reverse-pattern skill. |
| P27 | Uses `(2y+3)^2` for a negative-middle perfect square twice. | Negative perfect-square gap confirmed. |
| P28 | Correct identities but fast-skips every question. | Fast skips create no maths evidence and are listed as a limitation. |
| P29 | Says “I don't know” after 60 seconds, no working. | `DID_NOT_KNOW` is evidence; later item re-checks. |
| P30 | Says “I don't know” within 3 seconds, blank working. | Record an explicit support need regardless of speed; no disengagement inference or fake AI review. |
| P31 | Chooses the wrong signed factor pair twice. | Pair-product-sum confirmed; sign foundations are probed. |
| P32 | Has correct product but wrong sum. | Pair-product-sum, not monic-trinomial, receives evidence. |
| P33 | Has correct pair but swaps signs in trinomial factors twice. | Monic-trinomial confirmation. |
| P34 | Reads `-7` as `+7`; clear working. | AI routes evidence to signed-ABC-reading step. |
| P35 | Correct factor pairs but cannot expand binomials to check. | Verify/expansion gap, not factor-pair gap. |
| P36 | Chooses “use difference of squares first” on `3x^2-12`. | Choose-method evidence; later full-factorisation item re-checks. |
| P37 | Factors `3x^2-12` only once, stopping at `3(x^2-4)`. | Unfinished full-factorisation evidence. |
| P38 | Correctly handles common factor, then fails difference of squares. | Separate step evidence; no blanket failure for the whole question. |
| P39 | Correctly factors `x^4-16` only once. | Success records factorising-fully strength, no overclaim beyond tested skills. |
| P40 | Cancels terms rather than factors in a rational expression twice. | Cancellation gap; report uses its own skill name. |
| P41 | Submits same response twice after a simulated timeout. | One audit/one plan advance only (idempotency). |
| P42 | Sends an unknown `nextQuestionId`. | Request rejected; session and staged item unchanged. |
| P43 | Refreshes between Q1 and Q2. | Exact staged next question, IDs, and plan version persist. |
| P44 | Opens two tabs and submits from the older one. | Stale request is refused/idempotent; no skipped turn. |
| P45 | Answers while AI writers run. | A validated, staged AI item appears if ready; otherwise an honest preparation wait, never a hardcoded question. |
| P46 | Valid generated Q3 arrives before it is reached. | Q3 replacement is personalised, validated, and visible only while unreached. |
| P47 | Generator returns wrong algebraic answer twice. | Both attempts rejected; validated AI reserve used or preparation wait shown. |
| P48 | Generator returns a duplicate expression. | Duplicate rejected; existing safe item remains. |
| P49 | Generator returns a predicted wrong answer equal to correct answer. | Validation rejects it. |
| P50 | Multiple-choice writer key disagrees with blind solver. | Item rejected; validated AI reserve used or preparation wait shown. |
| P51 | AI review is delayed until student has moved to Q3. | Q2 (staged next at submit) is unchanged; Q4+ may replan. |
| P52 | Delayed review confirms divide-terms after an instant first mistake. | Later plan changes; frozen next item is byte-for-byte unchanged. |
| P53 | Review returns a firstWrongStep outside the solution range. | No evidence invented; audit completes safely. |
| P54 | Review disagrees with deterministic correct answer. | Code stays authoritative; no negative evidence added. |
| P55 | Review pipeline throws/retries then permanently fails. | Test continues; report states missing deeper analysis where relevant. |
| P56 | Confirmed gap makes a later dependent item unusable. | Turn is `SKIPPED`; report says “not tested — depends on …”. |
| P57 | Confirmed gap only touches a side step of a later item. | Rewrite requested with `avoidSkill`; original never shown after replacement decision. |
| P58 | Side-step rewrite is not ready in time. | Held/removed honestly; no unsafe original is served. |
| P59 | Confirmed gap frees turns; two untested prerequisites exist. | At most two descent probes occupy freed turns, nearest prerequisites first. |
| P60 | Last answer has a pending delayed review. | Report waits only bounded time, completes, and later review can update durable report. |

## Architecture stories: question replacement and adaptive plan

Implement these as named integration tests in addition to the personas above.

1. **Four-at-a-time, ordered queue.** Instrument the fake writer; assert at
   most four active writes and starts in turns 2, 3, 4, 5, then 6 onward.
2. **Rolling readiness.** Before Q1 appears, at least 15 validated AI items
   exist against the 25-slot plan; later items are written or drawn from a
   validated AI-generated reserve before use. Depletion is disclosed, never
   silently filled with a fixed question.
3. **Replacement eligibility.** A valid write may replace exactly one open
   turn; it may not replace a current, answered, skipped, or frozen-next turn.
4. **Stale-result rejection.** Change a turn’s version while its old write is
   delayed; when it returns, assert a `STALE` outcome and no mutation.
5. **Plan before review.** Submit an instantly explained mistake; assert any
   immediate replanning changes only questions after the new current item.
6. **Plan after review.** Delay an unexplained-answer review; assert the same
   frozen-next rule when the review lands.
7. **Protected confirmation.** Suspect a skill then confirm a prerequisite
   gap that would otherwise prune its check; assert the first later re-check
   survives.
8. **Avoid rewrite safety.** A generated rewrite whose step tags still require
   the confirmed broken skill is rejected.
9. **Generation-failure honesty.** Simulate writer/model/network failures for
   later turns; a validated AI-generated reserve may be used, otherwise the
   student sees a recoverable preparation wait and no hardcoded question.
10. **Persistence.** Restart/reload service state after every lifecycle event;
    plan, versions, audits, and report remain consistent.
11. **Privacy.** Public active-session view does not expose answer keys,
    internal skill evidence, or adaptive-selection reasons.
12. **Latency.** With writers/reviewers blocked, measure Submit-to-next-item
    time against the agreed UI budget; it must not await an AI call.

## Difficulty: current contract and a future test suite

Today, a slot has a fixed `easy`/`medium`/`hard` level and the AI writer must
preserve that slot’s level. The implemented adaptation is **skill/path
adaptation**: confirm a suspicion, avoid a confirmed prerequisite, or descend
to foundations. It does **not** contain a rule such as “two correct hard
answers raise difficulty.”

Do not write passing tests for unspecified difficulty changes. First agree a
policy, for example: *two secure answers at a level allow one harder fresh
item; one mistake keeps/rechecks the level; a confirmed prerequisite gap
descends.* Then add these tests:

- correct-at-easy twice → exactly one eligible medium item, never a leap over
  a prerequisite;
- wrong-at-medium once → re-check at comparable difficulty, not an easier
  question that cannot confirm the skill;
- confirmed gap → descent is a prerequisite probe, not merely “easier maths”;
- generated item level matches its declared numeric/sign/structure dials;
- switching level never changes a question already staged in the browser;
- all difficulty decisions are saved with rule ID, evidence IDs, before/after
  level, and plan version for audit.

## Pilot exit criteria

Before a classroom pilot: migrate and pass all 60 personas under the revised
evidence and all-AI-question rules; pass all 12 architecture stories and the
Playwright intellectual-profile suite; prove invalid generated items are
never shown; and have maths educators review reports for P11, P16, P22, P31,
P37, P40, and every live-model E01–E10 profile.

During pilot, inspect pseudonymous telemetry weekly: validation/AI-reserve and preparation-wait rate,
question-generation latency, stage-change attempts, report corrections,
abandonment, and teacher disagreement. Each real defect or confusing student
behaviour becomes a new deterministic regression persona.

## What this test programme tells us about the product

When the 60 personas and architecture stories pass, we can say the product
contract is working in controlled conditions. In particular, we will know:

| Question we want answered | Evidence produced by the scripts |
|---|---|
| Does a single error become a false “learning gap”? | P06–P10, P12 and the ledger assertions show a first error is only suspected and can clear as a slip. |
| Does a repeated error identify the right skill? | P11–P27 and P31–P40 assert the skill, first wrong step, confirmation, and report wording. |
| Does code accept valid maths but reject incomplete work? | P02–P04, P08–P10 validate equivalent notation, exact algebra, and unfinished factorisation. |
| Does AI invent diagnoses or overrule proven maths? | P20, P34, P53–P55 assert first-step-only evidence and code authority. |
| Does the test adapt after a confirmed gap? | P11, P15, P31, P52, P56–P59 prove protected re-checks, pruning, rewrites, and descent probes. |
| Does the student experience remain fast while AI is slow? | P45, P51–P52 and Architecture stories 1, 2, 6 and 12 measure staging and Submit-to-next-item latency. |
| Are questions really personalised and changed safely? | P46–P50 and Architecture stories 3–9 show valid personal replacements, rejection of bad output, and honest AI-reserve or preparation-wait behavior. |
| Can background work alter a question the student already has? | P51–P52 and Architecture stories 3, 5 and 6 assert that it cannot. |
| Does the system survive normal real-world technology problems? | P41–P45, P55 and Architecture story 10 cover retries, duplicate submits, refreshes, stale tabs, network/model failure, and recovery. |
| Can a teacher audit why a report was produced? | Every persona asserts a durable audit trail; P56 confirms removed items are reported honestly as not tested. |

Passing does **not** prove that real students understand the wording, enjoy the
pace, or that teachers find reports useful. Those are pilot questions, to be
answered through observed sessions, student feedback, and teacher report
review.

## Do we need one model, two models, or more?

The persona scripts prove that the current two-reviewer-and-closing-call
architecture is safe and functional. They cannot prove that two models are
educationally better than one, because scripted fake models follow the answer
we give them. That is a separate, blinded evaluation.

### Model-comparison evaluation

1. Collect a consented, de-identified set of completed student responses and
   working across the important error types. Add carefully reviewed synthetic
   examples only to fill rare safety cases.
2. Ask at least two maths teachers, independently and without seeing model
   outputs, to label each response: mathematical status, first wrong step,
   skill, and confidence. Resolve disagreements into a documented reference
   label; retain unresolved cases as genuinely ambiguous.
3. Run exactly the same cases through four configurations:

| Configuration | Why compare it |
|---|---|
| Deterministic code only | Establishes what needs no AI at all. |
| One reviewer model | Measures the simplest usable AI design. |
| Two independent reviewers | Measures whether independent review catches meaningful errors. |
| Two reviewers plus closing call | Measures whether arbitration improves, preserves, or harms the result. |

4. Score each configuration against the teacher reference labels:

- first-wrong-step and skill accuracy;
- harmful false diagnosis rate (wrongly naming a learning gap);
- missed-diagnosis rate;
- reviewer disagreement rate and whether disagreements are cases teachers also
  find uncertain;
- how often the second reviewer/closing call changes an incorrect judgement to
  correct, and correct to incorrect;
- downstream plan quality: whether the selected re-check, rewrite, skip, or
  foundation probe matches the reference skill;
- latency, token cost, failure/retry rate, and student-facing impact.

### Decision rule

- Keep **one model** if it matches teacher labels closely and a second model
  rarely corrects a consequential mistake.
- Keep **two models** if the added reviewer materially lowers harmful false
  diagnoses or improves correctly targeted future questions enough to justify
  its cost and background latency.
- Add a **third model only after evidence** shows that two-reviewer disputes
  are frequent, important, and a third independently improves teacher-label
  agreement. More models are not automatically safer; correlated errors, cost,
  and complexity can increase without improving learning decisions.

Store the comparison results separately from student-facing records, using
pseudonymous IDs and strict access controls. Re-run the evaluation after a
model change, prompt change, or material change to the skill map.
