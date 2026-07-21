# Language and Voice

> Source of truth for **child-safe** and **parent-letter** copy. Visual reference: `testUI-claude/DESIGN.md`.

## Absolute rules

**Students never see:**

- Mastery percentages or decimal scores  
- Raw concept IDs (`C2_ONE_STEP_SUBTRACTION`, `P1_INTEGER_ADD_SUB`)  
- Misconception codes (`SIGN_HANDLING`)  
- Words like diagnosed, weak, fatigue, clinical labels  
- Engine jargon (threshold, retentionEstimate, diagnostic)

**Students do see:**

| Moment | Voice |
|---|---|
| Question | Plain topic (“Balancing both sides”), equation on worked line, `x =`, **Check** |
| Wrong | **Not quite** + gentle mark |
| Right | **Correct** + check |
| Confidence | **How did that one feel?** → I was sure / Fairly sure / I guessed |
| Explanation | **Let’s look at this together** → steps → **Got it — next question** |
| Break | Calm message, no shame |
| Session end | **Good work today** + simple counts + human topic names |

**Parents see letter sections:**

- What happened  
- What it might mean  
- What to do next / The plan for next week  
- Explicit uncertainty note  

## Type-safe choke point

Engineering must use branded types:

- `StudentSafeText` — only from `toStudentSafeText()` / `childSafeReasoning()`  
- `ParentSafeText` — only from `toParentSafeText()` / `humanizeParentCopy()`  

Student-facing components should accept `StudentSafeText`, not raw `string`, so forgotten humanizers fail at compile time.

Forbidden terms live in `@cogna/shared` (`voice/forbidden-terms`) and are shared by:

- Runtime guards  
- ContentVerifier voice layer  
- Language regression tests  

## Concept labels (examples)

Map IDs → human phrases before any UI render. Prefer student short labels in practice; longer parent labels in letters.

| Concept ID | Student | Parent |
|---|---|---|
| C1_ONE_STEP_ADDITION | Adding on both sides | One-step addition equations |
| C2_ONE_STEP_SUBTRACTION | Plus and minus in equations | One-step subtraction equations |
| C5_TWO_STEP_EQUATIONS | Two-step equations | Two-step equations |

Never dump the left column on screen.
