# Cogna Lotus — syllabus-grounded diagnostic architecture

**Status:** Current-state audit and proposed target design, September 2026. The target is **not implemented** merely because it is described here. For active classroom behavior, the canonical contract remains [`docs/mvp-10.0/README.md`](../docs/mvp-10.0/README.md). Frozen earlier MVP specifications are historical records, not competing Lotus instructions.

## Product decision

Lotus should ask **AI-created, syllabus-grounded questions tailored to the individual child**. A verified question bank supports speed, reuse, safety, and measurement; it must not become a fixed script that replaces personalization. The system must use the child's **entire evidence history**, including written working and uncertainty, when deciding what to ask next. The diagnostic should identify a useful starting point, not assign a permanent label or claim a clinical diagnosis.

## The common goal

**Cogna Lotus exists to give each learner a fast, humane, syllabus-grounded diagnostic that produces a trustworthy explanation of how they learn and what they need next.**

That goal has two inseparable parts:

1. **The technical goal:** make the diagnostic engine responsive and dynamically adaptive. The learner should experience an instant, uninterrupted run of questions while the system generates, verifies, ranks, replaces, and improves unseen questions in the background. The engine must be able to make concrete, auditable decisions: which future question should change, why it should change, whether its difficulty should rise or fall, whether a prerequisite probe is needed, and which questions must remain for curriculum coverage. “Question 4 is on screen while Question 8 is replaced” is a normal engine operation, not an edge case. Technical completion includes the generation pipeline, syllabus retrieval, mathematical verification, ready-question pool, full-history learner state, scheduling, concurrency, persistence, retries, observability, security, cost controls, and the student and observer interfaces.

2. **The scientific goal:** make the resulting diagnosis accurate, useful, and appropriately uncertain. Lotus must distinguish a slip from a persistent gap, identify prerequisite weaknesses, recognise strengths and alternative methods, account for confidence and explicit support requests, and understand relevant learning factors without pretending to infer more than the evidence supports. It must combine the learner's complete history—not just the latest answer—with the item's curriculum objective, working, timing where reliable, uncertainty, and the learner's overall performance pattern across the test. AI interpretations are hypotheses until supported by repeated, well-chosen evidence; deterministic checks and expert-reviewed rules take precedence wherever available. The report must explain what was observed, what was inferred, what remains uncertain, and what teaching or independent follow-up is justified.

### Goal contract: what must be true

These are two dimensions of one Lotus outcome, not two separate products:

| Dimension | The system must do | Evidence that it is working |
|---|---|---|
| **Technical — responsive dynamic engine** | Prepare a verified AI-authored question runway; show the next authorised item immediately after Submit; keep analysing in the background; and make concrete, auditable changes to unseen turns. | Student-visible submit-to-next-question p50/p95; percentage of next items already verified; generation/verification failure rate; queue depth; cost; and a replayable log showing *which future turn* changed, *what changed* (skill, wording, difficulty, representation, or purpose), and *why*. |
| **Technical — adaptation control** | Use both the latest response and the student's overall running performance—accuracy, recurring errors, partial work, confidence, support requests, pace where reliable, recovery after mistakes, and coverage already tested—to add, swap, remove, enhance, lower, raise, or hold unseen questions. Protect the question already on screen, preserve curriculum coverage, and invalidate stale candidates after a new answer, edit, or teacher override. | Every re-plan names the evidence version, target turn, old/new item, reason, difficulty delta, whole-test signals considered, and safety checks. No unseen item is silently replaced after it becomes visible. |
| **Scientific — valid learner understanding** | Infer learning gaps, strengths, prerequisite needs, uncertainty, confidence/calibration, recovery from errors, and possible interaction barriers from the whole evidence history and the overall pattern of performance—not from isolated answers. Use that pattern to decide whether a suspected issue needs confirmation, whether a question was a one-off slip, and which later evidence would discriminate between competing explanations. | Expert-reviewed cases, held-out student work, repeated-evidence confirmation, false-gap and missed-gap rates, calibration/abstention, curriculum alignment, subgroup fairness, and teacher usefulness of the final report. |
| **Scientific — honest conclusions** | Separate observation from interpretation and decision; distinguish a slip from a persistent pattern; state uncertainty; and never turn a weak signal into a permanent or clinical label. | Every report claim links to the underlying responses/working and records alternatives considered. A single wrong answer or a single “I don't know” cannot, by itself, create a confirmed diagnosis. |

