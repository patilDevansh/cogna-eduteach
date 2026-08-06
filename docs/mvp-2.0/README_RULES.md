# MVP 2.0 — Rules

> Exact formulas, constants, and state machines. Versioned. Placeholders are intentional but **deterministic**.  
> Versions: `mastery-formula-v2`, `diagnostic-rules-v2`, `decision-rules-v2`, `retention-rules-v2`, `recommendation-rules-v2`.

**Delta from MVP 1.0:** Mastery, misconception confidence, confidence calibration, hint dependence, remediation state machine, and baseline policy **carry MVP 1.0 constants unchanged** unless a row below says otherwise. New in v2: retention estimate, learning velocity, error recovery, explanation effectiveness, engagement/fatigue, expanded decision priority, and recommendation term definitions.

---

## 1. Mastery (`mastery-formula-v2`)

### Status vs MVP 1.0

**Unchanged constants.** Formula shape and weight tables are identical to `mastery-formula-v1`. Version bumped to `v2` only so retention coupling and replay labels can cite a single MVP 2.0 rule set.

### Priors

```text
masteryInitialValue      = 0.50
masteryInitialConfidence = 0.10
alpha                    = 0.12
```

### Update

```text
signedEvidence =
  correctness
  × difficultyWeight
  × independenceWeight
  × itemQualityWeight

newMastery = clamp(oldMastery + alpha × signedEvidence, 0, 1)
```

### correctness

```text
CORRECT            = +1.0
PARTIALLY_CORRECT  = +0.25
INCORRECT          = -0.70
INVALID_FORMAT     =  0
skipped            =  0
```

### difficultyWeight

```text
1 → 0.70
2 → 0.85
3 → 1.00
4 → 1.15
5 → 1.30
```

### independenceWeight

```text
no hint            = 1.0
highestHintLevel 1 = 0.8
highestHintLevel 2 = 0.6
highestHintLevel 3 = 0.4
```

### itemQualityWeight

From question metadata; default `1.0`. Range clamp `[0.5, 1.2]`.

### Profile confidence growth (mastery confidence)

```text
newConfidence = clamp(
  oldConfidence + 0.05 × min(1, evidenceCount / minimumEvidence),
  0.10,
  0.95
)
```

After each counted attempt on that concept (`INVALID`/`skip` do not increment evidenceCount).

One attempt must not move mastery by more than `alpha × 1.3 × 1.2 ≈ 0.19` absolute in extreme case; typical moves are smaller.

### Mastery decay / retention coupling (explicit)

**Mastery does not silently decay over calendar time.**

- `masteryScore.value` changes only via the update formula above (or an offline reprocess under a new formula version).
- Forgetting risk is modeled separately as `retentionEstimate` (`retention-rules-v2`).
- Due revision / `RETENTION_REVIEW` may schedule practice; successful independent practice then updates mastery through the normal formula.
- Do **not** implement “subtract X mastery per day.” If a future pilot requires calendar decay, introduce `mastery-formula-v3` with golden tests — not ad-hoc decay in v2.

---

## 2. Misconception confidence (`diagnostic-rules-v2`)

Carry MVP 1.0 pattern confidence:

```text
On matching incorrect pattern:
  misconceptionConfidence = min(0.95, 0.35 + 0.15 × matchingCount)

On non-matching correct targeted item:
  misconceptionConfidence = max(0, misconceptionConfidence - 0.20)

Activation when:
  matchingCount >= minimumMatchingAttempts
  AND misconceptionConfidence >= activationConfidence
  AND NOT alternativeExplanationDominant
```

Default taxonomy thresholds (unless concept taxonomy overrides): `minimumMatchingAttempts = 2`, `activationConfidence = 0.60` (`ARITHMETIC_SLIP`: 3 / 0.55).

### Evidence expiry (unchanged)

```text
Matching evidence older than 21 days contributes half weight.
Matching evidence older than 45 days ignored for activation (history retained).
```

Weighting for activation count:

```text
0–21 days old   → weight 1.0
22–45 days old  → weight 0.5
>45 days old    → ignored for activation
```

### Alternative explanation not dominant (deterministic)

When evaluating activation for primary misconception `P`:

```text
alternativeExplanationDominant = true iff there exists alternative E in
  P.alternativeExplanations (taxonomy) OR competing pattern matches on the
  same recent window such that:

  weightedMatchingCount(E) > weightedMatchingCount(P)
  OR (
    weightedMatchingCount(E) == weightedMatchingCount(P)
    AND confidence(E) >= confidence(P)
  )

where weightedMatchingCount uses the evidence-expiry weights above
over the last 45 days of matching incorrect attempts.
```

