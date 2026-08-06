# Top 5 critical trails — full expanded walkthroughs

**Purpose:** Owner-readable, line-by-line diagnostic trails for the five worst Why/evidence bugs from the 100-run batch.  
**Index:** [`TOP_5_CRITICAL.md`](./TOP_5_CRITICAL.md)  
**Sources:** run JSONs under `eval-ledgers/runs/` (exact filenames below).  
**Convention:** Every submitted line, every `nextQuestionWhy.reasoning`, every next question. Session-end Why with `nextItemKey: null` means the session closed (no further item).

---

## Run 1 — mix_014

**File:** `runs/run100_2026-08-05T07-02-39-863Z_mix_014_correct_correct_correct_wrong_twice_arun_sign_twice.json`  
**Scenario intent:** `entry=correct`, `varBoth=correct`, `main=correct`, `contrast=wrong_twice`, `transfer=arun_sign_twice`  
**Actual path:** ENTRY → MAIN (perfect) → CONTRAST (one wrong; intent said twice) → TRANSFER (one sign wrong)  
**Critical bug:** After a perfect MAIN (4/4 VALID), AI Why invents **“many wrong answers”** then routes to CONTRAST.

### Item 1 — `ENTRY_TWO_STEP`

**Prompt:** `Solve for x:  3x + 5 = 20`  
**Opening:** `3x + 5 = 20`

- Step: `3x + 5 = 20` → **`3x = 15`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `3x = 15` → **`x = 5`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG, so presenting the NEG_DIST_MAIN question will target this gap directly with a planned item not yet shown this session.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_MAIN` · **templateId:** `TPL_NEG_DISTRIBUTION`

**Next question fed:** `Solve for x:  -2(x - 5) + 3 = 11` / opening ` -2(x - 5) + 3 = 11`

### Item 2 — `NEG_DIST_MAIN`

**Prompt:** `Solve for x:  -2(x - 5) + 3 = 11`  
**Opening:** `-2(x - 5) + 3 = 11`

- Step: `-2(x - 5) + 3 = 11` → **`-2x + 10 + 3 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 10 + 3 = 11` → **`-2x + 13 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 13 = 11` → **`-2x = -2`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x = -2` → **`x = 1`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG with many wrong answers, so an item focused solely on expanding a negative distribution expression (NEG_DIST_CONTRAST) will directly target this gap before moving to more complex transfer problems.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_CONTRAST` · **templateId:** `TPL_NEG_DISTRIBUTION_BARE`
- **Owner note:** Trail has **zero** wrongs on MAIN. “many wrong answers” is invented.

**Next question fed:** `Expand:  -3(y - 4)` / opening `-3(y - 4)`

### Item 3 — `NEG_DIST_CONTRAST`

**Prompt:** `Expand:  -3(y - 4)`  
**Opening:** `-3(y - 4)`

- Step: `-3(y - 4)` → **`-3y - 12`** (`wrong`) → INVALID / DETERMINISTIC  
  - **firstInvalid:** `(-3)(-4) was evaluated as -12, but multiplying those two signs gives 12`  
  - **assist:** `RULE_PROMPT` — “The number outside the bracket multiplies every term inside it — including its sign. What is (-3) x (-4)? Two negatives multiplied together give a positive, so it is 12, not -12.”  
  - **Collector note:** Scenario said `wrong_twice`; only **one** wrong attempt was recorded before advance.

**When item completed → AI Why:**
- **reasoning:** “The student showed a likely gap in LIN_DISTRIBUTE_NEG by misapplying the sign rule for multiplying negatives, so giving a transfer check on negative distribution (TRANSFER_NEG_DIST) is most informative to confirm if the concept is now understood.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `TRANSFER_NEG_DIST` · **templateId:** `TPL_TRANSFER_NEG_DISTRIBUTION`
- **Owner note:** This Why **matches** the contrast error (sign product). Healthy.

**Next question fed:** `Solve for z:  -4(z - 2) + 3 = 19` / opening `-4(z - 2) + 3 = 19`

### Item 4 — `TRANSFER_NEG_DIST` (session end)

**Prompt:** `Solve for z:  -4(z - 2) + 3 = 19`  
**Opening:** `-4(z - 2) + 3 = 19`

- Step: `-4(z - 2) + 3 = 19` → **`-4z - 8 + 3 = 19`** (`wrong_sign_product`) → INVALID / DETERMINISTIC  
  - **firstInvalid:** `(-4)(-2) was evaluated as -8, but multiplying those two signs gives 8`  
  - **assist:** null  
  - **Collector note:** Scenario said `arun_sign_twice`; only **one** sign-wrong attempt recorded.

**When item completed → RULE Why (session close):**
- **reasoning:** `null`
- **source:** `RULE` · **origin:** null · **nextItemKey:** `null` · **nextEquationPrompt:** `null`

**Session status:** `COMPLETED`

---

## Run 2 — mix_015

**File:** `runs/run100_2026-08-05T07-02-53-704Z_mix_015_correct_correct_correct_wrong_twice_decline_twice.json`  
**Scenario intent:** `entry=correct`, `varBoth=correct`, `main=correct`, `contrast=wrong_twice`, `transfer=decline_twice`  
**Actual path:** ENTRY → MAIN (perfect) → CONTRAST (one wrong) → TRANSFER decline ×2  
**Critical bug:** After a perfect ENTRY (2/2 VALID, zero wrongs ever), AI Why invents **“many wrong answers”** then routes to MAIN.

### Item 1 — `ENTRY_TWO_STEP`

**Prompt:** `Solve for x:  3x + 5 = 20`  
**Opening:** `3x + 5 = 20`

- Step: `3x + 5 = 20` → **`3x = 15`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `3x = 15` → **`x = 5`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG with many wrong answers; presenting the planned NEG_DIST_MAIN question will directly target this gap and provide informative data on their understanding of distributing negatives in equations.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_MAIN` · **templateId:** `TPL_NEG_DISTRIBUTION`
- **Owner note:** Strongest early invent — **no wrongs exist yet** in the session.

