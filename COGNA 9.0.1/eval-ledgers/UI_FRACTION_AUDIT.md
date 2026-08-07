# UI Fraction / Diagnostic-v2 Audit

Generated: 2026-08-07T18:24:50.773Z
Student: `dev_student_001` · API: `http://localhost:3001`

## Judgment rules

- Opening item always RULE.
- AI agreeing with the rule still shows AI.
- Score Why/hypothesis on evidence claims vs microSkillStates, not only next itemKey.
- Tags: `false_gap`, `moderate_errors`, `after_teaching_overclaim`, `option_0_jargon`.

## Case summary

| Case | Track | Opening | AI next? | trailMatch fails | Notes |
|---|---|---|---|---|---|
| 01_frac_perfect_short | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 0 | — |
| 02_frac_all_correct | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 0 | — |
| 03_wrong_lcd_twice | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 1 | option_0_jargon |
| 04_dropped_term | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 0 | — |
| 05_decline_twice | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 0 | — |
| 06_gibberish | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 0 | — |
| 07_selector_rule_only | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 0 | — |
| 08_ai_on_path | FRACTION_LINEAR | ? | no | 0 | POST /diagnostic-v2/sessions/cmsj9ws9j0088y2eu38pbeosu/steps → 400: {"message":"This diagnostic session has already ended.","error":"Bad Request","statusCode":400} |
| 09_negdist_perfect_entry | NEGATIVE_DISTRIBUTION | ENTRY_TWO_STEP | no | 0 | — |
| 10_negdist_arun | NEGATIVE_DISTRIBUTION | ENTRY_TWO_STEP | yes | 0 | — |
| 11_assist_on_correct | FRACTION_LINEAR | ? | no | 0 | POST /diagnostic-v2/sessions/cmsj9xxvb00dcy2eusublnif5/steps → 400: {"message":"This diagnostic session has already ended.","error":"Bad Request","statusCode":400} |
| 12_timeout_observe | FRACTION_LINEAR | ENTRY_FRAC_SIMPLE | yes | 0 | — |

## Per-case transitions

### 01_frac_perfect_short — Frac perfect short — entry only then stop after next Why

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9v9vh001fy2euuh81r6wb`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 22 times independently and only made 3 errors on their own, showing strong understanding despite a few slips.
- states: CLEAR fail=0 ok=2; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: The student is currently working on LIN_CLEAR_FRACTIONS and has just answered a question correctly; presenting the existing FRAC_CLEAR_MAIN question will continue to build on this skill with an appropriate level of challenge and variety.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 22 times independently and only made 3 errors on their own, showing strong understanding despite a few slips.
- states: CLEAR fail=0 ok=3; DIST fail=33 ok=9
- trailMatch: **PASS**

### 02_frac_all_correct — Frac all-correct path through MAIN clear

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9vdt2001zy2euycodte8s`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 23 times on their own and only made 3 errors, showing strong understanding despite a few slips.
- states: CLEAR fail=0 ok=3; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: The student is currently working on LIN_CLEAR_FRACTIONS and has already seen a simple fraction clearing question this session; showing the existing more complex fraction clearing question (FRAC_CLEAR_MAIN) will build on their current progress and target the same skill with a more challenging problem.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 23 times on their own and only made 3 errors, showing strong understanding despite a few slips.
- states: CLEAR fail=0 ok=4; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: FRAC_CLEAR_MAIN ← correct_clear

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 23 times on their own and only made 3 errors, showing strong understanding despite a few slips.
- states: CLEAR fail=0 ok=5; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 4: FRAC_CLEAR_MAIN ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 23 times on their own and only made 3 errors, showing strong understanding despite a few slips.
- states: CLEAR fail=0 ok=5; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 5: FRAC_CLEAR_MAIN ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student correctly tidied up like terms more often than not but still made several independent mistakes, indicating a recurring challenge rather than occasional slips.
- states: CLEAR fail=0 ok=5; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 6: FRAC_CLEAR_MAIN ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student mostly gets it right alone but has a few mistakes independently, showing some consistent trouble.
- states: CLEAR fail=0 ok=5; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 7: FRAC_CLEAR_MAIN ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_CONTRAST` (origin `PRE_WRITTEN`)
- Why: The student is currently working on LIN_REMOVE_CONSTANT with likely gaps, so giving a question that focuses on clearing fractions with a simple fraction equals integer form (TPL_FRAC_CLEAR_BARE) will reinforce LIN_CLEAR_FRACTIONS and support LIN_REMOVE_CONSTANT practice without introducing variables on both sides or more complex fraction forms.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 24 times on their own and only made a few errors, showing strong understanding despite some independent challenges.
- states: CLEAR fail=0 ok=5; DIST fail=33 ok=9
- trailMatch: **PASS**

### 03_wrong_lcd_twice — Wrong common multiple ×2 → contrast/pattern

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9vn5t003fy2eu7ijfk8tj`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 25 times on their own and only made 3 mistakes, showing strong understanding despite a few errors.
- states: CLEAR fail=0 ok=5; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **RULE** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: Rule sequence: next item in the fixed diagnostic sequence.
- why RULE not AI: selector fell back to rule sequence (timeout/reject/flag/shadow)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 25 times on their own and only made 3 mistakes, showing strong understanding despite a few errors.
- states: CLEAR fail=0 ok=6; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: FRAC_CLEAR_MAIN ← wrong_lcd

