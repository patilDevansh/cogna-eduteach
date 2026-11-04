# MVP 10.0 amendment — teaching-first module learning

**Status:** Canonical / Frozen, additive contract amendment, 28 October 2026.  
**Implementation:** Not delivered by this document. Runtime delivery and verification are separate tasks.  
**Authority:** Extends [README.md](./README.md) for a new module-learning path. Preserves the diagnostic cycle and [PILOT_FLOW.md](./PILOT_FLOW.md). No new era or flat UI action is introduced.

## 1. The product behaviour

A student can learn a current mathematics module before taking a broad diagnostic. Cogna starts with reviewed teaching, observes the student's responses, checks uncertainty, repairs relevant prerequisite gaps, returns to the module and gradually removes help. Fresh independent questions and later reviews show what the student can actually do.

A teacher may assign a module or targeted practice. A student may also choose a supported module independently. Neither requires a fabricated completed diagnostic or an invented confirmed gap. The same mathematical evidence standards apply to both entry routes.

## 2. Keep three journeys distinct

| Journey | Entry and progression | Compatibility rule |
|---|---|---|
| Existing teacher-gated diagnostic cycle | Teacher launches diagnostic; teaching/exit wait for the existing class-wide gates when `config.autoAdvance: false`. | Keep current ownership, gates and persisted assignment semantics. |
| Existing auto-advance diagnostic cycle | Diagnostic first; each student moves to teaching and exit after their own completion. `autoAdvanceEnabled` is true unless explicitly false. | Preserve PILOT_FLOW, including its existing skip/abstention outcomes. Do not reintroduce class-wide waiting. |
| New module-learning path | Assigned or self-directed module; reviewed teaching first; local checks, repair and independence within that module. | Does not require or complete a diagnostic assignment. Progress is per student. |

`autoAdvance` continues to control diagnostic-cycle progression. It is **not** a switch between diagnostic-first and teaching-first learning.

The new path requires an explicit, persisted, versioned flow discriminator. Existing records and old API requests without that discriminator retain diagnostic-cycle behaviour. New module entry must request the new path explicitly; the updated student/teacher module UI may offer it as the normal learning entry. Runtime field names, validators and migration belong to the shared data-contract task. This document's journey names are conceptual modes, not new `uiAction` values.

A module must not call the existing diagnostic `completeAssignment` route with a synthetic Lotus session, bypass the existing diagnostic's gates, or repurpose `SKIPPED` as proof of learning. Reuse reviewed teaching/rendering/marking infrastructure behind a distinct module progression contract.

## 3. Entry, identity and teacher control

### Teacher-assigned learning

- A verified teacher chooses a supported curriculum objective/module and eligible enrolled students through their owned classroom.
- Assignment records identify the target, its version, owning teacher/class, student, source and any due date. The teacher can see progress and unresolved support needs in that assignment's scope.
- Assignment is idempotent per intended assignment instance and learner. Repeating the same launch does not create duplicate work or reward credit. A deliberate repeat is a new instance linked to the earlier one.
- The teacher controls assignment scope, release, pause, cancellation and due date. Within the released module, the student can progress without waiting for classmates or a teacher button after every segment.

### Self-directed learning

- A signed-in student chooses from supported modules or follows a recommendation. No teacher-created assignment or school enrollment is fabricated.
- The student's durable identity and authorised learner records are reused. Home/school duplicates are not silently merged.
- Self-directed evidence is labelled with that source. It must not silently complete a teacher assignment, reopen a cancelled assignment or appear as work assigned by a teacher.
- A later teacher assignment may use relevant prior evidence to choose support, with provenance, but its completion policy must be explicit. It cannot claim the child completed new assigned work merely because old evidence exists.
- Teachers and parents see only the learner/assignment evidence permitted by their existing relationship and applicable access policy. Self-directed access does not grant a teacher access to unrelated students.

If a student leaves a classroom, ends a run or loses access, enforce the assignment's current permission on each action. Preserve historical authorised evidence; do not turn loss of access into success or delete learner history as a side effect.

## 4. Cold start and the teaching loop