If `alternativeExplanationDominant`:

- store both candidates on the diagnostic factor
- remain `UNCONFIRMED` (or serve discrimination only)
- **do not** enter `TARGETING` / emit `TARGET_MISCONCEPTION`

Weak evidence guard (unchanged):

```text
misconceptionConfidence < 0.50 → do not emit TARGET_MISCONCEPTION
```

---

## 3. Confidence calibration

Over window of last `N=8` answered attempts with non-null self-rating:

```text
overconfident_score = count(confidence >= 4 AND INCORRECT) / N
underconfident_score = count(confidence <= 2 AND CORRECT) / N

if overconfident_score >= 0.375 → possibly_overconfident
else if underconfident_score >= 0.375 → possibly_underconfident
else → reasonably_calibrated
```

Never set from a single attempt. Insufficient window (`< 4` rated) → `unknown`.

**Unchanged from MVP 1.0.**

---

## 4. Hint dependence

```text
hintDependence = sum(independencePenalty) / eligibleQuestions

independencePenalty:
  no hint = 0
  level 1 = 0.33
  level 2 = 0.66
  level 3 = 1.0

eligibleQuestions = questions in last 15 attempts where hints were available
```

Track trend vs previous session mean: `increasing` | `stable` | `decreasing` (delta ±0.05).

**Unchanged from MVP 1.0.**

---

## 5. Revision need signal

Emit signal (not queue write) when any:

```text
mastery < 0.40 AND evidenceCount >= 3
OR mastery dropped by >= 0.15 since last session on concept
OR daysSinceSuccessfulPractice >= 5 AND mastery < 0.80
OR retentionEstimate < 0.55 AND retention evidence sufficient   // NEW in v2
```

---

## 6. Misconception remediation state machine (`decision-rules-v2`)

States (unchanged):

```text
UNCONFIRMED
TARGETING
EXPLANATION_REQUIRED
RETESTING
RESOLVED
STILL_ACTIVE
```

### Transitions

```text
UNCONFIRMED
  + matchingCount reaches taxonomy minimum (typically 2)
  + confidence >= activationConfidence
  + NOT alternativeExplanationDominant
  → TARGETING
  (targetedAttemptCount = 0)

TARGETING
  + serve discrimination then support (maxTargetedAttemptsBeforeExplanation = 2)
  + targeted question INCORRECT
  → if targetedAttemptCount >= 2: EXPLANATION_REQUIRED
     else remain TARGETING

TARGETING
  + targeted question CORRECT with highestHintLevel <= 1
  → if consecutiveCorrectTargeted >= 2: RESOLVED
     else remain TARGETING

EXPLANATION_REQUIRED
  + EXPLANATION_VIEWED
  → RETESTING

RETESTING
  + CORRECT and highestHintLevel <= 1
  → RESOLVED

RETESTING
  + INCORRECT
  → if explanation_cycle_count < maxExplanationCycles (2): EXPLANATION_REQUIRED
     else STILL_ACTIVE

STILL_ACTIVE
  → prefer REVIEW_PREREQUISITE if prereq mastery < 0.5
  → else DECREASE_DIFFICULTY / CONCEPT_REINFORCEMENT
  → do not infinite TARGETING loop
```

---

## 7. Retention estimate (`retention-rules-v2`)

Purpose: estimate likelihood that a concept remains recallable after delay. **Separate from mastery.**

```text
daysSinceSuccess = days since last independent correct answer for concept
                   (independent = CORRECT AND highestHintLevel <= 1)
mastery = latest masteryScore.value
revisionBoost = min(0.20, 0.05 × completedRevisionsLast14Days)
forgettingPenalty = min(0.45, 0.04 × daysSinceSuccess)

retentionEstimate = clamp(mastery + revisionBoost - forgettingPenalty, 0, 1)
```

Minimum evidence before emitting a retention factor:

```text
at least 2 independent attempts on the concept
AND at least 1 CORRECT independent attempt
else → abstain (RETENTION_ESTIMATE_INSUFFICIENT); no RETENTION_REVIEW from this factor
```

Rules:

```text
retentionEstimate < 0.55 → propose RETENTION_REVIEW (normal priority)
retentionEstimate < 0.40 → high-priority revision (raise retentionRisk term)
```

Worked example (golden R01):

