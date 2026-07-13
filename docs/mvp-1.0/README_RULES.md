# MVP 1.0 — Rules

> Exact formulas, constants, and state machines. Versioned. Placeholders are intentional but **deterministic**.  
> Versions: `mastery-formula-v1`, `diagnostic-rules-v1`, `decision-rules-v1`.

---

## 1. Mastery (`mastery-formula-v1`)

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

---

## 2. Misconception confidence (`diagnostic-rules-v1`)

```text
On matching incorrect pattern:
  misconceptionConfidence = min(0.95, 0.35 + 0.15 × matchingCount)

On non-matching correct targeted item:
  misconceptionConfidence = max(0, misconceptionConfidence - 0.20)

Activation when:
  matchingCount >= minimumMatchingAttempts
  AND misconceptionConfidence >= activationConfidence
```

Alternative explanations always stored when activating.

### Evidence expiry

```text
Matching evidence older than 21 days contributes half weight.
Matching evidence older than 45 days ignored for activation (history retained).
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

---

## 5. Revision need signal

Emit signal (not queue write) when any:

```text
mastery < 0.40 AND evidenceCount >= 3
OR mastery dropped by >= 0.15 since last session on concept
OR daysSinceSuccessfulPractice >= 5 AND mastery < 0.80
```

---

## 6. Misconception remediation state machine (`decision-rules-v1`)

States:

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

## 7. Decision priority (`decision-rules-v1`)

Evaluate in order; first match wins:

1. **Safety / session end**  
   `sessionMinutes >= 15` OR `questionCount >= sessionLimit (default 12 adaptive / 12 baseline)` → `uiAction: END_SESSION`

2. **Post-explanation re-test**  
   Last content was explanation and remediation in `RETESTING` → `SHOW_QUESTION` + `RETEST_AFTER_EXPLANATION`

3. **Explanation required**  
   State `EXPLANATION_REQUIRED` → `SHOW_EXPLANATION` + `STEP_BY_STEP`

4. **Due revision**  
   High-priority `PENDING` item due → `SHOW_QUESTION` + `EXECUTE_DUE_REVISION`

5. **Misconception targeting**  
   State `TARGETING` → `SHOW_QUESTION` + `TARGET_MISCONCEPTION`  
   (not if state is EXPLANATION_REQUIRED / RETESTING / STILL_ACTIVE looping)

6. **Prerequisite review**  
   `2+ recent incorrect` AND `mastery < 0.30` AND prerequisite evidence weak AND bank has prereq items → `SHOW_QUESTION` + `REVIEW_PREREQUISITE`

7. **Difficulty adaptation**  
   - `2+ correct`, low hints → `INCREASE_DIFFICULTY` (diff +1, max 5)  
   - `2+ incorrect` → `DECREASE_DIFFICULTY` (diff −1, min 1)  
   - mixed → `STANDARD_PRACTICE`

8. **Normal practice** → `STANDARD_PRACTICE`

### Weak evidence

If diagnostic confidence for misconception `< 0.5`, **do not** enter TARGETING; prefer `STANDARD_PRACTICE` or discrimination only as `UNCONFIRMED` observation.

### Concept advancement

Only when advancementCriteria in Content Spec met; then set `parameters.conceptId` to next core concept; difficulty resets to 2 (or 1 if prior struggle).

---

## 8. Baseline assessment

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

---

## 9. Recommendation rules (`recommendation-rules-v1`)

On `SESSION_ENDED`:

```text
active misconception confidence > 0.6 → propose 3 targeted
mastery < 0.4 → propose reinforcement
prerequisite gap → propose prereq review
days since practice >= 5 → propose revision
cap: max 10 questions/day, ≤3 concepts, dedupe via Revision Service
```

Priority placeholder:

```text
0.35×weakness + 0.30×misconceptionSeverity + 0.20×timeFactor + 0.15×prereqImportance
```