**Next question fed:** `Solve for x:  -2(x - 5) + 3 = 11` / opening `-2(x - 5) + 3 = 11`

### Item 2 — `NEG_DIST_MAIN`

**Prompt:** `Solve for x:  -2(x - 5) + 3 = 11`  
**Opening:** `-2(x - 5) + 3 = 11`

- Step: `-2(x - 5) + 3 = 11` → **`-2x + 10 + 3 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 10 + 3 = 11` → **`-2x + 13 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 13 = 11` → **`-2x = -2`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x = -2` → **`x = 1`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG, so giving an expansion-only question (-3(y - 4)) will directly target and clarify this gap before moving to more complex problems.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_CONTRAST` · **templateId:** `TPL_NEG_DISTRIBUTION_BARE`
- **Owner note:** False “likely gap” after perfect MAIN (boilerplate); destination isolate-expand is pedagogically defensible.

**Next question fed:** `Expand:  -3(y - 4)` / opening `-3(y - 4)`

### Item 3 — `NEG_DIST_CONTRAST`

**Prompt:** `Expand:  -3(y - 4)`  
**Opening:** `-3(y - 4)`

- Step: `-3(y - 4)` → **`-3y - 12`** (`wrong`) → INVALID / DETERMINISTIC  
  - **firstInvalid:** `(-3)(-4) was evaluated as -12, but multiplying those two signs gives 12`  
  - **assist:** `RULE_PROMPT` — “The number outside the bracket multiplies every term inside it — including its sign. What is (-3) x (-4)? Two negatives multiplied together give a positive, so it is 12, not -12.”  
  - **Collector note:** Scenario said `wrong_twice`; only one wrong recorded.

