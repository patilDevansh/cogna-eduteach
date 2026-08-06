# Eval: first 15 diagnostic-v2 ledgers

**Source:** `index-100.json` runs[0..14]  
**Method:** For each item in order — question → steps (intent / validity / assistance) → `nextQuestionWhy` (source + reasoning). Judge whether the next item and Why text fit the trail.  
**Scope:** Read-only ledger review. No quiz re-run. No engine changes.

**Verdict labels**

| Label | Meaning |
|---|---|
| **OK** | Destination and Why fit the trail (minor boilerplate ok) |
| **PARTLY ODD** | Destination mostly fine, but Why misstates evidence, or assistance/path is weird |
| **BUG-ish** | Clear misread of the trail (errors claimed where none exist, or similar) |

---

## Cross-cutting patterns (all 15)

1. **False “gap” after a perfect entry (systemic)**  
   After `ENTRY_TWO_STEP` (`3x + 5 = 20` → `3x = 15` → `x = 5`, all VALID), AI Why almost always says the student “shows a **likely gap in LIN_DISTRIBUTE_NEG**.”  
   - **Destination** (probe neg-dist next) can be defended as curriculum probing.  
   - **Causal wording** is wrong: there is no trail evidence of a distribution gap yet — only successful coefficient removal.

2. **False error counts after a perfect `NEG_DIST_MAIN` (stronger misread)**  
   Several runs finish `-2(x - 5) + 3 = 11` with four VALID correct steps (`-2x + 10 + 3 = 11` → … → `x = 1`), then Why invents “moderate errors,” “some wrong attempts,” or “many wrong answers.” That is a trail misread, not just stiff probe language.

3. **Sign-product checks look solid**  
   Wrong expands like `-3(y - 4)` → `-3y - 12` and `-4(z - 2)` → `-4z - 8 + 3 = 19` get clear deterministic invalid text naming the sign product. Not blamed as something else.

4. **Bare final `z` is treated as format/transform, not distribution**  
   From `-4z = 8` submitting bare `-2` → INVALID via `AI_FALLBACK` (“does not represent a valid transformation…”). Good — not framed as a LIN_DISTRIBUTE_NEG gap.

5. **Scenario vs path**  
   Several mix labels expect `wrong_then_correct` / `wrong_twice` on **contrast**, but the session never showed `NEG_DIST_CONTRAST` (jumped ENTRY → MAIN → TRANSFER). The ledger still evaluates the path that ran; note where the injected behaviour never fired.

---

## Run-by-run

### 1. `mix_001` — all correct  
**Path:** `ENTRY_TWO_STEP` → `NEG_DIST_MAIN` → `TRANSFER_NEG_DIST` (all steps correct/VALID)  
**Verdict: BUG-ish**

| Transition | What happened | Judgment |
|---|---|---|
| After entry | AI → `NEG_DIST_MAIN` (`-2(x - 5) + 3 = 11`). Why: “likely gap in LIN_DISTRIBUTE_NEG” | Destination ok as probe; **Why invents a gap** after perfect `3x + 5 = 20`. |
| After MAIN | AI → `TRANSFER_NEG_DIST`. Why: “likely gap … **with moderate errors and no help**” | **BUG-ish.** Trail is four correct VALID steps, no assistance. “Moderate errors” is false. Transfer as confirm-after-teach is a reasonable *destination*, but the evidence claim is wrong. |
| Transfer | Correct through `z = -2`; session ends | OK |

---

### 2. `mix_002` — transfer `arun_sign_twice`  
**Path:** ENTRY → MAIN (perfect) → TRANSFER wrong sign once  
**Verdict: PARTLY ODD**

- Entry Why: same systemic false “gap” → MAIN (PARTLY ODD wording).
- After perfect MAIN: **RULE** → `TRANSFER_NEG_DIST` (“fixed diagnostic sequence”) — clean; no invented errors.
- Transfer: `-4(z - 2) + 3 = 19` → `-4z - 8 + 3 = 19` INVALID: “`(-4)(-2)` was evaluated as `-8`, but … gives `8`.” Session ends. Sign diagnosis OK; only one wrong attempt recorded (scenario name says “twice”).

