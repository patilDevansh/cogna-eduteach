# Learner evidence and exposure contract

Canonical / Frozen additive MVP 10.0 contract, 29 October 2026. Extends MODULE_LEARNING.md. Logical record requirements below apply to expansion; implementation coverage is explicit. Existing diagnostics and five uiAction values are unchanged.

## Version, identity and compatibility

Every new observation has schemaVersion, immutable eventId, source type/id, server-derived studentId and assignment/session relation, content/item version, server receivedAt and nullable client occurredAt. Use stable skill IDs plus map version when known; unmapped skill/concept associations remain unknown. Reusing a student's name or copying a record into a synthetic legacy Attempt is prohibited.

An explicit versioned journey discriminator distinguishes existing diagnostic-cycle observations from future MODULE_LEARNING_V1 records. Missing discriminator means existing diagnostic semantics, not a fabricated teaching-first module. New teaching-first runtime entry remains pending. Narrow existing lesson practice uses PERSONALIZED_VIDEO_PRACTICE_V1 and the existing PersonalizedVideoAssignment identity and optional lotusSessionId.

## Event groups

- Content: selected/generated, installed/available, client-confirmed presented and interacted/completed are separate facts. An assignment or a play request is not evidence that the whole lesson was watched.
- Response: exact item/version, answer, verifier/version and result, attempt sequence, mode/purpose, and source evidence references. Practice stays practice even when no help was requested. Independent and delayed checks have their own eligibility and sealing rules.
- Assistance: hint requested/issued, client-confirmed presentation, feedback/reveal issued and prior-item exposure; unavailable telemetry stays UNKNOWN. Server-issued assistance conservatively disqualifies an unaided claim even if its response was lost. Support acknowledgements must reference a prior server-issued hint for the same learner, assignment, item and content version; unknown/cross-item references are rejected. A browser acknowledgement reports an observation; it is not a measurement of attention or comprehension.
- Timing/context: elapsed, active, idle, pause, visibility, replay/seek and technical interruption are nullable contextual signals with collection definitions. No timing value is invented from missing telemetry. A notebook pause alone is not disengagement.
- Adaptation: available evidence, proposal, selection, installation and actual presentation carry separate IDs/timestamps and policy/model versions. Late/rejected actions cannot overwrite what was delivered.
- Review: separate review opportunity, source independent-learning evidence, due/presented/responded/missed state, actual delay, fresh item family, intervening practice and assistance. Immediate answers cannot become delayed retention; no returned check means missing evidence, not forgetting.

## Delivery semantics

The same eventId and identical canonical payload replays the original committed receipt. Reusing an eventId for a different payload conflicts. Events bind to learner/assignment/content version before progression; stale content returns a recoverable conflict without saving against a replacement item. Immutable receipt sequence under the assignment row lock breaks equal-timestamp ties. Server receivedAt establishes timing; client times may be skewed and never control evidence/progression. Distinct concurrent writes are serialised or conflict explicitly. A response says saved only after durable transaction commit. A lost acknowledgement must be safe to retry.

Legacy evidence lacking context remains legacy/incomplete. Do not retroactively assert no help, measured viewing, calibrated retention or a flow version. Reports preserve contradictory observations and reference original policy/content/evidence versions.

## Narrow implemented wire contract

The first runtime slice is limited to `type-answer` practice in an existing reviewed personalised lesson with settled authoring. Pending authoring returns a recoverable conflict:

- GET assignment practice adds optional `learning` metadata: schemaVersion 1, contentVersion, per-item saved receipts and statuses. Non-supported formats keep their current behaviour and are not advertised as covered by this slice.
- POST assignment `practice-evidence` requires schemaVersion 1, eventId, contentVersion and kind `PRESENTED`, `HINT_REQUESTED` or `ANSWER_SUBMITTED`; itemId is required for practice items and absent only for a lesson PRESENTED acknowledgement. Answer is accepted only for ANSWER_SUBMITTED.
- PRESENTED acknowledges the identified lesson or typed item actually mounted. HINT_REQUESTED returns the reviewed hint and records issuance; hint display can be acknowledged with supportEventId. ANSWER_SUBMITTED is marked server-side with the existing verified algebra checker.
- Server enriches each receipt with learner, source assignment, Lotus link when present, concept/skill as stored, item fingerprint/version, server time, evidence purpose PRACTICE, assistance NONE_RECORDED/ISSUED/UNKNOWN and verifier version. NONE_RECORDED means no recorded item help/feedback, not proof of independent mastery. Existing aggregate attempts without attributable new receipts yield UNKNOWN; any prior new-path feedback or hint issuance disqualifies a clean first-attempt claim. The narrow slice records skillMapVersion=null and typed-practice-v1 evidence policy rather than inventing a mapping version.
- The immutable receipt ledger is stored in the existing assignment's JSON script under `learningEvidence`. A transaction locks the assignment row, re-reads state, checks identity/version, appends one receipt and updates legacy practice aggregate atomically. ContentVersion is SHA-256 over stored lesson, exit, transfer, practice (including hints/answers), micro-lesson brief, animation, animationKind and format; it excludes practiceAttempts, learningEvidence and authoring job state. Exact committed replays return the original result after current access checks even if later content changed. No new student identity or parallel legacy Attempt writer is introduced.
- Saved client views expose only the current learner's legitimate feedback/answers after that attempt; never include future answer keys. Existing two-sealed-item exit answer withholding is preserved.
- Pending requests may be kept in tab-scoped session storage keyed by student/assignment/item/version for bounded retry/refresh. This does not promise full browser-offline operation. UI must disclose unavailable local recovery and never say saved merely because a browser entry exists.