**When item completed → AI Why:**
- **reasoning:** “The student showed a likely gap in LIN_DISTRIBUTE_NEG by misapplying sign multiplication, so the next question should be a transfer check on negative distribution to confirm if the concept is now understood.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `TRANSFER_NEG_DIST` · **templateId:** `TPL_TRANSFER_NEG_DISTRIBUTION`
- **Owner note:** Matches the real contrast sign error. Healthy.

**Next question fed:** `Solve for z:  -4(z - 2) + 3 = 19` / opening `-4(z - 2) + 3 = 19`

### Item 4 — `TRANSFER_NEG_DIST` (session end)

**Prompt:** `Solve for z:  -4(z - 2) + 3 = 19`  
**Opening:** `-4(z - 2) + 3 = 19`

- Step: `-4(z - 2) + 3 = 19` → **``** (empty) (`dont_know`) → validity=null / verificationSource=null  
  - **assist:** `RULE_PROMPT` — “The number outside the bracket multiplies every term inside it — including its sign. What is (-4) x (-2)? Two negatives multiplied together give a positive, so it is 8, not -8.”
- Step: `-4(z - 2) + 3 = 19` → **``** (empty) (`dont_know`) → validity=null / verificationSource=null  
  - **assist:** `FULL_EXPLANATION` — “Multiply the number outside the bracket by each term inside, one at a time, and keep track of the signs as you go. What is (-4) x (-2)? Two negatives multiplied together give a positive, so it is 8, not -8.”

**When item completed → RULE Why (session close):**
- **reasoning:** `null`
- **source:** `RULE` · **origin:** null · **nextItemKey:** `null` · **nextEquationPrompt:** `null`

**Session status:** `COMPLETED`

---

## Run 3 — mix_085

**File:** `runs/run100_2026-08-05T07-22-41-973Z_mix_085_correct_correct_bare_final_wrong_then_correct_correct.json`  
**Scenario intent:** `entry=correct`, `varBoth=correct`, `main=bare_final`, `contrast=wrong_then_correct`, `transfer=correct`  
**Actual path:** ENTRY → MAIN (correct until bare final `1`) → CONTRAST (one wrong; no “then correct”) → TRANSFER (perfect)  
**Critical bug:** Same invent-after-ENTRY severity as mix_015 — perfect ENTRY, AI Why says **“many wrong answers”**. Outside first-15; batch confirmation.

### Item 1 — `ENTRY_TWO_STEP`

**Prompt:** `Solve for x:  3x + 5 = 20`  
**Opening:** `3x + 5 = 20`

- Step: `3x + 5 = 20` → **`3x = 15`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `3x = 15` → **`x = 5`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG with many wrong answers, so presenting a NEG_DIST_MAIN problem will directly target this gap and assess their ability to distribute negatives in an equation context.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_MAIN` · **templateId:** `TPL_NEG_DISTRIBUTION`
- **Owner note:** Invented “many wrong answers” with **zero** session errors so far.

**Next question fed:** `Solve for x:  -2(x - 5) + 3 = 11` / opening `-2(x - 5) + 3 = 11`

### Item 2 — `NEG_DIST_MAIN`

**Prompt:** `Solve for x:  -2(x - 5) + 3 = 11`  
**Opening:** `-2(x - 5) + 3 = 11`

- Step: `-2(x - 5) + 3 = 11` → **`-2x + 10 + 3 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 10 + 3 = 11` → **`-2x + 13 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 13 = 11` → **`-2x = -2`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x = -2` → **`1`** (`bare_number_final`) → INVALID / **AI_FALLBACK**  
  - **firstInvalid:** `The new line '1' does not represent a valid transformation or solution step from '-2x = -2'.`  
  - **assist:** null  
  - **Owner note:** Bare final correctly blamed as invalid transform — **not** as a LIN_DISTRIBUTE_NEG sign gap. Healthy checker behaviour.