- validity: `INVALID` · verification: `DETERMINISTIC` · code: `null`
- firstInvalid: each side was multiplied by a different denominator (2 and 3) — both sides need the same common multiple (6)
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_CONTRAST` (origin `PRE_WRITTEN`)
- Why: The student made an error in LIN_CLEAR_FRACTIONS by multiplying each side by different denominators instead of the same common multiple; option 0 is a clear-fractions question with one fraction equal to an integer, which isolates the clearing fractions step and helps reinforce the correct method.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `POSSIBLE_SLIP` — The student mostly gets it right independently but made a recent error by multiplying each side by different denominators instead of the same one, suggesting a one-time mistake.
- states: CLEAR fail=1 ok=6; DIST fail=33 ok=9
- trailMatch: **FAIL** · tags: `option_0_jargon`

#### Transition 4: FRAC_CLEAR_CONTRAST ← wrong_lcd

- validity: `INVALID` · verification: `DETERMINISTIC` · code: `null`
- firstInvalid: the multipliers used when clearing are not a valid common multiple of the denominators 2, 4 (need 4 on every term)
- assistance: `RULE_PROMPT` · itemComplete: true
- selector: **AI** → next `TRANSFER_FRAC_CLEAR` (origin `PRE_WRITTEN`)
- Why: The student recently made an error in LIN_CLEAR_FRACTIONS by using different multipliers on each side instead of the same common multiple; the existing TRANSFER_FRAC_CLEAR question targets LIN_CLEAR_FRACTIONS and will check if the student can correctly apply the same common multiple to clear denominators now.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student has made errors twice when clearing fractions by multiplying both sides, specifically using incorrect multipliers, despite more correct attempts, indicating a recurring issue with choosing the right common multiple.
- states: CLEAR fail=2 ok=6; DIST fail=33 ok=9
- trailMatch: **PASS**

### 04_dropped_term — Dropped term when clearing

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9vxzl004jy2eupsjxm8jb`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 26 times on their own with only 3 mistakes, showing strong understanding despite a few errors.
- states: CLEAR fail=2 ok=6; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: The student is currently working on LIN_CLEAR_FRACTIONS and has just completed a correct step; presenting the existing question with itemKey FRAC_CLEAR_MAIN fits perfectly to continue practicing this skill.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student solved problems correctly more often than not but still made mistakes on their own, showing a consistent pattern of errors with this skill.
- states: CLEAR fail=2 ok=7; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: FRAC_CLEAR_MAIN ← dropped_term