The common acceptance rule is **both**: a question may appear instantly only if it is already checked, and a diagnosis may be reported only if its evidence is strong enough. Speed is not allowed to weaken validity; validity is not allowed to make ordinary navigation wait for avoidable model work.

### Student experience is a requirement of both goals

The learner's experience is not a cosmetic layer over the engine. It is evidence used to make better questions and a safety constraint on diagnosis. Lotus should observe whether a prompt is confusing, too repetitive, too difficult, too easy, inaccessible, or frustrating; whether the learner asks for help or says they do not know; whether working is being entered; and whether the pace suggests a need for a different representation. These signals may change the difficulty, wording, modality, or timing of later questions, but must not be treated as proof of mathematical ability by themselves.

The student-facing contract is therefore:

- the next authorised question appears immediately after Submit whenever it has already been generated and verified;
- no unchecked AI item is shown, and no question changes after the learner has started it;
- difficulty can be lowered, raised, or held with a visible educational purpose, while the overall test still covers the approved curriculum;
- an explicit “I don't know” or request for help is treated as meaningful support evidence, not as disengagement;
- feedback, transitions, loading states, accessibility, input tools, and clear progress indicators reduce avoidable cognitive and interaction friction;
- the learner is never shown private hypotheses, predicted wrong answers, chain-of-thought, or a permanent ability label.

The technical engine is successful only when it is fast **and** its decisions improve the quality of evidence. The scientific system is successful only when its conclusions are sound **and** the learner can complete the diagnostic without avoidable waiting, confusion, or loss of agency. These are jointly measured outcomes: student-visible latency and completion experience on one side, diagnostic accuracy, calibration, curriculum validity, fairness, and teaching usefulness on the other.

The desired loop is:

```text
Approved, versioned syllabus sources
  → concepts, objectives, prerequisites, exemplars, and candidate item families
  → validated questions and scoring rules
  → full-history learner evidence state
  → shortlist while the child works
  → assess the actual response
  → choose a safe, informative next item or take the slower review path
  → evidence-backed class report → teaching → independent exit evidence
```

“Instant” is a **measured user-experience goal**, not a correctness guarantee. An unexpected answer or ambiguous working may require a visible wait. We will not display an unchecked AI-generated maths item or silently replace a question once a child starts it.

## What exists today, and what does not

| Area | Current implementation | Target / discrepancy |
|---|---|---|
| Syllabus | Lotus prompts fix a Grade 8 CBSE signed-brackets context; there is no syllabus upload or ingestion pipeline. | Ingest approved, versioned syllabus material and retrieve the relevant portions for generation and diagnosis. |
| Personalization | The prompt includes every prior Lotus question, response, verification result, and audit; the next question is chosen after the submitted response. | Persist a compact, evidence-linked learner state and generate or select candidates ahead of submission without losing full-history reasoning. |
| AI path | Two independent assessments run in parallel, followed by primary debate and challenger closure. The arithmetic fast path shows a reserved question first, then runs this full review in the background; unsupported responses still wait for it. | Extend safe immediate selection across more item types and use background results to revise future questions. Measure whether every review stage earns its cost. |
| Maths safety | A narrow deterministic referee checks basic numeric arithmetic. Other mathematical forms and explanations are not fully proven by that referee. | Expand task-specific verification and abstain or require review where no reliable checker exists. Never call every AI answer key “verified.” |
| Next-item quality | A structural/duplicate guard rejects repetitive items; its `informationGain` name is not a measured psychometric information-gain score. | Choose for curriculum coverage, prerequisite discrimination, uncertainty reduction, exposure control, and estimated diagnostic value; validate with real outcomes. |
| Persistence | Classroom Lotus evidence and assignment completion are stored, but parts of Lotus persistence are best-effort and can fall back to process memory. | Make production evidence writes durable, idempotent, and observable before a session is treated as safely completed. Keep explicit demo data separate. |
| Prediction and prefetch | Lotus has an ephemeral, process-local reserve of up to four AI-generated candidates. It has no durable rolling queue, syllabus-linked item bank, or live predicted-answer set. A separate DiagnosticV2 buffer is not Lotus. | Build and shadow-evaluate the durable, curriculum-balanced rolling pool described in the continuous diagnostic design. |
| Shared patterns | Some general misconception models exist elsewhere in the platform; Lotus has no verified, privacy-safe cohort error-pattern feed. | Add reviewed, aggregated patterns as priors, never as proof of an individual child's thinking. |