| Step | Required behaviour | Evidence boundary |
|---|---|---|
| Select the starting content | Use module/objective, school sequence when available, accessible format and relevant prior evidence. With insufficient evidence, serve a reviewed default. | Unknown means unknown; no fixed learner-type, memory or attention label from missing data. |
| Teach a segment | Present an approved explanation/worked example or equivalent accessible/static form. | Generated/assigned content and content actually presented are different records. |
| Ask a checkpoint | Ask a relevant question after meaningful teaching, or a narrow prerequisite check when needed to make the material accessible. | A broad upfront diagnostic is not mandatory. Checkpoint assistance is recorded. |
| Interpret a response | Use verified correctness plus relevant context; preserve uncertainty and competing explanations. | One wrong answer or slow response does not establish a cause. Successful compound questions do not prove every tagged prerequisite. |
| Clarify uncertainty | Use a discriminating question, next-step choice or optional confidence/help request when useful. | A support target is not automatically a confirmed misconception. Repeated copies do not manufacture independent evidence. |
| Repair | Teach the relevant prerequisite, worked step or alternate representation. Keep the parent module and return point. | Record the reason, evidence used, actual support delivered and subsequent result. |
| Return | Use a fresh relevant check, then resume at the saved module step or an explicit appropriate revision. | A repair cannot silently redirect the child into an endless earlier-grade course. |
| Reduce help | Offer appropriate supported practice, then fade hints/examples when evidence supports it. | Supported success remains supported success. |
| Check independence | Use fresh verified items with no answer-revealing assistance during the scored attempt. | Separate independent results from lesson/practice scores; preserve item-level attempt rules. |

The student can request help or a break even when an inferred signal is absent. A request for help can justify offering support without declaring a confirmed knowledge gap.

Repair needs a configured, recorded attempt/time budget and an explicit exit. When it cannot resolve the difficulty, preserve the unresolved target, offer a manageable next step or pause, and report the need for additional support. Do not indefinitely repeat the same failing content or mark the prerequisite repaired because the budget expired. Specific policy budgets belong to the bounded-personalisation task and require verification; this contract does not invent a scientific threshold.

## 5. Pause, resume and interruption

- A voluntary pause is a pause, not an incorrect answer or confirmed disengagement. Notebook working may be quiet time.
- A teacher pause stops new progression/submission for the paused assignment on the server. A client cannot bypass it through another route. Unrelated self-directed work is governed by its own access policy, not implicitly cancelled by a class pause.
- Store the current content version, step, outstanding question/attempt, parent module, repair return point and assistance/exposure history. Resume the same authoritative state after refresh, re-login or another authorised device.
- Do not replace an outstanding verified item because a browser reloads. If content is withdrawn, invalidate the item explicitly, preserve its prior evidence and record the safe replacement reason.
- Duplicate and out-of-order events must not advance twice, award points twice or produce two independent answers. Server-side event identity, attempt sealing and revision checks are required.
- A second device reads current state; conflicting writes receive a recoverable stale-state response. The browser cannot decide that an assignment is complete.
- Persisted progress must survive a provider outage. When saving fails, show an accurate unsaved/pending state; never present unsaved work as synchronised.

## 6. Completion and delayed review are different

Track **workflow completion** and **learning evidence** separately.

Module workflow completion means the required steps have recorded outcomes and the applicable independent check is submitted or explicitly unresolved/skipped under a documented reason. Correctness is not required merely to finish a session. A wrong result cannot become mastery because the workflow ended. An abandoned or teacher-cancelled assignment is not completed learning.

A missing/unsafe independent item yields “independent evidence unavailable,” not a positive outcome. Any teacher decision to close the work must preserve that reason. Do not prevent the student from leaving an unresolvable session.

A later review is a separately scheduled work item linked to the skill and earlier evidence. It does not keep the original classroom run open indefinitely, and it does not reopen a completed run silently. The delayed result updates the longitudinal learner record and reporting period while leaving historical evidence intact.

Review eligibility requires relevant evidence and a versioned scheduling rule. Record delay, intervening practice, assistance, item novelty and performance. If the student has not returned, record a pending/missed opportunity rather than forgetting or failure. Simulated clock tests verify scheduling only.

## 7. Struggle and personalisation

Retention and frustration support require a full loop: observation → contextual estimate → intervention → recheck. Record self-reported frustration separately from inferred signals. Attention-related engagement signals must remain contextual and revisable; a slow notebook answer alone cannot label attention span.

Choose among reviewed supports appropriate to the objective: smaller step, alternate explanation/representation, targeted prerequisite help, manageable challenge, student choice or break. Content preferences can shape presentation; evidence of learning determines whether the selected support appears useful. Never withhold needed help to obtain cleaner observations.

The interpretation policy must record its version, evidence window, uncertainty, reason for intervention and outcome. Insufficient or contradictory evidence allows abstention and a neutral offer of help. This contract does not assert calibrated psychological detection; evaluation tasks must measure false alerts and usefulness.

Themes, animation forms, pacing and game modes require exposure tags, not only an assigned preference. “The child chose this” and “the child later solved and retained this mathematics” remain distinct. Changes in a content variant must preserve mathematical correctness and accessibility.

## 8. Minimum logical records

The shared schema task must translate these requirements into versioned wire and persistence contracts before implementation:

- Journey/assignment identity, learner, source, permissions, objective and module/content version; explicit compatibility discriminator.
- Resume state, step/attempt version, parent repair context and transition reason.
- Content selected versus delivered versus meaningfully interacted with; content features and support actually exposed.
- Response and verification, assistance level, attempts, timestamps and timing context; unavailable observations stay absent.
- Evidence interpretation with source IDs, target versus suspected cause, uncertainty and policy version.
- Support decision, actual delivery and recheck result; preference evidence separate from effectiveness evidence.
- Independent evidence and later-review linkage; intervening exposures/practice and duplicate/equivalent-item identity.
- Retry/delivery/saving status and provenance of fallback content; revocation, retention/deletion and role-based access rules.

Reuse existing learner/session/video/evidence records where their semantics fit. Do not create a second student identity, reinterpret old hinted attempts as unaided, or join all events solely by a display name. Old records missing new context remain explicitly incomplete, not backfilled with guessed observations.

## 9. Runtime action and reporting constraints

The shared UI action set remains exactly:

`SHOW_QUESTION | SHOW_EXPLANATION | SHOW_HINT | END_SESSION | SUGGEST_BREAK`

Use existing `learningIntent`, `contentStyle` and versioned parameters where compatible. `SHOW_TEACHING_MODULE` already exists as a learning intent; it is not a new UI action. If an implementation requires more intent/parameter detail, specify and review it in the active shared contract before coding. Do not invent flat aliases such as `REPAIR_GAP` as UI actions.

Keep diagnostic, lesson exposure, assisted practice, independent checks and delayed reviews separately identifiable in reports. Report progress within the tested context, denominators and missing/contradictory evidence. Chart points must trace to actual saved events. Teacher completion counts and learning outcomes must not share an ambiguous “improved” metric.

Existing exit-format rules remain authoritative for existing content, including the lantern gate's two sealed, one-attempt items where configured. This amendment does not change those counts or disclose answers early.

## 10. Failure behaviour and rollout

1. A provider outage may use a compatible reviewed local/bank package and bounded rules against saved learner state. A fallback must still match the skill, assistance stage and available independent evidence; arbitrary cached questions are insufficient.
2. Content-bank/asset exhaustion must be explicit. Offer an available verified alternative or stop the affected activity safely without claiming progress. Count actual compatible stock, not the raw number of generated items.
3. Backend/network outage is distinct from a model-provider outage. Full offline persistence/synchronisation is not implied by this module contract; its support boundary must be decided and shown accurately.
4. New module creation is behind an explicit deployment capability/rollout boundary until its acceptance checks pass. Existing diagnostic cycles continue on their original path.
5. Disabling new module creation does not erase in-flight state. Resume through a compatible verified fallback where safe, or show a recoverable paused state with preserved evidence. Do not silently convert it to a diagnostic or delete progress.
6. A rollout record identifies contract, schema, content and policy versions. Migration/rollback must preserve the evidence that generated prior reports.

## 11. Required acceptance matrix

These are implementation gates, not checks passed by writing this contract.

| ID | Scenario | Required result |
|---|---|---|
| ML-01 | Old teacher-gated run without a new discriminator | Existing class-wide gates, ownership and completion semantics remain. |
| ML-02 | Old/default auto-advance run | Diagnostic-first per-student progression remains; no added class-wide wait. |
| ML-03 | New assigned module, no prior diagnostic | Reviewed teaching opens without a synthetic diagnostic or invented gap. |
| ML-04 | New self-directed module | Student ownership respected; no fabricated classroom assignment or cross-student access. |
| ML-05 | Ambiguous wrong response or notebook pause | No unsupported confirmed cause/attention label; targeted check or neutral support available. |
| ML-06 | Relevant prerequisite gap | Targeted repair saves parent context, rechecks and returns; budget exhaustion stays unresolved. |
| ML-07 | Assisted success then fresh independent item | Evidence categories stay separate; no assistance leakage, duplicate credit or premature answer reveal. |
| ML-08 | Incorrect, unavailable or skipped exit | Workflow and learning outcomes remain distinct, with an explicit reason. |
| ML-09 | Voluntary pause, teacher pause, refresh, second device | Correct authoritative state resumes; server pause and conflict rules hold. |
| ML-10 | Repeat events and repeated launches | No duplicate assignments, progress, independent evidence or rewards. |
| ML-11 | Later review with intervening practice or missed return | Correct provenance and missingness; original run not silently reopened. |
| ML-12 | Frustration signal/self-report | Contextual support is delivered and its outcome rechecked, with uncertainty preserved. |
| ML-13 | Provider failure, depleted content or saving failure | Appropriate verified continuity or accurate recoverable stop; no unchecked maths or false saving. |
| ML-14 | Teacher ends/restarts work or enrollment changes | Access and attempt versions respected; previous evidence not silently reused as new completion. |
| ML-15 | Reports and rollout rollback | Points trace to evidence; supported historical records remain readable; no mock substitution. |

Required verification includes focused policy/contract tests, database/API ownership and idempotency checks, and an actual browser journey across teacher-assigned and self-directed modes. Follow the active era's applicable test-gate process. Engineering simulation does not establish real learner benefit.
