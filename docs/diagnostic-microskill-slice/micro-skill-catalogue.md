# Micro-skill diagnostic — catalogue, layers, and question structure

Reference document for the micro-skill / step-level diagnostic model (source: `COGNA_0.1_Claude_Code_Master_Prompt.md`, Work Order 02 — Diagnostic Question Factory, Work Order 03 — Adaptive Diagnostic System). This is a specification document — nothing in code reads it. It exists so the full-catalogue picture and the tagging/decomposition methodology are written down before wider rollout.

It covers three things:
1. The seven-layer model that every piece of evidence is interpreted through.
2. The full 73-skill catalogue: how topics break into skill groups break into micro-skills.
3. How an individual question is tagged and decomposed into steps, worked through a full example.

> **Scope note:** this document describes the complete target model (73 skills, 5 topics). The current implementation slice only builds real verifier code and content for **9** of these 73 skills (Topics 1–2, negative distribution in linear equations). The other 64 are catalogued here for planning purposes but have no runtime code yet — see `MicroSkillDefinition.status` in the implementation, which marks them `DEFINED_NOT_EXECUTABLE`.

---

## 1. The seven-layer model

Every piece of evidence the system collects is interpreted through seven layers. They are not seven screens or seven independent scores — layers 1–4 answer *"what skill are we talking about,"* and that part is fixed once the catalogue is written. Layers 5–7 are what changes every time a student does another question: a new context tag, a new line of work, and an updated verification status get attached to the same skill.

| # | Layer | What it answers | Changes... |
|---|---|---|---|
| 1 | Domain | The whole subject | Never (fixed: Algebra) |
| 2 | Topic | Which of the 5 topics | Never (fixed per skill) |
| 3 | Competency family | Which named cluster of skills | Never (fixed per skill) |
| 4 | Micro-skill | The smallest thing that gets a persistent, continuing score | Never (fixed per skill — this is where the "skill tree" stops branching) |
| 5 | Context modifiers | The *conditions* this attempt was tested under (sign, fraction, with/without help, etc.) | Every attempt — same skill, new tag |
| 6 | Step-level evidence | What the student *literally typed*, this one time | Every attempt — a new raw record |
| 7 | Learning verification | Whether an error got fixed, and whether the fix transferred and lasted | Over time — same skill, evolving status |

### Worked example across all seven layers

Skill: "expand a bracket with a negative multiplier" (`LIN_DISTRIBUTE_NEG`), from the canonical Arun scenario.

| Layer | Value |
|---|---|
| 1. Domain | Algebra |
| 2. Topic | Brackets, signed numbers & fractions |
| 3. Competency family | Distributing & clearing |
| 4. Micro-skill | Expand a bracket with a negative multiplier (`LIN_DISTRIBUTE_NEG`) |
| 5. Context modifiers | Negative outer multiplier, mixed signs, no fractions, attempted independently (no hint used yet) |
| 6. Step evidence | Given `-2(x-5)+3=11`, wrote `-2x-10+3=11` — the `-10` should be `+10` |
| 7. Learning verification | 1st attempt: failed. 2nd, structurally different probe (`-3(y-4)`): failed the same way → pattern confirmed, not a slip. Taught it. Fresh transfer equation (`-4(z-2)+3=19`): solved independently → "repaired, retention check pending" |

**Why it stops at layer 4, not deeper:** a skill like `LIN_DISTRIBUTE_NEG` could in principle be split further ("distribute to the first term," "distribute to the second term," ...) but that stops being something you can teach or evidence independently — it's the same one operation. The boundary for "is this a micro-skill" is: *can COGNA gather focused evidence about it and teach it directly, on its own, in one sitting?* If yes, it's a leaf. If a skill only ever shows up bundled inside a bigger one and never independently, it isn't a separate node.

