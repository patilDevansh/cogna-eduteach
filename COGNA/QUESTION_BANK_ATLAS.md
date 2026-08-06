# Question Bank Atlas

> Skimmable inventory for Linear Equations (Grade 8 CBSE-style). Manifest: `docs/mvp-2.0/content/question-bank/manifest.json`.

## Scale

- **Target:** ≥200 APPROVED  
- **Current bank:** ~302 APPROVED (45 base + generated programmatically; math verified)  
- **Status:** `approved-bank`

## Concept map (IDs → what kids practice)

| Concept ID | Parent-facing label | Role |
|---|---|---|
| P1_INTEGER_ADD_SUB | Adding and subtracting integers | Prerequisite |
| P2_NEGATIVE_OPS | Working with negatives | Prerequisite |
| P3_VARIABLES_CONSTANTS | Variables and constants | Prerequisite |
| P4_SIMPLE_EXPRESSIONS | Simple expressions | Prerequisite |
| P5_EQUALITY_BALANCE | Keeping equations balanced | Prerequisite |
| C1_ONE_STEP_ADDITION | One-step addition equations | Core |
| C2_ONE_STEP_SUBTRACTION | One-step subtraction equations | Core (sign patterns) |
| C3_ONE_STEP_MULTIPLICATION | One-step multiplication equations | Core |
| C4_ONE_STEP_DIVISION | One-step division equations | Core |
| C5_TWO_STEP_EQUATIONS | Two-step equations | Core |
| C6_SIMPLE_WORD_PROBLEMS | Word problems | Transfer |

## Sample stems (range)

- Compute: `12 + 9`  
- Compute: `14 + (-6)`  
- Solve: `x - 7 = 11`  
- Solve: `3x = 21`  
- Solve: `2x + 5 = 17`  
- In `3x + 5`, which is the variable?  
- True/false: you may add 5 to only one side of an equation and keep it true  

## Live generation vs bank

- Bank is the **always-safe** student content.  
- C-lite generates new **parameterized** variants of the same concept families after ContentVerifier.  
- Free-form LLM JSON is optional and shadow-gated.  

## How to validate

```bash
pnpm test:content
```