```text
mastery = 0.70
daysSinceSuccess = 7
completedRevisionsLast14Days = 0
revisionBoost = 0
forgettingPenalty = min(0.45, 0.04 × 7) = 0.28
retentionEstimate = clamp(0.70 + 0 − 0.28, 0, 1) = 0.42
→ RETENTION_REVIEW eligible (0.42 < 0.55); not high-priority (< 0.40)
```

---

## 8. Learning velocity (`diagnostic-rules-v2`)

```text
velocity = (masteryNow - masterySevenDaysAgo) / max(1, eligibleAttempts)
```

`eligibleAttempts` = counted mastery attempts on that concept in the same 7-day window.

Interpretation:

```text
velocity >= +0.03 → improving
-0.02 <= velocity < +0.03 → steady
velocity < -0.02 → needs_support
```

Do not show velocity labels to students. Minimum 3 eligible attempts or abstain as `unknown`.

---

## 9. Error recovery

```text
errorRecoveryRate =
  correctAfterFeedbackAttempts / feedbackOpportunities
```

Feedback opportunity:

- incorrect attempt followed by hint, explanation, or targeted retest
- next comparable attempt occurs within 7 days

Decision use:

```text
errorRecoveryRate < 0.35 AND misconception active → prefer STEP_BY_STEP explanation
errorRecoveryRate >= 0.65 → shorter hint first (SHOW_HINT before full explanation when allowed)
```

Minimum `feedbackOpportunities = 3` else abstain.

---

## 10. Explanation effectiveness

```text
explanationEffective =
  EXPLANATION_VIEWED
  AND next comparable attempt is CORRECT
  AND highestHintLevel <= 1
```

Store per explanation template:

```text
effectivenessScore = effectiveCount / opportunityCount
minimum opportunityCount = 5 before ranking effect
```

---

## 11. Engagement pattern / fatigue

Engagement is behavioral only. It is not a clinical attention or motivation diagnosis.

```text
idleSpike = idleTimeMs > 45_000
longHesitation = timeToFirstResponseMs > 30_000
fatigueRisk =
  sessionMinutes >= 12
  OR (recentIncorrectStreak >= 3 AND averageTimeMs increasing by >= 50%)
  OR idleSpikeCount >= 2 in this session
```

If `fatigueRisk` and session has not already emitted a break this session:

```text
uiAction: SUGGEST_BREAK
learningIntent: BREAK_FOR_FATIGUE
parameters.breakMinutes: 3 (default)
```

---

## 12. Decision priority (`decision-rules-v2`)

Evaluate in order; **first match wins**.

### Hard stop vs soft break (resolved)

| Condition | Priority | Decision |
|---|---|---|
| `sessionMinutes >= 15` OR `questionCount >= sessionLimit` | **1 — always wins** | `END_SESSION` |
| `fatigueRisk` AND break not yet suggested this session AND `sessionMinutes < 15` | **2** | `SUGGEST_BREAK` + `BREAK_FOR_FATIGUE` |

```text
sessionLimit default = 12 (adaptive) / 12 (baseline)
```

If both would apply (e.g. minute 15 with fatigue), emit **`END_SESSION` only** — never `SUGGEST_BREAK` after the hard stop threshold.

### Full ordered list

1. **Safety / session end**  
   `sessionMinutes >= 15` OR `questionCount >= sessionLimit` → `uiAction: END_SESSION`

2. **Fatigue break** (soft)  
   `fatigueRisk` AND no prior break suggestion this session AND `sessionMinutes < 15`  
   → `SUGGEST_BREAK` + `BREAK_FOR_FATIGUE`

3. **Post-explanation re-test**  
   Last content was explanation and remediation in `RETESTING` → `SHOW_QUESTION` + `RETEST_AFTER_EXPLANATION`

4. **Explanation required**  
   State `EXPLANATION_REQUIRED` → `SHOW_EXPLANATION` + learningIntent from remediation (`TARGET_MISCONCEPTION` path) with `contentStyle.explanationStyle: STEP_BY_STEP`

5. **Due revision / retention review**  
   High-priority `PENDING` item due → `SHOW_QUESTION` + `EXECUTE_DUE_REVISION` or `RETENTION_REVIEW` (as tagged on the queue item)

6. **Misconception targeting**  
   State `TARGETING` → `SHOW_QUESTION` + `TARGET_MISCONCEPTION`

7. **Prerequisite review**  
   `2+ recent incorrect` AND `mastery < 0.30` AND prerequisite evidence weak AND bank has prereq items → `SHOW_QUESTION` + `REVIEW_PREREQUISITE`

