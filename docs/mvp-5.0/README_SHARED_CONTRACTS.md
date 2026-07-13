# MVP 5.0 — Shared Contracts

> **Delta from MVP 4.0:** Subject IDs, modality content styles, policy versions, modality outcomes. Core uiActions preserved.

## Version strings (proposed)

```ts
export const POLICY_RULES_V5 = "policy-rules-v5";
export const LEARNED_POLICY_V1 = "learned-policy-v1"; // only after promotion
export const MODALITY_RULES_V1 = "modality-rules-v1";
export const SUBJECT_GRAPH_RULES_V1 = "subject-graph-rules-v1";
export const SAFETY_EVAL_RULES_V1 = "safety-eval-rules-v1";
```

## UiAction (unchanged set)

```ts
type UiAction =
  | "SHOW_QUESTION"
  | "SHOW_EXPLANATION"
  | "SHOW_HINT"
  | "END_SESSION"
  | "SUGGEST_BREAK";
```

Modality is **not** a sixth uiAction. Use `contentStyle` / parameters:

```ts
type ModalityKind = "TEXT" | "ANIMATION" | "VIDEO" | "VOICE";

interface ContentStyle {
  questionFormat?: QuestionFormat;
  explanationStyle?: ExplanationStyle;
  modality?: ModalityKind; // NEW
}

interface DecisionParameters {
  // ... prior fields
  subjectId?: string;
  modalityAssetId?: string;
  policyVersion?: string;
  safetyEvalId?: string;
}
```

## Proposed intents (additive)

| Intent | Purpose |
|---|---|
| `SHOW_TEACHING_MODULE` | Pair with SHOW_EXPLANATION or SHOW_QUESTION + modality asset |
| `MODALITY_RETEST` | Check understanding after module |

Exact intent freeze deferred to Canonical promotion; do not emit in code while Draft.

## LearnedPolicyDecision meta

```ts
interface PolicyChoiceRecord {
  policyVersion: string;
  baselineDecision: LearningDecision;
  learnedDecision?: LearningDecision;
  selected: "baseline" | "learned";
  safetyGatePassed: boolean;
  shadow: boolean;
}
```

## ModalityOutcome

```ts
interface ModalityOutcome {
  id: string;
  studentId: string;
  assetId: string;
  modality: ModalityKind;
  completed: boolean;
  dwellMs: number;
  retestCorrect?: boolean;
  modelVersion: string;
}
```