**Why layers 5–7 aren't "more skills":** `LIN_DISTRIBUTE_NEG` is one box in the tree. Every time a student encounters it, the system doesn't create a new skill — it attaches a context tag (layer 5), a raw record of what they wrote (layer 6), and updates one running verification status (layer 7). The tree in section 2 below is entirely layers 1–4; nothing there changes attempt-to-attempt.

---

## 2. Topic and micro-skill organization (73 skills total)

`Domain: Algebra → 5 Topics → named skill groups (competency families) → micro-skills`

Topic membership and the 73 skill IDs are canonical, reconciled from Master Prompt §6.6 (tables A–E) and Work Order 02 §5.1–5.5's per-topic quota tables (which validate the same grouping via exact template counts). **Skill-group names below are an organizing label** — the source documents give illustrative family names but don't lock down one fixed list, so these are a faithful, sensible grouping of the canonical skill IDs, not verbatim from the source.

### Topic 1 — Linear Equations (19 skills)

- **Equality & inverse operations**: Understand equality (`LIN_EQUALITY_MEANING`) · Preserve equivalence while transforming (`LIN_EQUIV_TRANSFORM`) · Add/subtract both sides (`LIN_ADD_BOTH_SIDES`) · Multiply/divide both sides (`LIN_MUL_BOTH_SIDES`) · Remove a constant (`LIN_REMOVE_CONSTANT`) · Remove a coefficient (`LIN_REMOVE_COEFFICIENT`) · Recognise when isolated (`LIN_RECOGNISE_ISOLATED`)
- **Simplifying before isolating**: Combine like terms (`LIN_COMBINE_LIKE`) · Simplify both sides (`LIN_SIMPLIFY_BOTH_SIDES`) · Collect variables on one side (`LIN_VARIABLES_ONE_SIDE`) · Collect constants on the other side (`LIN_CONSTANTS_OTHER_SIDE`)
- **Solving different forms**: One-step equation (`LIN_SOLVE_ONE_STEP`) · Two-step equation (`LIN_SOLVE_TWO_STEP`) · Variable on both sides (`LIN_SOLVE_VARIABLE_BOTH`)
- **Checking & applying**: Check by substitution (`LIN_CHECK_SOLUTION`) · Model a word problem (`LIN_MODEL_WORD`) · Interpret the result (`LIN_INTERPRET_RESULT`)
- **Borrowed foundation skills**: Substitute a value (`ALG_SUBSTITUTE`) · Simplify a numeric expression (`ALG_SIMPLIFY_NUMERIC`)

### Topic 2 — Brackets, Signed Numbers & Fractions (10 skills)

- **Signed-number arithmetic**: Add/subtract signed numbers (`FND_SIGN_ADD_SUB`) · Multiply/divide signed numbers (`FND_SIGN_MUL_DIV`)
- **Fractions & order**: Create equivalent fractions (`FND_FRACTION_EQUIV`) · Perform fraction operations (`FND_FRACTION_OPS`) · Apply order of operations (`FND_ORDER_OPS`)
- **Distributing & clearing**: Distribute a positive multiplier (`LIN_DISTRIBUTE_POS`) · Distribute a negative multiplier (`LIN_DISTRIBUTE_NEG`) · Clear fractions validly (`LIN_CLEAR_FRACTIONS`) · Solve an equation with brackets (`LIN_SOLVE_BRACKETS`) · Solve an equation with fractions (`LIN_SOLVE_FRACTIONS`)

### Topic 3 — Algebraic Expressions & Identities (13 skills)

- **Reading algebra**: Use the exponent-product rule (`FND_EXPONENT_PRODUCT`) · Identify variables/terms/coefficients (`ALG_IDENTIFY_STRUCTURE`) · Distinguish expression vs. equation (`ALG_DISTINGUISH_EXPR_EQ`) · Decide if terms are alike (`ALG_LIKE_TERMS`)
- **Working with expressions**: Add/subtract polynomials (`EXP_ADD_SUB_POLY`) · Multiply monomials (`EXP_MULT_MONOMIAL`) · Expand one bracket (`EXP_EXPAND_SINGLE`) · Expand two binomials (`EXP_EXPAND_BINOMIALS`)
- **Recognising identities**: Use `(a+b)²` (`ID_SQUARE_SUM`) · Use `(a-b)²` (`ID_SQUARE_DIFF`) · Use `(a+b)(a-b)=a²-b²` (`ID_DIFF_SQUARES`) · Verify an expansion (`ID_VERIFY_EXPANSION`) · Recognise an identity in reverse, for factorising (`ID_REVERSE_PATTERN`)