---

### 3. `mix_003` — transfer decline twice  
**Path:** ENTRY → `ENTRY_VARIABLE_BOTH` → MAIN (perfect) → CONTRAST (correct) → TRANSFER (decline ×2)  
**Verdict: PARTLY ODD**

- Rule path through var-both → MAIN: OK.
- After perfect MAIN, AI → `NEG_DIST_CONTRAST` (`Expand: -3(y - 4)`) claiming a “likely gap” with **zero MAIN errors** — destination (isolate expand) is arguable; Why is overstated.
- Contrast: submits `-3y + 12` (VALID, intent `correct`) but ledger has `assistanceOffered: RULE_PROMPT` (“What is `(-3) × (-4)`?”). **Odd:** assist attached to a correct one-shot answer.
- Then AI → TRANSFER citing “moderate errors” after that correct expand — soft misread.
- Transfer: decline → RULE_PROMPT, decline → FULL_EXPLANATION. Assistance escalation OK; session ends.

---

### 4. `mix_004` — transfer bare final z  
**Path:** ENTRY → generated `GEN_NEG_DIST_-3_6_4_x` (`-3(x - 6) + 4 = 10`) decline ×2 → TRANSFER (correct until bare `-2`)  
**Verdict: PARTLY ODD**

- Entry Why: false “gap” → generated neg-dist (systemic).
- Generated main: double `dont_know` → RULE_PROMPT then FULL_EXPLANATION. OK.
- RULE → TRANSFER after declines: OK.
- Transfer: correct dist/combine/isolate to `-4z = 8`, then sub `-2` → INVALID (`AI_FALLBACK`, not a dist misdiagnosis). **Good.**
- Scenario label said correct through contrast; actual path used generated main + declines instead — collector/routing note.

---

### 5. `mix_005` — contrast `wrong_then_correct`, transfer correct  
**Path:** ENTRY → MAIN → TRANSFER (all correct). **No contrast item.**  
**Verdict: PARTLY ODD**

- Same false-gap probe after entry.
- After perfect MAIN, RULE → TRANSFER — destination fine; no error fiction.
- **Scenario mismatch:** intended contrast wrong-then-correct never appeared; session looks like an all-correct short path.

---

### 6. `mix_006` — contrast wrong-then-correct, transfer sign twice  
**Path:** ENTRY → var-both → MAIN (perfect) → CONTRAST wrong → TRANSFER wrong sign  
**Verdict: PARTLY ODD**

- After perfect MAIN, AI → CONTRAST Why: “gap … **with some wrong attempts**” — **false**; MAIN had no wrongs. Destination (expand-only) is sensible if probing, but evidence claim is wrong.
- Contrast: `-3(y - 4)` → `-3y - 12` INVALID + RULE_PROMPT on signs. **OK** diagnosis.
- AI → TRANSFER citing sign errors on `(-3)(-4)` — **OK**, matches trail.
- Transfer: `-4z - 8 + 3 = 19` INVALID (sign product). Session ends after one wrong (name says twice).

---

### 7. `mix_007` — contrast wrong-then-correct, transfer decline twice  
**Path:** ENTRY → MAIN (perfect) → TRANSFER decline ×2. **No contrast.**  
**Verdict: BUG-ish**

- After perfect MAIN, AI → TRANSFER Why: “likely gap … **with moderate errors**” / “after initial teaching.”  
  Trail: zero errors on MAIN; no teaching failure — only success. **BUG-ish Why.**
- Transfer declines escalate RULE_PROMPT → FULL_EXPLANATION. OK.
- Scenario’s contrast behaviour never ran.

---

### 8. `mix_008` — contrast wrong-then-correct, transfer bare final z  
**Path:** ENTRY → var-both → MAIN (perfect) → CONTRAST wrong → TRANSFER bare `-2`  
**Verdict: PARTLY ODD**