- validity: `INVALID` · verification: `DETERMINISTIC` · code: `null`
- firstInvalid: when clearing denominators by multiplying by 6, every term on both sides must be multiplied — a constant term was dropped
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_CONTRAST` (origin `PRE_WRITTEN`)
- Why: The student made an error in clearing fractions by not multiplying every term; the option with a single fraction equal to an integer (FRAC_CLEAR_CONTRAST) directly targets the LIN_CLEAR_FRACTIONS skill to reinforce correct multiplication of all terms.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student correctly cleared fractions most times but has a recurring error of dropping a constant term when multiplying both sides by the denominator.
- states: CLEAR fail=3 ok=7; DIST fail=33 ok=9
- trailMatch: **PASS**

### 05_decline_twice — Decline ×2 on MAIN

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9w57k005gy2eumt345ydc`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 27 times on their own compared to only 3 mistakes, showing strong independent skill with occasional minor errors.
- states: CLEAR fail=3 ok=7; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: The student is currently working on LIN_CLEAR_FRACTIONS and the first existing item (index 0) targets that micro-skill directly with a suitable equation involving fractions on both sides, which will provide a good next step in practice.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student solved problems correctly more often than not but made several mistakes on their own, showing a recurring difficulty with clearing fractions independently.
- states: CLEAR fail=3 ok=8; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: FRAC_CLEAR_MAIN ← decline

- validity: `null` · verification: `null` · code: `null`
- assistance: `RULE_PROMPT` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student solved the problem correctly more often than not but still made mistakes several times when working alone, showing a recurring difficulty with this skill.
- states: CLEAR fail=3 ok=8; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 4: FRAC_CLEAR_MAIN ← decline

- validity: `null` · verification: `null` · code: `null`
- assistance: `FULL_EXPLANATION` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_CONTRAST` (origin `PRE_WRITTEN`)
- Why: The student is struggling to start LIN_CLEAR_FRACTIONS, so giving a simpler fraction clearing problem with one fraction equal to an integer (FRAC_CLEAR_CONTRAST) will help focus on the initial step of clearing fractions without added complexity.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student solved the problem correctly more often than not but still made mistakes multiple times when working independently with fractions, showing a recurring challenge.
- states: CLEAR fail=3 ok=8; DIST fail=33 ok=9
- trailMatch: **PASS**

### 06_gibberish — Gibberish / PARSE_FAILED on MAIN

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9wdbe006gy2eu6ohxr628`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 28 times independently and only made 3 independent errors, showing strong understanding despite a few slips.
- states: CLEAR fail=3 ok=8; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **RULE** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: Rule sequence: next item in the fixed diagnostic sequence.
- why RULE not AI: selector fell back to rule sequence (timeout/reject/flag/shadow)
- What we think: **AI** / `REPEATED_PATTERN` — The student solved problems correctly more often than not but still made errors multiple times when working independently with fractions, indicating a recurring issue.
- states: CLEAR fail=3 ok=9; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: FRAC_CLEAR_MAIN ← gibberish

- validity: `INVALID` · verification: `AI_FALLBACK` · code: `null`
- firstInvalid: The new line contains nonsensical characters and does not represent a valid mathematical step from the previous line.
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_CONTRAST` (origin `PRE_WRITTEN`)
- Why: The student showed difficulty on LIN_CLEAR_FRACTIONS with the last step, so giving a simpler fraction clearing problem with one fraction equal to an integer (FRAC_CLEAR_CONTRAST) will directly target their gap in clearing fractions before solving.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student solved problems correctly more often than not but still made several errors independently, showing a recurring difficulty with clearing fractions by multiplying both sides.
- states: CLEAR fail=4 ok=9; DIST fail=33 ok=9
- trailMatch: **PASS**

### 07_selector_rule_only — AI selector GENERATE off (env note — see summary)

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9wm9o007ey2eueoky87z9`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 29 times independently and only made 3 independent errors, showing strong overall skill with occasional minor slips.
- states: CLEAR fail=4 ok=9; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: The student is currently working on LIN_CLEAR_FRACTIONS and the first existing option (FRAC_CLEAR_MAIN) directly targets this skill with a suitable equation involving fractions on both sides, which is ideal for practice at this stage.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student correctly cleared fractions more often than not but still made mistakes several times when working independently, showing a consistent pattern of errors.
- states: CLEAR fail=4 ok=10; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: FRAC_CLEAR_MAIN ← correct_clear

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student solved problems correctly more often than not but still made several mistakes on their own, showing a consistent pattern of errors with this skill.
- states: CLEAR fail=4 ok=11; DIST fail=33 ok=9
- trailMatch: **PASS**