### Topic 4 — Factorisation (22 skills — the largest topic, deliberately: it bridges expressions and quadratics)

- **Common factors**: Find numeric GCD (`FND_GCD_NUMERIC`) · Find common variable exponent (`FND_MIN_EXP_COMMON`) · Understand what factorising means (`FAC_MEANING`) · Choose a method from structure (`FAC_CHOOSE_METHOD`) · Extract numeric GCF (`FAC_GCF_NUMERIC`) · Extract variable GCF (`FAC_GCF_VARIABLE`) · Divide terms by the factor (`FAC_DIVIDE_TERMS`) · Write the full common-monomial form (`FAC_COMMON_MONOMIAL`)
- **Grouping**: Group terms (`FAC_GROUP_TERMS`) · Fix a group's sign (`FAC_GROUP_SIGN`) · Extract a common binomial (`FAC_COMMON_BINOMIAL`)
- **Identity-based factorisation**: Difference of squares (`FAC_DIFF_SQUARES`) · Perfect square, positive middle term (`FAC_PERFECT_SQUARE_PLUS`) · Perfect square, negative middle term (`FAC_PERFECT_SQUARE_MINUS`)
- **Trinomials**: Read signed a/b/c (`FAC_READ_ABC_SIGNS`) · Find a factor pair by product & sum (`FAC_PAIR_PRODUCT_SUM`) · Build monic factors, `x²+bx+c` (`FAC_MONIC_TRINOMIAL`) · Compute a×c (`FAC_COMPUTE_AC`) · Split the middle term (`FAC_SPLIT_MIDDLE`) · Group a non-monic trinomial (`FAC_NONMONIC_GROUP`)
- **Finishing & checking**: Continue until fully factorised (`FAC_FACTOR_FULLY`) · Verify by expanding back (`FAC_VERIFY_EXPAND`)

### Topic 5 — Simple Quadratics, solved by factorising (9 skills)

- **Recognising & preparing**: Recognise a quadratic (`QUAD_RECOGNISE`) · Rearrange to standard form (`QUAD_STANDARD_FORM`)
- **Factorising**: Factorise the quadratic expression (`QUAD_FACTOR_EXPRESSION`) — *bridges back down into Topic 4's skills; not separately re-taught*
- **Turning factors into roots**: Apply the zero-product rule (`QUAD_ZERO_PRODUCT`) · Set every factor to zero (`QUAD_CREATE_BRANCHES`) · Solve a unit-coefficient factor (`QUAD_SOLVE_UNIT_FACTOR`) · Solve a non-unit-coefficient factor (`QUAD_SOLVE_NONUNIT_FACTOR`) · Preserve every root (`QUAD_PRESERVE_ROOTS`) · Verify roots in the original equation (`QUAD_VERIFY_ROOTS`)

**Total: 19 + 10 + 13 + 22 + 9 = 73.**

### This slice's subset (9 of 73)

`LIN_SOLVE_TWO_STEP`, `LIN_SOLVE_VARIABLE_BOTH`, `LIN_COMBINE_LIKE`, `LIN_REMOVE_CONSTANT`, `LIN_REMOVE_COEFFICIENT`, `LIN_CHECK_SOLUTION` (Topic 1) + `LIN_DISTRIBUTE_POS`, `LIN_DISTRIBUTE_NEG`, `FND_SIGN_MUL_DIV` (Topic 2) — a thin vertical column through Topics 1–2 only, matching the canonical Arun negative-distribution scenario end to end. Topics 3–5 (64 skills) are catalogued above but have no verifier or content yet.