The existing latency policy bounds output, lowers reasoning on non-final calls, and uses a stable prompt-cache key. This is an implemented **code-path saving**, not evidence that end-to-end latency or cache hits already meet a target. The experimental Lotus observer and production classroom flows must not be confused with a clinically or psychometrically validated assessment.

## 1. Give AI the syllabus, with traceable boundaries

The scaling input is the material the school or teacher approves: syllabus documents, chapters, learning objectives, worked examples, prerequisite maps, definitions, acceptable methods, difficulty expectations, and assessment boundaries. We should not paste an entire syllabus into every turn. An ingestion pipeline should:

1. Store the original source and record owner, permission/license, grade, board, subject, version, effective dates, and provenance.
2. Extract and review a structured concept graph: objectives, concepts, prerequisite edges, approved examples, and “do not test yet” limits.
3. Link each generated question to the exact source sections and objective it serves. A candidate without a valid alignment is ineligible.
4. Generate candidate items and scoring rubrics ahead of need, but also permit bounded on-demand generation when the current learner state has no suitable item.
5. Validate answer keys with deterministic tools where possible, check ambiguity/age appropriateness/duplication, and require human review for higher-risk or unsupported forms.
6. Version the source, prompts, generator, verifier, and item; invalidate or re-review items when the syllabus changes.

Syllabus retrieval narrows *what may be asked*. It does not dictate one question sequence for all children. AI chooses or generates the most useful question for the **current child**, grounded in those approved limits. The item bank holds previously validated questions and question families so that common needs can be served quickly; it is not the sole source of questions.

## 2. Build a learner state from the whole session

For every answered question, preserve the item and its source, the child's answer and working, timing where reliable, deterministic checks, AI interpretation, competing explanations, confidence, and unresolved uncertainty. Distinguish three layers:

- **Observation:** What the child wrote or did.
- **Inference:** What this might mean, with alternatives and uncertainty.
- **Decision:** Why the next item or stop decision is useful.

The next-item planner consumes a compact, versioned learner-state summary **linked back to all underlying evidence**. It must not use only the latest answer. We should test summary fidelity against full transcripts, especially when a recent answer contradicts an earlier pattern. Neither one wrong answer nor one correct answer establishes a stable misconception or mastery.

For clarity, the latest zero-wait design stages Question 3 while Question 2 is on screen, using actual evidence through Question 1. It must be useful across plausible outcomes of Question 2. After the actual Question 2 answer arrives, it updates the learner state and may change Question 4 or a later unseen item. Likewise, Question 11 is staged using actual evidence from Questions 1–9; Question 10 may shape Question 12 if review is ready, or a later question. The final diagnosis still examines **all** answers. This adaptation delay is the explicit cost of showing a question without waiting for a network response after Submit.

## 3. Predicted answers are temporary hypotheses, not a fixed answer list

For the **current** child and **current** question, the planner may prepare likely response signatures. These change as the child progresses. They are not a permanent list inserted for everyone and are not guesses of every literal string the child might type. A response signature may combine numeric answer, shown method, error steps, confidence, and prior evidence. The number of signatures should be selected by expected value and latency budget, not a fixed rule of four or six. Broad outcomes such as correct, incorrect, unknown, and unclear are useful routing labels but too coarse to identify a misconception.

Example: Aarav sees `3(4 − 7)` and is asked to show his steps. The numeric answer key is `−9`.

| Aarav's response and working | What it suggests | Useful follow-up |
|---|---|---|
| `4 − 7 = −3; 3 × −3 = −9` | Brackets evaluated first and sign multiplication appears sound. | Test transfer to a new signed-bracket context. |
| `3 × 4 − 3 × 7 = 12 − 21 = −9` | Correct distribution, a different demonstrated strategy. | Probe why distribution works or test a less familiar form. |
| `4 − 7 = −3; 3 × −3 = 9` | Possible sign-multiplication error. | Discriminate sign rule from a one-off slip. |
| `3 × 4 − 7 = 5` | Possible failure to distribute across the bracket. | Probe bracket structure with a contrasting item. |