### 08_ai_on_path — Normal AI-on path — capture at least one AI next item

- Opening: `?` · source **RULE** · session failed to start
- Session: `null`
- Notes: POST /diagnostic-v2/sessions/cmsj9ws9j0088y2eu38pbeosu/steps → 400: {"message":"This diagnostic session has already ended.","error":"Bad Request","statusCode":400}

### 09_negdist_perfect_entry — NegDist perfect entry — false-gap Why check

- Opening: `ENTRY_TWO_STEP` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9x4xk00a7y2euvs7h0fgo`

#### Transition 1: ENTRY_TWO_STEP ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student solved two-step equations correctly most of the time but made several errors on their own, indicating a recurring difficulty rather than occasional mistakes.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_TWO_STEP ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 31 times on their own and only made 3 mistakes, showing strong understanding despite a few errors.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: ENTRY_TWO_STEP ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **RULE** → next `ENTRY_VARIABLE_BOTH` (origin `PRE_WRITTEN`)
- Why: Rule sequence: next item in the fixed diagnostic sequence.
- why RULE not AI: selector fell back to rule sequence (timeout/reject/flag/shadow)
- What we think: **AI** / `WORKING_WELL` — The student correctly isolated the letter most of the time on their own with only a few mistakes, showing strong understanding despite minor errors.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

### 10_negdist_arun — NegDist Arun-like sign product wrong ×2

- Opening: `ENTRY_TWO_STEP` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9xazb00azy2eunhb1n80u`

#### Transition 1: ENTRY_TWO_STEP ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **RULE** / `REPEATED_PATTERN` — The same kind of error appeared 7 times on two-step equations.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_TWO_STEP ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 32 times on their own and only made a few errors, showing strong independent skill despite some struggles.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 3: ENTRY_TWO_STEP ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `GEN_VAR_BOTH_4_1_2_7` (origin `TEMPLATE_RENDERED`)
- Why: The student is currently working on LIN_REMOVE_COEFFICIENT with a likely gap in LIN_SOLVE_TWO_STEP and LIN_COMBINE_LIKE as prerequisites; a TPL_VARIABLE_BOTH question will engage combining like terms and solving equations with variables on both sides, addressing these gaps and building on the current progress without repeating previous questions.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `WORKING_WELL` — The student correctly isolated the letter most of the time on their own, with very few errors, showing strong understanding despite occasional struggles.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 4: GEN_VAR_BOTH_4_1_2_7 ← correct

- validity: `INVALID` · verification: `DETERMINISTIC` · code: `null`
- firstInvalid: this line does not have the same solution as the line above it
- assistance: `REVIEW_OPPORTUNITY` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student made several errors on their own and only occasionally needed help, indicating a recurring difficulty rather than a one-time mistake.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 5: GEN_VAR_BOTH_4_1_2_7 ← correct

