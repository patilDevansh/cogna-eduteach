# MVP 3.0 — Rules

> **Delta from MVP 2.0:** Carry all `*-v2` formulas. Add `experiment-rules-v1`, `candidate-score-rules-v1`, and `content-validation-rules-v1`. Decision baseline remains deterministic; scoring is experiment-gated.

Versions:

```text
mastery-formula-v2          (carry)
diagnostic-rules-v2         (carry)
decision-rules-v2           (control baseline; still valid)
decision-rules-v3           (baseline + experiment hook points)
retention-rules-v2          (carry)
recommendation-rules-v2     (carry)
experiment-rules-v1         (NEW)
candidate-score-rules-v1    (NEW)
content-draft-rules-v1      (NEW)
content-validation-rules-v1 (NEW)
```

---

## 1–7. Carry-forward (MVP 2.0)

Mastery, misconception confidence, calibration, hint dependence, remediation state machine, baseline policy, retention estimate, learning velocity, error recovery, explanation effectiveness, engagement/fatigue, and recommendation terms are **unchanged** from [`docs/mvp-2.0/README_RULES.md`](../mvp-2.0/README_RULES.md) unless an experiment arm explicitly documents a delta.

**Mastery calendar decay** remains forbidden under `mastery-formula-v2`. Any future decay requires `mastery-formula-v3` + goldens (see SKIPPED / MVP 2.0 care).

---

## 8. Decision priority (`decision-rules-v3`)

Same priority as MVP 2.0, with an experiment insertion point **after** hard gates:

```text
1. END_SESSION (time / question limit)          — never overridden by scorer
2. SUGGEST_BREAK / BREAK_FOR_FATIGUE            — never overridden by scorer
3. EXECUTE_DUE_REVISION / RETENTION_REVIEW      — hard due items
4. TARGET_MISCONCEPTION / REVIEW_PREREQUISITE   — remediation machine
5. RETEST_AFTER_EXPLANATION
6. Experiment branch (if assigned to scored arm):
     a. Build legal candidate set from rules 3–5 + standard practice/difficulty
     b. CandidateScorer.rank
     c. Select top legal candidate
7. Else control: STANDARD_PRACTICE / INCREASE / DECREASE / TRANSFER_CHECK / CONCEPT_REINFORCEMENT
```

Hard gates 1–2 always win. Scorer cannot demote them.

---

## 9. Experiment assignment (`experiment-rules-v1`)

### Sticky hash assignment

```text
armIndex = hash(studentId + ":" + experimentKey) mod 10000
cumulative = 0
for each arm in definition.arms ordered:
  cumulative += floor(allocation[arm] * 10000)
  if armIndex < cumulative: assign arm; break
```

- Assignment written once; subsequent sessions reuse row.
- Ineligible students stay on control behavior without an assignment row (or with `arm=control` if experiment requires logging — prefer **no row** until eligible).
- Pausing an experiment: new assignments stop; existing sticky arms continue until `COMPLETED` + cutover policy.

### Eligibility (default Linear Equations experiment)

```text
unitId = linear-equations-one-variable
minSessionsCompleted >= 1
excludeBaselineOnly = true  // must have finished baseline or warm-start
```

---

## 10. Candidate scoring (`candidate-score-rules-v1`)

### Legal candidate generation

From current profile + session state, Decision Engine emits 1–N legal `CandidateAction`s using the same gates as control (difficulty ±1, APPROVED content available, remediation legality, etc.).

### Heuristic score (v1 — deterministic, not learned)

```text
score =
  0.30 × masteryGapTerm        // prefer concepts below threshold when practicing
+ 0.25 × retentionRiskTerm     // 1 - retentionEstimate when due-ish
+ 0.20 × misconceptionSeverity // active misconception confidence
+ 0.15 × explanationNeedTerm   // low explanationEffectiveness → prefer SHOW_EXPLANATION candidate if legal
+ 0.10 × explorationTerm       // mild preference for unseen difficulty within ±1

Each term clamped to [0, 1] before weighting.
```

**Weight rationale (v1):**

The formula balances competing priorities:

- **Mastery gap (0.30)** — Largest weight reflects the primary goal of bringing below-threshold concepts to threshold. Personalization begins with unmastered material.
- **Retention risk (0.25)** — Second-largest weight prioritizes preventing forgetting, a research-backed spacing benefit. Slightly lower than mastery because retention items have hard-gate protection at higher priority levels.
- **Misconception severity (0.20)** — Misconceptions impede future learning; third-highest weight ensures active misconceptions are addressed before exploration.
- **Explanation need (0.15)** — Low explanation effectiveness signals confusion; prefer teaching over drilling, but lower weight since remediation machine already handles severe cases.
- **Exploration (0.10)** — Mildly encourage unseen difficulties for coverage; lowest weight to avoid random sampling when stronger signals exist.

**Sensitivity note:** Weight changes of ±0.05 in top-3 terms materially affect selection in ties; any reweighting requires new shadow comparison before promotion. Exploration term may be removed entirely if analysis shows no coverage benefit.

### Tie-break

```text
higher score wins
if equal: prefer control policy's default intent order
if still equal: lexicographic learningIntent + conceptId
```

### Shadow mode

Ops may run scorer without applying selection (`shadow=true`). Log `CANDIDATE_SCORED`; Decision Engine still uses control.

---

## 11. Content validation (`content-validation-rules-v1`)

Before `PENDING_REVIEW`:

```text
PASS all:
  - schema valid (question / explanation shape)
  - conceptId in frozen Linear Equations catalog
  - difficulty in 1..5
  - acceptedAnswers non-empty for QUESTION
  - programmatic answer check OR symbolic check passes for numeric stems
  - misconception tags ⊆ frozen taxonomy
  - no clinical / unsafe language patterns (deny-list)
  - source != live-to-student

FAIL → VALIDATION_FAILED; never PENDING_REVIEW
```

LLM math that fails validation **must not** be human-rubber-stamped without fixing the math. Reviewers may edit payload then re-validate.

---

## 12. Content draft promotion (`content-draft-rules-v1`)

```text
DRAFT → VALIDATING → VALIDATED → PENDING_REVIEW → APPROVED_PROMOTED
                              ↘ VALIDATION_FAILED
                 PENDING_REVIEW → REJECTED
```

Promotion copies payload into the question/explanation bank with `reviewStatus=APPROVED` and links `draftOriginId` for analytics.
