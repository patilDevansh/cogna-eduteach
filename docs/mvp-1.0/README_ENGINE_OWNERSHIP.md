# MVP 1.0 — Engine Ownership

> Who may write what. Conflicts with this matrix are bugs.

| Concern | Owner | Must not |
|---|---|---|
| Validate events, idempotency, orchestration | Learning Loop | Diagnose; choose intent; invent content |
| Deterministic grading | Learning Loop | LLM-grade simple finals |
| Mastery, misconception confidence, calibration, hint dependence, revision **signals** | Diagnostic Engine | Write revision queue; emit `LearningDecision` |
| Emit `LearningDecision` | Decision Engine | Grade; diagnose; generate question/explanation text |
| Select reviewed question | Question Generator | Choose learning intent; diagnose |
| Format explanation / next hint | Explanation Engine | Decide *whether* explanation is pedagogically required (Decision does); auto-fetch next question |
| Propose revision drafts | Recommendation Engine | Write queue rows; pick live next question |
| Write / dedupe / status revision queue | Revision Service | Diagnose; decide live action |
| Execute due revision now | Decision reads queue; Loop + Revision Service + QG | Diagnostic writing queue |
| Reports | Report Generator | Run after every answer; invent facts |
| Baseline sequencing | Decision (`sessionMode=BASELINE`) + fixed blueprint | Separate baseline engine |

## Hint path

```text
Student HINT_REQUESTED
→ Loop records event
→ Explanation Engine returns next approved hint from question.hintLadder
→ HINT_SHOWN
→ Diagnostic observes hint use on subsequent / linked evidence
```

Decision may also emit `uiAction: SHOW_HINT` proactively; still served by Explanation Engine.

## Revision path

```text
Diagnostic revisionNeedSignals
→ Recommendation proposals (session end)
→ Revision Service upsert/dedupe
→ Decision may EXECUTE_DUE_REVISION
→ Loop + QG + Revision Service status updates
```

## Routing from Decision

```text
SHOW_QUESTION              → Question Generator
SHOW_EXPLANATION|SHOW_HINT → Explanation Engine
EXECUTE_DUE_REVISION       → (still uiAction SHOW_QUESTION) + Revision Service
END_SESSION                → Recommendation + Report
SUGGEST_BREAK              → message only
```

## Post-explanation

```text
EXPLANATION_VIEWED
→ Loop calls Decision
→ uiAction SHOW_QUESTION + learningIntent RETEST_AFTER_EXPLANATION
→ Question Generator
```

Explanation Engine never selects the next question itself.