**When item completed → RULE Why:**
- **reasoning:** “Rule sequence: next item in the fixed diagnostic sequence.”
- **source:** `RULE` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_CONTRAST` · **templateId:** `TPL_NEG_DISTRIBUTION_BARE`
- **Owner note:** RULE transition is evidence-safe (no invented error severity).

**Next question fed:** `Expand:  -3(y - 4)` / opening `-3(y - 4)`

### Item 3 — `NEG_DIST_CONTRAST`

**Prompt:** `Expand:  -3(y - 4)`  
**Opening:** `-3(y - 4)`

- Step: `-3(y - 4)` → **`-3y - 12`** (`wrong`) → INVALID / DETERMINISTIC  
  - **firstInvalid:** `(-3)(-4) was evaluated as -12, but multiplying those two signs gives 12`  
  - **assist:** `RULE_PROMPT` — “The number outside the bracket multiplies every term inside it — including its sign. What is (-3) x (-4)? Two negatives multiplied together give a positive, so it is 12, not -12.”  
  - **Collector note:** Scenario said `wrong_then_correct`; no second corrective attempt was collected — advanced after one wrong.

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in negative distribution, with a recent error in sign multiplication; the TRANSFER_NEG_DIST question directly targets this gap as a post-teaching transfer check.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `TRANSFER_NEG_DIST` · **templateId:** `TPL_TRANSFER_NEG_DISTRIBUTION`
- **Owner note:** Sign-error evidence claim is fair. “post-teaching” is a soft overclaim (only RULE_PROMPT assist, no completed re-solve).

**Next question fed:** `Solve for z:  -4(z - 2) + 3 = 19` / opening `-4(z - 2) + 3 = 19`

### Item 4 — `TRANSFER_NEG_DIST` (session end)

**Prompt:** `Solve for z:  -4(z - 2) + 3 = 19`  
**Opening:** `-4(z - 2) + 3 = 19`

- Step: `-4(z - 2) + 3 = 19` → **`-4z + 8 + 3 = 19`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-4z + 8 + 3 = 19` → **`-4z + 11 = 19`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-4z + 11 = 19` → **`-4z = 8`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-4z = 8` → **`z = -2`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → RULE Why (session close):**
- **reasoning:** `null`
- **source:** `RULE` · **origin:** null · **nextItemKey:** `null` · **nextEquationPrompt:** `null`

**Session status:** `COMPLETED`

---

## Run 4 — mix_007

**File:** `runs/run100_2026-08-05T07-00-38-323Z_mix_007_correct_correct_correct_wrong_then_correct_decline_twice.json`  
**Scenario intent:** `entry=correct`, `varBoth=correct`, `main=correct`, `contrast=wrong_then_correct`, `transfer=decline_twice`  
**Actual path:** ENTRY → MAIN (perfect) → **TRANSFER** decline ×2 — **CONTRAST never shown**  
**Critical bug:** After perfect MAIN, AI Why invents **“moderate errors”** and overclaims **“after initial teaching”**, then jumps to TRANSFER.

### Item 1 — `ENTRY_TWO_STEP`

**Prompt:** `Solve for x:  3x + 5 = 20`  
**Opening:** `3x + 5 = 20`

- Step: `3x + 5 = 20` → **`3x = 15`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `3x = 15` → **`x = 5`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG, so giving a NEG_DISTRIBUTION problem with solving an equation involving negative distribution is most informative next.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_MAIN` · **templateId:** `TPL_NEG_DISTRIBUTION`
- **Owner note:** False-gap boilerplate after perfect entry (destination MAIN is still a normal probe).

**Next question fed:** `Solve for x:  -2(x - 5) + 3 = 11` / opening `-2(x - 5) + 3 = 11`

### Item 2 — `NEG_DIST_MAIN`

**Prompt:** `Solve for x:  -2(x - 5) + 3 = 11`  
**Opening:** `-2(x - 5) + 3 = 11`

- Step: `-2(x - 5) + 3 = 11` → **`-2x + 10 + 3 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 10 + 3 = 11` → **`-2x + 13 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 13 = 11` → **`-2x = -2`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x = -2` → **`x = 1`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG with moderate errors, so the next question should target this skill to check transfer after initial teaching, making the fixed sequence item the best choice.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `TRANSFER_NEG_DIST` · **templateId:** `TPL_TRANSFER_NEG_DISTRIBUTION`
- **Owner note:** MAIN had **zero** errors and **no teaching**. “moderate errors” + “after initial teaching” invent a failure/teach history. Contrast stage from scenario intent was skipped.

