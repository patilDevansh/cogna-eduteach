# Cogna 10.0

Lotus maintenance (10 November 2026): report evidence qualification, board terminology, teacher portfolio access and diagnostic paper ordering are undergoing local verification. Browser acceptance and the complete regression suite remain open; see `docs/audits/phase-2.md` and `phase-3.md` for observed results.

Production classroom orchestration is the active engineering era. The canonical contract is [`../docs/mvp-10.0/README.md`](../docs/mvp-10.0/README.md).

3 November 2026: Signed-in teachers can open AI Studio from their workspace to inspect saved Lotus diagnostic evidence for currently owned, actively enrolled classes. The local demo teacher can inspect standalone demo diagnostics in development only. This is an observer view, not a diagnostic-quality or learning-efficacy claim.

MVP 10.0 diagnostic evidence maintenance (2026-10-26): new planned-topic reports separate single/supporting successes from repeated direct demonstrations and record their source turns. Teaching no longer invents a confirmed foundational sign gap from sign labels on other skills. See the [evidence contract](../docs/mvp-10.0/DIAGNOSTIC_EVIDENCE.md) and [real-student validation plan](./FACTORISATION_VALIDATION_PLAN.md). This is not scientific validation or a complete planner redesign.

The [Cogna Lotus architecture](./LOTUS_ARCHITECTURE.md) records the current diagnostic implementation, the syllabus-grounded personalized target, the latency design, and the gaps still to validate. Proposed behavior in that document is not a shipped feature or a replacement for the canonical classroom contract.

The [factorisation problems log](./FACTORISATION_PROBLEMS.md) separates browser-confirmed findings from handoff risks that still need targeted verification.

The [continuous diagnostic architecture](./LOTUS_CONTINUOUS_DIAGNOSTIC.md) is the proposed next design for prompt-only question staging on the student's device, a durable rolling pool, curriculum-balanced selection, and background analysis. It follows the live browser finding that the first reserve implementation is fast for arithmetic but still waits on symbolic and algebraic work. It is not yet implemented.

The [content generation engine plan](./CONTENT_GENERATION_ENGINE_PLAN.md) proposes a governed intervention planner, reusable animation library, verified lesson recipes, scalable media delivery, and phase gates. It is a design proposal, not shipped behavior or a change to the canonical classroom contract.

Current state: classroom implementation exists and Lotus has a limited arithmetic fast path. Syllabus ingestion, durable rolling readiness, and fast symbolic/algebraic transitions remain proposed and require implementation and evaluation.


[Interaction formats](../docs/mvp-10.0/INTERACTION_FORMATS.md) are implemented: tile-game answers (bracket bridge, split it, term builder, factor safe) in the Lotus diagnostic, the one-attempt independent exit and practice. They are marked by the unchanged algebra marking, and `COGNA_GAME_FORMATS=off` turns them off.

MVP 10.0 UI maintenance (2026-10-08): Lotus now includes workshop and constellation tile scenes, alternating interactive coverage, early Detective, more reliable Garden generation, and separate math toolbars for final answers and working steps.

MVP 10.0 UI maintenance (2026-10-09): Factor crossword and Cut-and-build studio are integrated into compatible diagnostic coverage. Both retain server-side algebra checks and withhold correctness feedback. Focused tests and TypeScript pass; full database/browser acceptance remains pending.

## Shared AI delivery coordination (2026-10-28)

Cross-chat delivery now has common agent entrypoints, task ownership, acceptance evidence and handoff rules. Follow the coordination section in root AGENTS.md; private planning stays outside the public repository. This setup changes coordination only and does not certify any additional runtime feature.

## Teaching-first contract amendment (2026-10-28)

Canonical teaching-first contract added in `docs/mvp-10.0/MODULE_LEARNING.md`; runtime delivery remains pending. It preserves both existing diagnostic modes and clarifies amendment precedence.

## Verified local staging during provider outage (2026-10-28)

Provider-outage maintenance: verified code-probe/bank staging now runs before the model-outage guard, with provider cooldown distinct from content backoff. 51 focused tests and API TypeScript pass. Fresh-session and full continuity coverage remain separate work.


## Typed-practice evidence and recovery — 29 October 2026

Personalised typed practice now uses durable versioned receipts, transactional replay-safe saving and a resumable student UI. Lesson/item exposure, explicit help and practice evidence remain distinct from independent/delayed outcomes. 80 relevant API, 4 isolated PostgreSQL, 2 client and 16 browser assertions passed; API/web TypeScript passed. Local working build only.


### Unsubmitted practice refresh correction — 29 October 2026

Typed practice now distinguishes tab-local unchecked drafts from durable checked answers; refresh restores unsubmitted edits without rewriting answer evidence.


### Exercise and Lotus interaction context — 30 October 2026

Exercise and Lotus answers now carry optional bounded interaction context into existing authorised persistence. The contract documents observation definitions, legacy missingness and remaining collection/history limits.


### Recovery, joined history and contextual support —30October2026

Implemented local active-session recovery, separately recorded visible/unanswered observations, joined student-owned history and contextual support with reviewed hints, pause/resume and an explicit practice recheck. Existing diagnostic/exit boundaries remain; this does not complete the full module journey or release.

### Draft-process review correction — 2 November 2026

2 November: Student learning history now projects submitted Exercise/Lotus answer text and answer elapsed time; active typed Exercise/Lotus questions emit bounded, ungraded draft checkpoints after a pause/blur or clear. This closes a product review visibility gap without claiming every keystroke or a cognitive diagnosis. See docs/mvp-10.0/RECOVERY_AND_CONTEXTUAL_SUPPORT.md. Product acceptance remains pending.

### Teaching-first reference module — 2 November 2026

A separate, rollout-gated Grade 8 monic-trinomial module path now starts from a reviewed lesson without creating a diagnostic. Signed teacher assignment and student-led entry share a saved run; a checkpoint can lead to a discriminating prerequisite check, bounded repair, return and a fresh unaided exit. Static reviewed slides work without model, narration or rendering calls. This is a reference slice, not full module/curriculum delivery or real-learner efficacy evidence. Local focused, isolated PostgreSQL and browser checks passed; independent product review remains open.

3 November follow-up: new runs reserve unused reviewed exit questions per learner, teacher access checks current classroom ownership, and browser active-run keys are scoped to the signed-in learner. Reference review remains open.


AI Studio observer maintenance (5 November 2026): Lotus dev observer and teacher records show the recorded review duration, next-question source/reason and format decision. The current review appears once. Local web type and render checks pass; the saved diagnostic browser view was inspected.


Saved Lotus entry correction (5 November 2026): an explicit session link resumes an existing authorized diagnostic. The local seven-answer diagnostic and refresh recovery were verified.


Lotus refresh maintenance (5 November 2026): restored the selected saved session and retained submission; optional observer interaction metadata no longer blocks local recovery. Browser refresh verified at the next question.