8. **Transfer check**  
   `masteryScore.value >= concept.masteryThreshold`  
   AND `evidenceCount >= concept.minimumEvidence`  
   AND no active misconception with confidence `> 0.6`  
   AND APPROVED `questionIntent: TRANSFER_CHECK` item available  
   → `SHOW_QUESTION` + `TRANSFER_CHECK`

9. **Difficulty adaptation**  
   - `2+ correct`, low hints → `INCREASE_DIFFICULTY` (diff +1, max 5)  
   - `2+ incorrect` → `DECREASE_DIFFICULTY` (diff −1, min 1)  
   - mixed → `STANDARD_PRACTICE`

10. **Normal practice** → `STANDARD_PRACTICE`

### Weak evidence

If diagnostic confidence for misconception `< 0.5`, **do not** enter TARGETING; prefer `STANDARD_PRACTICE` or discrimination only as `UNCONFIRMED` observation.

### Concept advancement

Only when advancementCriteria in Content Spec met; then set `parameters.conceptId` to next core concept; difficulty resets to 2 (or 1 if prior struggle).

---

## 13. Baseline assessment

**Carried from MVP 1.0** with no intentional deltas for MVP 2.0 freeze.

```text
sessionMode = BASELINE
questionCount target = 12
hints available = yes (recorded; independence still applies)
skips allowed = yes (no mastery evidence; may extend by 1 slot max twice)
confidence prompt = after submit, optional (null allowed)
adaptive difficulty = NO — fixed blueprint order
```

### Blueprint (slot order)

```text
1–2   P1_INTEGER_ADD_SUB
3–4   P3_VARIABLES_CONSTANTS or P4_SIMPLE_EXPRESSIONS (alternate)
5–6   P5_EQUALITY_BALANCE
7–9   C1/C2/C3 one-step mix (one each preferred)
10–12 C5_TWO_STEP_EQUATIONS (or C2/C4 if C5 bank thin)
```

Exact question IDs chosen by Question Generator from `questionIntent: BASELINE_ASSESSMENT` pool.

### Stopping

- Blueprint complete → switch session (or next session) to `ADAPTIVE_PRACTICE`
- Student ends early → keep partial mastery updates; mark baseline `incomplete`
- After baseline: student session summary only; parent summary optional same day

### Effect

Baseline mainly moves mastery from prior `0.50` and raises mastery confidence; does **not** permanently classify the learner.

**MVP 2.0 note:** Retention estimates are not required during baseline; compute after sufficient independent evidence exists post-baseline.

---

## 14. Recommendation rules (`recommendation-rules-v2`)

On `SESSION_ENDED` and daily planner job:

```text
maxQuestionsPerDay = 10
maxConceptsPerDay = 3
maxTargetedMisconceptionQuestions = 3
```

### Priority formula

```text
priority =
  0.30 × weakness
  + 0.25 × misconceptionSeverity
  + 0.20 × retentionRisk
  + 0.15 × prereqImportance
  + 0.10 × parentGoalBoost
```

All terms are in `[0, 1]`.

### Term definitions (deterministic)

| Term | Definition |
|---|---|
| `weakness` | If `evidenceCount >= concept.minimumEvidence`: `1 - masteryScore.value`; else `0` (abstain — do not treat thin evidence as weakness). |
| `misconceptionSeverity` | If remediation state ∈ `{TARGETING, EXPLANATION_REQUIRED, RETESTING, STILL_ACTIVE}`: `misconceptionConfidence`; else `0`. |
| `retentionRisk` | If retention factor exists: `1 - retentionEstimate`; else `0`. If `retentionEstimate < 0.40`, treat as high priority for queue ordering (still use numeric `1 - estimate` in the formula). |
| `prereqImportance` | `1.0` if a dependent active concept has mastery gap and this prereq has `mastery < 0.50` with `evidenceCount >= 2`; `0.5` if prereq mastery `< 0.70` under the same dependent gap; else `0`. |
| `parentGoalBoost` | `1.0` if an active parent goal (see Personalization) matches `conceptId` or misconception; else `0.0`. Default when no goals configured: `0`. |

Weekly plan (parent-facing scheduling, not rigid student queue):

```text
include:
  2 retention concepts (lowest retentionEstimate among eligible)
  1 active misconception path
  1 transfer check when eligible
```

---

## 15. Abstention

Any engine must abstain if:

```text
confidence < requiredThreshold
OR minimumEvidence not met
OR content is not APPROVED
OR alternativeExplanationDominant for a targeting decision
```

Abstention behavior:

- Decision chooses `STANDARD_PRACTICE` (or safe `END_SESSION` if no eligible content)
- Parent report says "still gathering evidence"
- No internal labels shown to student