- After perfect MAIN → CONTRAST: Why claims gap / “currently working on LIN_REMOVE_COEFFICIENT” while student just finished a full neg-dist solve correctly — wording stretch.
- Contrast wrong `-3y - 12` + prompt: OK.
- Transfer Why correctly cites `(-3)(-4)` as `-12` instead of `12`: OK.
- Bare `-2` from `-4z = 8`: format INVALID, not dist blame. **Good.**

---

### 9. `mix_009` — contrast decline twice, transfer correct  
**Path:** ENTRY → var-both → MAIN (perfect) → CONTRAST decline ×2 → TRANSFER all correct  
**Verdict: PARTLY ODD**

- After perfect MAIN → CONTRAST with “moderate errors” — **false** (BUG-ish wording; destination still a reasonable isolate-expand move).
- Contrast: two `dont_know` declines; **both** get `RULE_PROMPT` (same sign hint) — no escalate to FULL_EXPLANATION (unlike transfer declines elsewhere). Mild inconsistency.
- AI → TRANSFER: “recently said they do not know how to start” — **fits declines**.
- Transfer then fully correct (`-4z + 8 + 3 = 19` … `z = -2`). Pedagogically odd that they nail transfer after refusing the bare expand, but routing itself is coherent.

---

### 10. `mix_010` — contrast decline, transfer sign twice  
**Path:** ENTRY → `GEN_NEG_DIST_-4_2_1_y` decline ×2 → MAIN (perfect) → TRANSFER wrong sign  
**Verdict: PARTLY ODD**

- Entry → generated: systemic false-gap wording.
- After double decline on `-4(y - 2) + 1 = -11`, AI → `NEG_DIST_MAIN` (“another … practice on starting”) — **good recovery destination**.
- Perfect MAIN → RULE TRANSFER: OK.
- Transfer sign error `-4z - 8 + …`: OK detection; one attempt then end.

---

### 11. `mix_011` — contrast decline, transfer decline  
**Path:** ENTRY → `GEN_NEG_DIST_-5_5_2_z` decline ×2 → TRANSFER decline ×2 (**skips MAIN/CONTRAST**)  
**Verdict: PARTLY ODD**

- After declines on generated `-5(z - 5) + 2 = 12`, AI → TRANSFER Why: “planned transfer check … **to assess learning after instruction**.”  
  They only received RULE_PROMPT + FULL_EXPLANATION on declines — thin “instruction,” and jumping straight to transfer skips MAIN. Destination is aggressive; Why overclaims “after instruction.”
- Transfer: decline ×2 with escalation. OK mechanically.

---

### 12. `mix_012` — contrast decline, transfer bare final z  
**Path:** ENTRY → var-both → MAIN (perfect) → CONTRAST decline ×2 → TRANSFER bare `-2`  
**Verdict: PARTLY ODD**

- Same pattern as mix_009: false “gap” after perfect MAIN → CONTRAST; double decline both RULE_PROMPT only; TRANSFER Why correctly references don’t-know.
- Why text includes “**(option 0)**” — internal choice jargon leaking into student-facing reasoning.
- Bare `-2` on `-4z = 8`: correctly format/transform INVALID (`AI_FALLBACK`). Not a dist misread.

---

### 13. `mix_013` — contrast wrong twice, transfer correct  
**Path:** ENTRY → MAIN → TRANSFER (all correct). **No contrast.**  
**Verdict: PARTLY ODD**

- Same as mix_005: false-gap probe after entry; RULE transfer after perfect MAIN; scenario’s `wrong_twice` contrast never executed. Path itself is coherent as an all-correct short diagnostic.

---

### 14. `mix_014` — contrast wrong twice, transfer sign twice  
**Path:** ENTRY → MAIN (perfect) → CONTRAST wrong → TRANSFER wrong sign  
**Verdict: BUG-ish**