**Next question fed:** `Solve for z:  -4(z - 2) + 3 = 19` / opening `-4(z - 2) + 3 = 19`

### Item 3 — `TRANSFER_NEG_DIST` (session end)

**Prompt:** `Solve for z:  -4(z - 2) + 3 = 19`  
**Opening:** `-4(z - 2) + 3 = 19`

- Step: `-4(z - 2) + 3 = 19` → **``** (empty) (`dont_know`) → validity=null / verificationSource=null  
  - **assist:** `RULE_PROMPT` — “The number outside the bracket multiplies every term inside it — including its sign. What is (-4) x (-2)? Two negatives multiplied together give a positive, so it is 8, not -8.”
- Step: `-4(z - 2) + 3 = 19` → **``** (empty) (`dont_know`) → validity=null / verificationSource=null  
  - **assist:** `FULL_EXPLANATION` — “Multiply the number outside the bracket by each term inside, one at a time, and keep track of the signs as you go. What is (-4) x (-2)? Two negatives multiplied together give a positive, so it is 8, not -8.”

**When item completed → RULE Why (session close):**
- **reasoning:** `null`
- **source:** `RULE` · **origin:** null · **nextItemKey:** `null` · **nextEquationPrompt:** `null`

**Session status:** `COMPLETED`

---

## Run 5 — mix_003

**File:** `runs/run100_2026-08-05T06-59-32-136Z_mix_003_correct_correct_correct_correct_decline_twice.json`  
**Scenario intent:** `entry=correct`, `varBoth=correct`, `main=correct`, `contrast=correct`, `transfer=decline_twice`  
**Actual path:** ENTRY → VAR_BOTH → MAIN (perfect) → CONTRAST (correct one-shot) → TRANSFER decline ×2  
**Critical bugs:** (1) `RULE_PROMPT` assist fired on a **VALID/correct** contrast expand; (2) after that correct contrast, AI Why invents **“moderate errors”**.

### Item 1 — `ENTRY_TWO_STEP`

**Prompt:** `Solve for x:  3x + 5 = 20`  
**Opening:** `3x + 5 = 20`

- Step: `3x + 5 = 20` → **`3x = 15`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `3x = 15` → **`x = 5`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → RULE Why:**
- **reasoning:** “Rule sequence: next item in the fixed diagnostic sequence.”
- **source:** `RULE` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `ENTRY_VARIABLE_BOTH` · **templateId:** `TPL_VARIABLE_BOTH`

**Next question fed:** `Solve for x:  4x - 7 = 2x + 9` / opening `4x - 7 = 2x + 9`

### Item 2 — `ENTRY_VARIABLE_BOTH`

**Prompt:** `Solve for x:  4x - 7 = 2x + 9`  
**Opening:** `4x - 7 = 2x + 9`

- Step: `4x - 7 = 2x + 9` → **`2x = 16`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `2x = 16` → **`x = 8`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → RULE Why:**
- **reasoning:** “Rule sequence: next item in the fixed diagnostic sequence.”
- **source:** `RULE` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_MAIN` · **templateId:** `TPL_NEG_DISTRIBUTION`

**Next question fed:** `Solve for x:  -2(x - 5) + 3 = 11` / opening `-2(x - 5) + 3 = 11`

### Item 3 — `NEG_DIST_MAIN`

**Prompt:** `Solve for x:  -2(x - 5) + 3 = 11`  
**Opening:** `-2(x - 5) + 3 = 11`

- Step: `-2(x - 5) + 3 = 11` → **`-2x + 10 + 3 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 10 + 3 = 11` → **`-2x + 13 = 11`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x + 13 = 11` → **`-2x = -2`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null
- Step: `-2x = -2` → **`x = 1`** (`correct`) → VALID / DETERMINISTIC / assist=null / firstInvalid=null

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG, so giving a focused expansion task without solving (NEG_DIST_CONTRAST) will target this gap directly before moving to more complex transfer problems.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `NEG_DIST_CONTRAST` · **templateId:** `TPL_NEG_DISTRIBUTION_BARE`
- **Owner note:** False-gap boilerplate after perfect MAIN; isolate-expand destination is common selector behaviour.