---

## 3. How a question is structured, tagged, and decomposed

A question is never shown to a student as a bare prompt. Before it can be used, it must declare, in order:

1. **Domain / Topic / Competency family** — where it lives in the tree above.
2. **Primary skill** — the one skill this item is mainly selected to test.
3. **Secondary skills** — other skills genuinely isolated by a visible step.
4. **Prerequisite skills** — needed to complete the question, but *not* automatically scored just because the final answer is right or wrong.
5. **Incidental skills** — present in the surface form but not a legitimate reason to update any score.
6. **Step-to-skill decomposition** — every meaningful line of the accepted solution, tagged with its own skill.
7. **Possible misconception codes** — only the errors this specific item can actually expose.
8. **Context modifiers** — sign pattern, fraction/no fraction, monic/non-monic, rearranged/standard form, etc.

The core rule behind all of this: **a wrong final answer must not poison every skill the question touches.** Negative evidence attaches only to the first step that actually went wrong; everything before it stays positive, and everything after it stays unknown (not automatically wrong).

### Worked example: `4x² + 20x + 100 = 90`

**Tagging (done once, at authoring time, from the surface structure — before anyone solves it):**

| Tag | Value | Why |
|---|---|---|
| Topic | `QUADRATICS_BY_FACTORIZATION` | has an x² term, meant to be solved by factoring (not the formula — out of this catalogue's scope) |
| Context modifiers | non-monic (a=4), not yet in standard form (RHS isn't 0), all-positive signs | describes this specific instance |
| Primary / secondary / prerequisite skills | determined by what the accepted solution path actually requires — see decomposition below, not just "it's a quadratic" |

**Step-to-skill decomposition (the accepted solution path, line by line):**

| Step | Line | Skill tested | Prerequisite skills used |
|---|---|---|---|
| 1 | `4x² + 20x + 100 = 90` → `4x² + 20x + 10 = 0` | Rearrange into standard form (`QUAD_STANDARD_FORM`) | Move-a-constant across the equals sign |
| 2 | `4x² + 20x + 10 = 0` → `2x² + 10x + 5 = 0` | Extract the numeric GCF (`FAC_GCF_NUMERIC`) | Find greatest common factor (`FND_GCD_NUMERIC`) |
| 3 | Read `a=2, b=10, c=5` | Read signed a, b, c (`FAC_READ_ABC_SIGNS`) | — |
| 4 | Compute `a×c = 10` | Compute a×c (`FAC_COMPUTE_AC`) | — |
| 5 | Find two numbers, product 10, sum 10 | Find the factor pair (`FAC_PAIR_PRODUCT_SUM`) | Signed multiplication/addition |

**Where it breaks:** pairs multiplying to 10 are (1,10) — sum 11 — and (2,5) — sum 7. **No integer pair sums to 10.** `2x²+10x+5=0` has discriminant `10²-4·2·5 = 60`, not a perfect square — it doesn't factor over the integers/rationals at all.

**What the system does about it:** this is exactly the rule from Work Order 02 §9 — *"no quadratic that cannot be factorised over the intended integer/rational domain."* A question generator producing this exact number combination would have it **rejected automatically at content-validation time**, before it ever reaches the question bank. No student ever sees an unsolvable "solve by factoring" question — the pipeline either discards that generated instance or the template author picks different numbers. (For reference, changing the RHS to `196` instead of `90` gives `x²+5x-24=0 → (x+8)(x-3)=0`, which factors cleanly.)

**If a student had gotten step 2 right but stumbled on step 5** (hypothetically, with solvable numbers): the system would keep steps 1–2 as positive evidence for `QUAD_STANDARD_FORM` and `FAC_GCF_NUMERIC`, attach negative evidence only to `FAC_PAIR_PRODUCT_SUM`, and leave every skill after step 5 (zero-product, solving branches, etc.) as `UNKNOWN` — not wrong, just not yet observed.