- After perfect MAIN, AI → CONTRAST Why: “gap … **with many wrong answers**” — **clearly false** (zero wrongs on MAIN). Strongest wording failure in this batch for that transition.
- Contrast: `-3y - 12` INVALID + sign prompt: OK.
- TRANSFER Why citing sign misapplication: OK.
- Transfer: `-4z - 8 + 3 = 19` INVALID: OK.

---

### 15. `mix_015` — contrast wrong twice, transfer decline twice  
**Path:** ENTRY → MAIN (perfect) → CONTRAST wrong → TRANSFER decline ×2  
**Verdict: BUG-ish**

- After entry (only two correct steps, no wrongs), AI Why: “gap … **with many wrong answers**” — invents a history that does not exist. **BUG-ish.**
- After perfect MAIN → CONTRAST: still claims gap (destination ok as isolate-expand; evidence thin).
- Contrast wrong + prompt: OK.
- TRANSFER Why after sign error: OK.
- Transfer declines with escalation: OK.

---

## Scorecard

| # | Scenario | Verdict | One-line issue |
|---|---|---|---|
| 1 | all correct | **BUG-ish** | After perfect MAIN, Why invents “moderate errors” |
| 2 | transfer sign | **PARTLY ODD** | Systemic false gap after entry; RULE transfer OK; sign catch OK |
| 3 | transfer decline | **PARTLY ODD** | Assist on correct expand; “moderate errors” after correct contrast |
| 4 | bare final z | **PARTLY ODD** | False gap → generated; bare `-2` correctly not dist-blamed |
| 5 | wrong_then_correct + correct | **PARTLY ODD** | Contrast never shown; otherwise clean short path |
| 6 | wrong_then_correct + sign | **PARTLY ODD** | “Some wrong attempts” after perfect MAIN; contrast/transfer OK |
| 7 | wrong_then_correct + decline | **BUG-ish** | “Moderate errors” after perfect MAIN; contrast skipped |
| 8 | wrong_then_correct + bare z | **PARTLY ODD** | Soft gap claim after perfect MAIN; bare z OK |
| 9 | decline + correct transfer | **PARTLY ODD** | False “moderate errors”; decline assist doesn’t escalate |
| 10 | decline + sign | **PARTLY ODD** | Generated decline → MAIN recovery good; entry gap wording |
| 11 | decline + decline | **PARTLY ODD** | Jump to transfer “after instruction” overclaims |
| 12 | decline + bare z | **PARTLY ODD** | Same as 9 + “option 0” jargon; bare z OK |
| 13 | wrong_twice + correct | **PARTLY ODD** | Contrast never shown; all-correct path |
| 14 | wrong_twice + sign | **BUG-ish** | “Many wrong answers” after perfect MAIN |
| 15 | wrong_twice + decline | **BUG-ish** | “Many wrong answers” after perfect entry (zero wrongs) |

**Counts:** OK 0 · PARTLY ODD 11 · BUG-ish 4

---

## What looks healthy

- Deterministic invalidation of sign-product mistakes with explicit equations.
- Bare final answer rejected as non-equation / non-transform (`AI_FALLBACK`), **not** as a distribution skill gap.
- RULE “fixed diagnostic sequence” transitions are boring but honest.
- After real contrast sign errors, transfer Whys that cite `(-3)(-4)` / sign rules match the trail.
- Generated-main double decline → another MAIN (mix_010) is a sensible practice loop.

## Highest-priority Why bugs (for later engine work)

1. Stop claiming **errors / moderate errors / many wrong answers** when the just-finished item is all VALID correct (mix_001, 007, 014 especially).
2. Soften or rephrase post-entry “likely gap in LIN_DISTRIBUTE_NEG” to **probe / not-yet-assessed** language when the only evidence is a correct two-step solve.
3. Don’t attach `RULE_PROMPT` assistance to a one-shot correct contrast expand (mix_003).
4. Avoid leaking choice labels like “option 0” into Why text (mix_012).