**Next question fed:** `Expand:  -3(y - 4)` / opening `-3(y - 4)`

### Item 4 — `NEG_DIST_CONTRAST`

**Prompt:** `Expand:  -3(y - 4)`  
**Opening:** `-3(y - 4)`

- Step: `-3(y - 4)` → **`-3y + 12`** (`correct`) → VALID / DETERMINISTIC  
  - **firstInvalid:** null  
  - **assist:** `RULE_PROMPT` — “The number outside the bracket multiplies every term inside it — including its sign. What is (-3) x (-4)? Two negatives multiplied together give a positive, so it is 12, not -12.”  
  - **Owner note:** Assist text assumes a wrong answer (`…so it is 12, not -12`) even though the student submitted the **correct** expand. Part of the 25-run `RULE_PROMPT`-on-correct-contrast pattern.

**When item completed → AI Why:**
- **reasoning:** “The student shows a likely gap in LIN_DISTRIBUTE_NEG with moderate errors, so the next question should be a transfer check on negative distribution to assess if the student can apply the skill independently in a new context.”
- **source:** `AI` · **origin:** `PRE_WRITTEN` · **nextItemKey:** `TRANSFER_NEG_DIST` · **templateId:** `TPL_TRANSFER_NEG_DISTRIBUTION`
- **Owner note:** Contrast was **correct**. “moderate errors” is invented.

**Next question fed:** `Solve for z:  -4(z - 2) + 3 = 19` / opening `-4(z - 2) + 3 = 19`

### Item 5 — `TRANSFER_NEG_DIST` (session end)

**Prompt:** `Solve for z:  -4(z - 2) + 3 = 19`  
**Opening:** `-4(z - 2) + 3 = 19`

- Step: `-4(z - 2) + 3 = 19` → **``** (empty) (`dont_know`) → validity=null / verificationSource=null  
  - **assist:** `RULE_PROMPT` — “The number outside the bracket multiplies every term inside it — including its sign. What is (-4) x (-2)? Two negatives multiplied together give a positive, so it is 8, not -8.”
- Step: `-4(z - 2) + 3 = 19` → **``** (empty) (`dont_know`) → validity=null / verificationSource=null  
  - **assist:** `FULL_EXPLANATION` — “Multiply the number outside the bracket by each term inside, one at a time, and keep track of the signs as you go. What is (-4) x (-2)? Two negatives multiplied together give a positive, so it is 8, not -8.”

**When item completed → RULE Why (session close):**
- **reasoning:** `null`
- **source:** `RULE` · **origin:** null · **nextItemKey:** `null` · **nextEquationPrompt:** `null`

**Session status:** `COMPLETED`

---

## Quick owner map (why these five)

| Rank | Run | Smoking-gun Why quote | Trail facts that contradict it |
|---|---|---|---|
| 1 | mix_014 | “with **many wrong answers**” → CONTRAST | Perfect MAIN (4 VALID steps) |
| 2 | mix_015 | “with **many wrong answers**” → MAIN | Perfect ENTRY; **no wrongs yet in session** |
| 3 | mix_085 | “with **many wrong answers**” → MAIN | Perfect ENTRY; same invent pattern outside first 15 |
| 4 | mix_007 | “**moderate errors**… after **initial teaching**” → TRANSFER | Perfect MAIN; no teaching; CONTRAST skipped |
| 5 | mix_003 | Assist on correct expand + “**moderate errors**” → TRANSFER | Contrast `-3y + 12` was VALID/correct |