Other interaction formats, replay/seek capture, comprehensive exposure tags, global history adapters, delayed review and new module progression remain subsequent work. The typed receipt ledger is immediate practice evidence and is not ingested into the legacy retention heuristic.

## Required verification

Malformed versions/IDs/actions, wrong learner, stale content, replay and changed-payload replay, concurrent distinct requests, failed transaction, restart/readback, explicit help versus first practice attempt with NONE_RECORDED assistance, absent exposure and legacy records. Browser verifies actual displayed content, save/retry state, refresh/resume and stored receipt correlation. Fake database tests alone do not establish durable behaviour.

### Server draft checkpoints: the temporary rule (DATA-015)

Product-owner decision, 8 November 2026. This is a product rule, not a legal-compliance claim, and it is provisional until the school discussion in DATA-007.

- **Who sees them:** no person. Draft checkpoints (`LEARNER_DRAFT_CHECKPOINT` raw events, from exercises and Lotus) are left out of every view: the student's own learning history, teacher and parent views, AI Studio and other students. Only Cogna's own analysis may read them. The one exception is a worker export made for the family's own request (`GET /lotus/students/:id/export` as a worker); a teacher export leaves them out.
- **How long:** 30 days (`DRAFT_RETENTION_DAYS`). Conclusions drawn from drafts may be kept in the learner memory; the raw text may not.
- **How they're deleted:** the nightly scheduler calls `POST /jobs/drafts/expire`, which permanently deletes draft checkpoints older than 30 days. Deleting a child's data (`DELETE /lotus/students/:id`) deletes all their drafts at once. Submitted answers and other evidence are never touched.
- **Release check:** draft capture may be used in a real school only while these three hold. `apps/api/test/golden/drafts-rule.database.v1.spec.ts` proves them, including a source scan that fails if any other code starts reading drafts.

### Unsubmitted typed-practice drafts

The typed-practice page keeps a separate, tab-scoped recovery draft, keyed by learner, assignment, item and immutable content version. It expires after 24 hours and only restores against the same latest checked-answer event. Input edits are written immediately, including an intentionally cleared input. Pending submitted requests take priority and retain their original event/body for retry. Acknowledged checked answers remain immutable; drafts are not server evidence, scored answers or learning progress. The UI explicitly distinguishes local unchecked drafts from acknowledged server saves. Recovery in another browser/tab/device and full offline operation are not promised by this slice.

## Exercise and Lotus answer context (v1)

Existing exercise `/student/practice` and Lotus submitted answers accept optional `interactionContext` (`StudentInteractionContext`, schemaVersion 1). This is additive context on the existing event/submission, not a new learner, assessment or event pipeline. Old clients remain valid and absent context remains unknown.

The browser records an observation ID; question ID/version (Lotus has no separate version, so null); client-reported presentation format; first answerable DOM presentation timestamp, nullable when never observed visible; wall elapsed time; nullable first mathematical input delay; hidden-tab duration/visibility changes; browser-offline duration/transitions; reload/partial-episode status; bounded answer edit-burst count; and pre-answer confidence provenance/value/scale. Typed edits within one second form one burst; the first burst is not a revision. Changed discrete selections count separately. These are input-action summaries, not identified reasoning changes. Working input starts the first-input clock without fabricating an answer revision. No raw keystroke history is transmitted.

Collection begins after an answerable question commits to the DOM. Disabled staged previews, preparation, a prior answer's reason prompt and observer-only content do not start that observation. Re-showing a disabled/minimised question starts a new explicitly partial episode; session and presentation format are part of client identity. A reload is partial because prior-page time is not reconstructed. Durations cap at 24 hours and capped records are incomplete. Hidden and offline intervals can overlap and must not be added as disjoint durations. Neither visible time nor the remaining duration is measured attention or thinking time. Offline means the browser's connection indicator, not every API/model failure.

A summary is frozen with its submitted answer and reused on retries. It is not sent while typing. Therefore unanswered/abandoned questions have no durable observation in this slice. Exposure acknowledgement for every unsubmitted question, replay/seek, all game actions, durable cross-refresh exercise/Lotus pending requests, full history adapters and retention/frustration interpretation remain follow-on work.

Service validation rejects unknown shape/fields, unbounded counters, invalid confidence combinations and mismatched source/question/version/scale. Student access stays at the existing authorised controller/session boundary. Client observations are untrusted contextual reports; server grading, skill mapping and purpose come from the joined server question/session. Question/assignment data is not inferred from the client's format label.

Exercise context is stored in `RawEvent.payload`, joined to `Attempt` by eventId and to the composite question ID/version. New context-bearing RawEvent/Attempt writes use a transaction. Existing server-enriched `storedResponse` is excluded when comparing the original wire payload. Identical retries replay existing evidence; changed new-context requests conflict, including omission of previously supplied context. Existing hint issuance remains separate RawEvent evidence. Lotus explicitly forwards validated context through the controller and retains it in both the audit snapshot and ANSWER metadata, joined by session/question/submission. Its same-submission retry compares normalised responses, including server-rebuilt tile answers. General cross-instance Lotus snapshot concurrency is unchanged and is not completed by this slice.

New analysis must use `confidence.status/value`, where NOT_ASKED/SKIPPED has null value, and keep inferred confidence separate. Lotus's legacy required numeric field can still be 60 when no confidence was reported; existing heuristics have not all migrated to nullable confidence. Exercise legacy `idleTimeMs:0` remains an unmeasured compatibility field. This addition does not turn those legacy fields into scientific observations or deliver cognitive analysis.