The number alone is insufficient: `9` or `5` might arise from other reasoning, and even `−9` may be a guess. The system checks Aarav's actual working and the full prior history before taking a targeted *later* path. If his answer matches no safe signature, or the working contradicts the signature, the system takes the normal deeper-analysis path; the already staged next coverage question can still appear immediately. It must never force an unmatched response into the closest predicted branch.

Prepared signatures and candidates should be private, short-lived, versioned by session/question/evidence state, and invalidated after an override, edit, or new response. They must not be exposed to the student before the response.

## 4. Combine personal patterns with shared patterns carefully

Later, after enough real and permissioned data, Cogna can learn that a particular item often elicits a particular error pattern. Such a pattern belongs in a reviewed, aggregated library with an item or concept version, sample size, uncertainty, and provenance. It can improve candidate preparation **alongside** what Aarav's own earlier work suggests. It must not automatically diagnose Aarav from a matching answer.

The library needs privacy safeguards for minors, minimum group-size thresholds, access controls, retention rules, bias checks, and teacher review before promotion. Population frequencies should be treated as priors, not an individual truth. Training and production evaluation must avoid leaking a child's private answer into another child's prompt or a teacher's report.

## 5. Make the next question fast without weakening the diagnosis

### Module A — reduce work on today's critical path

The two independent first assessments already run together. Keep prompts compact and cache-friendly; bound answer length; use lower reasoning effort for routine stages and stronger checking when a consequential interpretation or stop decision needs it. Avoid redundant transcript processing by sending a faithful compact evidence state, with source links available for audit. Record time spent in verification, each AI call, selection, persistence, and browser delivery. Measure actual cache-hit rate and cost; do not infer them from the presence of a cache key.

This module shortens a wait but does not eliminate it if every next question still depends on several post-submit model calls.

### Module B — syllabus-grounded ready items plus live learner state

While the child works, Lotus uses the current **full-history** learner state to prepare a small rolling pool of *validated* questions or question families. The pool balances curriculum coverage, misconception discrimination, and transfer or confirmation. Most may be drawn from an approved syllabus-derived bank; a missing item may be generated and checked in the background. For a few plausible response signatures, the system can rank how ready items would serve the next step. It should generally **shortlist reusable verified items**, not spend four-to-six full AI generations for every hypothetical answer on every turn.

Before the test begins, the server stages a validated, syllabus-balanced baseline prompt for every remaining turn in its bounded budget. Before submission, the next authorized prompt is already in the browser. At submission, the browser shows it immediately and sends the answer to the server. The server checks the actual answer and working, updates the evidence state, and re-ranks only *unseen* future candidates. Ambiguous, novel, unsupported, or conflicting evidence still goes through deeper analysis. If that review falls behind, the student continues on the coverage plan; pending analysis delays final conclusions, not ordinary next-question transitions. A complete fallback path is part of the architecture, not an exception to hide.

Do **not** show a “provisional” question and later silently change it while the child is solving it. The staged question is already authorized and remains the question once shown. Background review can change later questions and final conclusions. If the requirement is that *every* next question use the deep interpretation of the answer just submitted, or that all future prompts remain secret from browser inspection, zero-network-wait display cannot be promised. The continuous diagnostic design explicitly chooses a one-question adaptation delay and prompt-only staging to meet the instant-display goal.

Server-side persistence should use durable, idempotent evidence and ready-item records keyed to session, current item, learner-state version, and syllabus/item version. Teacher overrides or edited responses invalidate prepared work. Retries must not double-count evidence. Avoid relying on a process-local cache for production correctness.

## 6. Diagnostic validity and classroom integration

Question selection should consider prerequisite coverage, alternative-hypothesis discrimination, difficulty, novelty, item exposure, time remaining, and the benefit of one more question versus stopping. The current structural duplicate guard is only one safety layer. Before claiming better diagnosis, evaluate the new selector against the current Lotus path using expert-scored cases, held-out student work, disagreement/abstention rates, unsupported-answer rates, curriculum alignment, and longitudinal exit performance. Use p50/p95/p99 **student-visible** latency and fallback rate, not just model-call timing.

Lotus diagnostic evidence feeds the teacher's class report with uncertainty and source links. A later teaching session may use generated video and gamified practice, but practice performance must stay distinct from independent diagnostic or exit evidence. The personalized exit test should be based on diagnosed needs and learning goals, with fresh items and an independent report to the teacher. Demo mode must remain visibly mock and isolated from real enrollment, reports, and learner records.