- validity: `INVALID` · verification: `DETERMINISTIC` · code: `null`
- firstInvalid: this line does not have the same solution as the line above it
- assistance: `FULL_EXPLANATION` · itemComplete: true
- selector: **AI** → next `ENTRY_VARIABLE_BOTH` (origin `PRE_WRITTEN`)
- Why: The student made an error on LIN_COMBINE_LIKE, which is a prerequisite for LIN_SOLVE_VARIABLE_BOTH. Asking another LIN_SOLVE_VARIABLE_BOTH question will give practice combining like terms and solving with variables on both sides, directly targeting the recent error and reinforcing the needed skill.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student correctly combined like terms more than twice as often as they made mistakes, but the number of errors shows this is a recurring issue rather than a one-time slip.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 6: ENTRY_VARIABLE_BOTH ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student correctly combined like terms more than twice as often as they made mistakes, but the number of errors on their own shows a consistent difficulty rather than a one-time slip.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 7: ENTRY_VARIABLE_BOTH ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `NEG_DIST_MAIN` (origin `PRE_WRITTEN`)
- Why: The student has shown difficulty with LIN_DISTRIBUTE_NEG, which is a prerequisite for LIN_REMOVE_COEFFICIENT; presenting the next planned question on LIN_DISTRIBUTE_NEG will target the root cause of errors in distributing a negative multiplier in an equation.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `WORKING_WELL` — The student correctly isolated the letter 34 times independently and only made 2 errors on their own, showing strong understanding despite a few minor mistakes.
- states: CLEAR fail=6 ok=12; DIST fail=33 ok=9
- trailMatch: **PASS**

#### Transition 8: NEG_DIST_MAIN ← wrong_sign

- validity: `INVALID` · verification: `DETERMINISTIC` · code: `null`
- firstInvalid: (-2)(-5) was evaluated as -10, but multiplying those two signs gives 10
- assistance: `null` · itemComplete: true
- selector: **AI** → next `NEG_DIST_CONTRAST` (origin `PRE_WRITTEN`)
- Why: The student made a sign error in distributing a negative multiplier, so giving a bare negative distribution expansion question (LIN_DISTRIBUTE_NEG) without an equation will directly target their specific error in multiplying negatives correctly, reinforcing the sign rule in distribution before moving back to solving equations.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **RULE** / `REPEATED_PATTERN` — The same kind of error appeared 34 times on expanding brackets that have a minus in front — most recently, (-2)(-5) was evaluated as -10, but multiplying those two signs gives 10.
- states: CLEAR fail=6 ok=12; DIST fail=34 ok=9
- trailMatch: **PASS**

#### Transition 9: NEG_DIST_CONTRAST ← wrong_sign

- validity: `INVALID` · verification: `AI_FALLBACK` · code: `null`
- firstInvalid: The new line introduces variables and constants unrelated to the previous expression, so it does not follow validly.
- assistance: `RULE_PROMPT` · itemComplete: true
- selector: **AI** → next `TRANSFER_NEG_DIST` (origin `PRE_WRITTEN`)
- Why: The student recently made an error on LIN_DISTRIBUTE_NEG involving sign multiplication in distribution; the existing TPL_TRANSFER_NEG_DISTRIBUTION question directly targets this skill as a post-teaching transfer check, making it the most informative next step.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student made many more mistakes than correct answers on their own and did not improve even with help, showing a consistent difficulty with expanding brackets that have a minus in front.
- states: CLEAR fail=6 ok=12; DIST fail=35 ok=9
- trailMatch: **PASS**

### 11_assist_on_correct — Assist-on-correct hunt after wrong then correct contrast clear

- Opening: `?` · source **RULE** · session failed to start
- Session: `null`
- Notes: POST /diagnostic-v2/sessions/cmsj9xxvb00dcy2eusublnif5/steps → 400: {"message":"This diagnostic session has already ended.","error":"Bad Request","statusCode":400}

### 12_timeout_observe — Observe slow selector (no artificial delay) — note RULE fallback if any

- Opening: `ENTRY_FRAC_SIMPLE` · source **RULE** · opening item is fixed entry sequence
- Session: `cmsj9y5z500euy2eumujp4fk7`

#### Transition 1: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `WORKING_WELL` — The student correctly moved numbers across the equals sign 34 times on their own and only made 3 errors, showing strong understanding with occasional minor slips.
- states: CLEAR fail=8 ok=13; DIST fail=35 ok=9
- trailMatch: **PASS**

#### Transition 2: ENTRY_FRAC_SIMPLE ← correct

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: true
- selector: **AI** → next `FRAC_CLEAR_MAIN` (origin `PRE_WRITTEN`)
- Why: The student is currently working on LIN_CLEAR_FRACTIONS and has shown some gaps in this skill; the first existing question targeting LIN_CLEAR_FRACTIONS (FRAC_CLEAR_MAIN) fits well as the next step to build on recent correct work and continue practice in this area.
- why AI not RULE: AI served (GENERATE+SERVE on, parse/gates passed) — agree-with-rule still shows AI
- What we think: **AI** / `REPEATED_PATTERN` — The student made mistakes on their own 8 times out of 22 attempts, showing a consistent struggle with clearing fractions independently.
- states: CLEAR fail=8 ok=14; DIST fail=35 ok=9
- trailMatch: **PASS**

#### Transition 3: FRAC_CLEAR_MAIN ← correct_clear

- validity: `VALID` · verification: `DETERMINISTIC` · code: `null`
- assistance: `null` · itemComplete: false
- selector: (none)
- What we think: **AI** / `REPEATED_PATTERN` — The student has more correct attempts than incorrect ones but still makes a significant number of errors independently, indicating a recurring difficulty with this skill.
- states: CLEAR fail=8 ok=15; DIST fail=35 ok=9
- trailMatch: **PASS**

## Prioritized bugs

1. `option_0_jargon` — confirmed live: selector Why for FRAC_CLEAR_CONTRAST said **"option 0 is a clear-fractions question…"**. Forbidden-term gate did not catch choice-index jargon. **Fix:** extend forbidden terms / selector reject for `option N`.
2. **`firstInvalidActionCode` missing from step API response** — DB/verifier had the right description (`each side was multiplied by a different denominator…` = WRONG_COMMON_MULTIPLE) but client DTO only exposes `firstInvalidActionDescription`. Debug UI cannot show the stable code.
3. **Cases 08 / 11 aborted** — script kept submitting after `sessionComplete` (400). Re-run with break-on-complete; fraction wrong×2 → contrast → transfer path already covered by case 03 (RULE_PROMPT on *invalid* contrast, not assist-on-correct).
4. **Assist-on-correct** — not reproduced on FRACTION_LINEAR in this batch. NegDist case 10 showed REVIEW/FULL_EXPLANATION on INVALID generated var-both lines (expected). Keep hunting on VALID contrast expand separately.
5. **Shared demo student state pollution** — hypotheses often narrate `LIN_REMOVE_CONSTANT` / historical DIST gaps (33 failures) unrelated to the current fraction item. Interpreter is not inventing randomly, but it is **not scoped to this session’s skill**, so “What we think is going on” can feel off-topic.

## Case 07 note

Hard RULE-only requires temporarily setting `AI_DIAGNOSTIC_V2_SELECTOR_GENERATE=false`. This run used live GENERATE+SERVE=true; selector sources were **AI** on next-item picks (agreeing with the rule sequence). Opening items were always RULE.

## RULE vs AI observations

| Situation | Observed |
|---|---|
| Opening `ENTRY_FRAC_SIMPLE` / `ENTRY_TWO_STEP` | Always **RULE** |
| Next after completed item (flags on) | Usually **AI**, often same destination as rule (`FRAC_CLEAR_MAIN`, contrast, transfer) with AI-authored reasoning |
| Decline / wrong clear | AI still picks next; assistance RULE_PROMPT → FULL_EXPLANATION on second decline |
| Why criteria | Destinations usually coherent; evidence claims sometimes use choice-index jargon (`option 0`) |

## What we think is going on

Not random — grounded in microSkillStates — but **often wrong skill for the current item** when the student has a long polluted history (e.g. WORKING_WELL on `LIN_REMOVE_CONSTANT` while solving fraction clears). Prefer session-scoped or target-skill-scoped interpretation for fraction track follow-ups.