No automated interpretation should be framed as a permanent ability label. Teachers need the observed work, the rationale, and a way to challenge or correct a conclusion. Student-facing UI must not reveal active hypotheses or predicted wrong answers during the diagnostic.

## Build sequence and release gates

1. **Baseline and instrumentation:** Capture end-to-end/stage latency, cost, model disagreement, item errors, persistence failures, cache hits, and diagnostic quality on the current path. Keep the existing latency policy behind its evaluation mode.
2. **Syllabus foundation:** Add source ingestion, objective/prerequisite mapping, versioning, access control, provenance, and a reviewed generation/verification pipeline. This is the scaling prerequisite the fixed Grade 8 prompt lacks.
3. **Evidence state and item readiness:** Make production Lotus evidence durable; build auditable full-history learner snapshots; add a validated, syllabus-linked ready-item pool and item-exposure rules.
4. **Shadow comparison:** Generate personalized shortlists and response signatures without showing them. Compare the would-have-served item, response interpretation, quality, safety, and latency against the current two-AI path; inspect disagreements with educators.
5. **Controlled instant display:** Stage a prompt-only curriculum backbone for the bounded session, replace future unseen items with useful personalized probes when ready, and render the next authorized question on Submit. Track unreviewed evidence without delaying question display. Predefine measurable safety, teacher-override, quality, fairness, latency, and cost gates.
6. **Cohort learning:** Add privacy-safe, reviewed common-error patterns only after enough representative data. Re-evaluate for drift and bias. Expand subject and grade coverage only when source, verifier, and assessment gates are met.

This plan is an architectural recommendation, **not a claim of measured improvement or completed implementation**. A pilot must determine whether it is faster *and* at least as trustworthy as the current diagnostic.

## Questions settled in the discussion

- **Are Question 3 and Question 11 based on the entire preceding test?** The proposed zero-wait version uses all **available** actual evidence when staging a prompt. Question 3 uses Question 1 and any earlier history, and Question 11 uses Questions 1–9. The just-submitted answer may update Question 4 or Question 12 if processed in time, or a later unseen item. The final report uses the entire actual test. This adaptation delay is required for immediate display.
- **How many predicted answers per question?** No universal number. Start with a small, evidence-supported set of response signatures; use a latency/quality budget and a safe unmatched fallback. Four broad labels are routing categories, not four complete predictions.
- **Are predictions hardcoded or stored permanently?** No. Generate temporary, versioned, child-specific hypotheses for the current item. Store reusable *validated items* and, later, reviewed aggregate error patterns separately.
- **What happens with an unexpected answer?** Interpret the actual work through the slower full-history, two-AI path. The already staged validated syllabus question appears immediately; later unseen items can change when the interpretation arrives. Never force the answer into a predicted signature simply to save time.
- **Is pre-generating full branches the best architecture?** Not as the main method. The better working hypothesis is syllabus-grounded AI generation, a vetted ready-item pool, a live full-history learner state, and selective speculative ranking. Validate this in a shadow pilot before claiming it is better.
- **What makes this scalable beyond a fixed question bank?** The versioned syllabus becomes the source of truth for AI generation and alignment; the bank accelerates repeated, validated needs, while bounded new generation covers individual gaps and new curricula.

## Document boundaries

[`LOTUS_FAST_PATH.md`](./LOTUS_FAST_PATH.md) records the first reserve design and implementation history. The [continuous diagnostic architecture](./LOTUS_CONTINUOUS_DIAGNOSTIC.md) is the proposed next target for section 5 after a live run showed that symbolic and algebraic turns still wait. This document remains the wider contract covering syllabus grounding, the item bank, validity, and evaluation.

This replaces the stale `docs/lotus-experimental.md` and the rigid-branch `LOTUS_INSTANT_NEXT_ARCHITECTURE.md`. The separate [`COGNA Diagnostic Engine`](../COGNA/README_DIAGNOSTIC_ENGINE.md) essay is a labeled long-term vision, **not** Lotus's current implementation or the active classroom contract. Frozen MVP documents remain as historical records. Update this file when decisions are made or implementation measurements change; never backfill proposed behavior into the “exists today” column without verification.
