# Diagnostic-v2 eval: data, AI Why, and improvements

**Sources:** `index-100.json` (100 runs), `EVAL_FIRST_15.md`, individual `runs/*.json`  
**Method:** Read-only ledger review. Detailed walkthrough = first 15; patterns + priorities use the full 100 plus a skim of runs 16–30 and error-heavy mains.  
**Does not contradict** `EVAL_FIRST_15.md` — this report expands it with quoted Why text, trails, and batch quantification.  
**No engine changes. No re-collection.**

**Verdict labels** (same as EVAL_FIRST_15)

| Label | Meaning |
|---|---|
| **OK** | Destination and Why fit the trail (minor boilerplate ok) |
| **PARTLY ODD** | Destination mostly fine, but Why misstates evidence, or assistance/path is weird |
| **BUG-ish** | Clear misread of the trail (errors claimed where none exist, or similar) |

---

## A. How to read a ledger

Each run file is an ordered session trail. Walk it top to bottom:

### Question block (`items[]`)

| Field | Meaning |
|---|---|
| `question.itemKey` | Stable id (`ENTRY_TWO_STEP`, `NEG_DIST_MAIN`, `GEN_NEG_DIST_…`, `NEG_DIST_CONTRAST`, `TRANSFER_NEG_DIST`, …) |
| `question.equationPrompt` | What the student saw |
| `question.stageId` | Curriculum stage (when present) |

### Steps (`steps[]`) — what was collected

| Field | Meaning |
|---|---|
| `previousLine` → `submittedLine` | Algebraic trail (or empty on decline) |
| `intent` | Collector behaviour: `correct`, `wrong_sign_product`, `dont_know`, `bare_number_final`, … |
| `validity` | `VALID` / `INVALID` / null (declines) |
| `verificationSource` | e.g. deterministic checker vs `AI_FALLBACK` |
| `firstInvalidActionDescription` | Why the step failed (when INVALID) |
| `assistanceOffered` / `assistanceMessage` | `RULE_PROMPT`, `FULL_EXPLANATION`, or null |

### Next-question Why (`nextQuestionWhy`) — what the AI/rules said

| Field | Meaning |
|---|---|
| `source` | `AI` (selector prose) or `RULE` (fixed sequence) |
| `reasoning` | Human-readable Why-this-question text (often null/boilerplate on RULE) |
| `nextItemKey` / `nextEquationPrompt` | What came next |
| `origin` | `PRE_WRITTEN` (bank item) or `TEMPLATE_RENDERED` (generated) |

**How to judge:** Does the Why’s *evidence claim* match the steps just above it? Destination can be pedagogically fine while the wording is still wrong.

---

## B. First 15 — data collected + AI response

### 1. `mix_001` — all correct  
**Intent:** entry/varBoth/main/contrast/transfer all `correct`  
**Path:** ENTRY → MAIN → TRANSFER (contrast never shown)

**Trail**
1. `3x + 5 = 20` → `3x = 15` → `x = 5` (VALID/correct ×2)
2. `-2(x - 5) + 3 = 11` → `-2x + 10 + 3 = 11` → `-2x + 13 = 11` → `-2x = -2` → `x = 1` (VALID ×4)
3. `-4(z - 2) + 3 = 19` → … → `z = -2` (VALID ×4)

**AI/RULE Why**
- After entry → MAIN: *“The student shows a likely gap in LIN_DISTRIBUTE_NEG, so presenting the NEG_DIST_MAIN item…”*
- After perfect MAIN → TRANSFER: *“The student shows a likely gap in LIN_DISTRIBUTE_NEG **with moderate errors and no help**, so the next question should be a transfer check…”*

**Judgment: BUG-ish** — Destination (probe then transfer) is defensible; “moderate errors” after zero wrongs is a trail misread.

---

### 2. `mix_002` — transfer `arun_sign_twice`  
**Intent:** transfer sign error  
**Path:** ENTRY → MAIN (perfect) → TRANSFER (one wrong sign)

**Trail**
1. Entry perfect → AI Why: *“likely gap in LIN_DISTRIBUTE_NEG… not yet seen NEG_DIST_MAIN”*
2. MAIN perfect → **RULE** → TRANSFER: *“Rule sequence: next item in the fixed diagnostic sequence.”*
3. Transfer: `-4(z - 2) + 3 = 19` → `-4z - 8 + 3 = 19` **INVALID** — *“(-4)(-2) was evaluated as -8, but … gives 8.”* (one attempt; name says “twice”)

**Judgment: PARTLY ODD** — False gap after entry; RULE transfer honest; sign diagnosis OK.

---

### 3. `mix_003` — transfer decline ×2  
**Path:** ENTRY → VAR_BOTH → MAIN (perfect) → CONTRAST (correct!) → TRANSFER decline ×2

**Trail highlights**
- After perfect MAIN → CONTRAST: *“likely gap in LIN_DISTRIBUTE_NEG, so giving a focused expansion task…”*
- Contrast: `-3(y - 4)` → `-3y + 12` **VALID/correct** but `assistanceOffered: RULE_PROMPT`
- After that → TRANSFER: *“…with **moderate errors**… transfer check…”*
- Transfer: decline → RULE_PROMPT, decline → FULL_EXPLANATION

**Judgment: PARTLY ODD** — Assist on a correct one-shot expand; invented “moderate errors” after correct contrast.

---

### 4. `mix_004` — transfer bare final `z`  
**Path:** ENTRY → generated `-3(x - 6) + 4 = 10` decline ×2 → TRANSFER (correct until bare `-2`)

**Trail highlights**
- Entry Why → GEN: *“likely gap… generating a TPL_NEG_DISTRIBUTION question…”* (`TEMPLATE_RENDERED`)
- Declines escalate RULE_PROMPT → FULL_EXPLANATION; RULE → TRANSFER
- Transfer to `-4z = 8`, then submit `-2` → **INVALID** via `AI_FALLBACK` (*“does not represent a valid transformation…”*) — **not** framed as distribution gap

**Judgment: PARTLY ODD** — Systemic false-gap wording; bare-final handling is healthy. Scenario expected contrast-correct path; collector routed via generated main instead.

---

### 5. `mix_005` — contrast `wrong_then_correct`, transfer correct  
**Path:** ENTRY → MAIN → TRANSFER (all correct). **No contrast.**

**Why:** Entry false-gap → MAIN; perfect MAIN → **RULE** TRANSFER (honest).

**Judgment: PARTLY ODD** — Scenario’s contrast behaviour never fired; short all-correct path is otherwise coherent.

---

### 6. `mix_006` — contrast wrong-then-correct, transfer sign  
**Path:** ENTRY → VAR_BOTH → MAIN (perfect) → CONTRAST wrong → TRANSFER wrong sign

**Why quotes**
- After perfect MAIN → CONTRAST: *“…with **some wrong attempts**… expansion-only question…”* — **false** (MAIN had no wrongs)
- After contrast `-3y - 12` INVALID (sign product named) → TRANSFER: *“…sign errors in multiplying negatives…”* — **matches trail**
- Transfer: `-4z - 8 + 3 = 19` INVALID (sign product) — OK; one attempt

**Judgment: PARTLY ODD** — Invented MAIN errors; contrast/transfer diagnosis solid.

---

### 7. `mix_007` — contrast wrong-then-correct, transfer decline  
**Path:** ENTRY → MAIN (perfect) → TRANSFER decline ×2. **No contrast.**

**Why after perfect MAIN:** *“…with **moderate errors**… check transfer after initial teaching…”*

**Judgment: BUG-ish** — Zero MAIN errors; “moderate errors” / “after teaching” invents a failure history. Contrast never shown.

---

### 8. `mix_008` — contrast wrong-then-correct, transfer bare `z`  
**Path:** ENTRY → VAR_BOTH → MAIN (perfect) → CONTRAST wrong → TRANSFER bare `-2`

**Why:** After perfect MAIN → CONTRAST claims gap / still “working on LIN_REMOVE_COEFFICIENT” (stretch). Transfer Why correctly cites `(-3)(-4)` sign error. Bare `-2` → format INVALID (`AI_FALLBACK`). Also leaks *“option 0”* in Why text.

**Judgment: PARTLY ODD** — Soft gap claim + jargon; sign catch and bare-z handling OK.

---

### 9. `mix_009` — contrast decline ×2, transfer correct  
**Path:** ENTRY → VAR_BOTH → MAIN (perfect) → CONTRAST decline ×2 → TRANSFER all correct

**Why:** After perfect MAIN → CONTRAST *“…with **moderate errors**…”* (false). Both declines get `RULE_PROMPT` only (no FULL_EXPLANATION escalate — unlike transfer declines). Transfer Why *“recently said they do not know how to start”* — **fits**. Then student nails full transfer.

**Judgment: PARTLY ODD** — False error count; mild assist-escalation inconsistency; routing after don’t-know is coherent.

---

### 10. `mix_010` — contrast decline, transfer sign  
**Path:** ENTRY → GEN `-4(y - 2) + 1 = -11` decline ×2 → MAIN (perfect) → TRANSFER wrong sign. **Contrast intent not shown.**

**Why:** Entry false-gap → GEN. After declines → MAIN: *“…another NEG_DIST_MAIN… practice on starting…”* — **good recovery destination**. Perfect MAIN → RULE TRANSFER. Sign catch OK.

**Judgment: PARTLY ODD** — Entry wording systemic; recovery path healthy.

---

### 11. `mix_011` — contrast decline, transfer decline  
**Path:** ENTRY → GEN `-5(z - 5) + 2 = 12` decline ×2 → TRANSFER decline ×2 (**skips MAIN/CONTRAST**)

**Why after declines:** *“…planned transfer check… to assess learning **after instruction**.”*  
They only got RULE_PROMPT + FULL_EXPLANATION on declines — thin “instruction,” aggressive jump to transfer.

**Judgment: PARTLY ODD** — Destination aggressive; Why overclaims.

---

### 12. `mix_012` — contrast decline, transfer bare `z`  
**Path:** ENTRY → VAR_BOTH → MAIN (perfect) → CONTRAST decline ×2 → TRANSFER bare `-2`

Same pattern as mix_009 (false gap → CONTRAST; double RULE_PROMPT only). Why includes **“(option 0)”**. Bare `-2` correctly format-invalidated.

**Judgment: PARTLY ODD**

---

### 13. `mix_013` — contrast wrong twice, transfer correct  
**Path:** ENTRY → MAIN → TRANSFER (all correct). **No contrast.**

Same as mix_005: false-gap probe; RULE transfer; intended `wrong_twice` contrast never executed.

**Judgment: PARTLY ODD**

---

### 14. `mix_014` — contrast wrong twice, transfer sign  
**Path:** ENTRY → MAIN (perfect) → CONTRAST wrong → TRANSFER wrong sign

**Why after perfect MAIN:** *“…with **many wrong answers**… NEG_DIST_CONTRAST…”* — strongest false evidence claim in this batch.  
Contrast/transfer sign diagnosis OK.

**Judgment: BUG-ish**

---

### 15. `mix_015` — contrast wrong twice, transfer decline  
**Path:** ENTRY → MAIN (perfect) → CONTRAST wrong → TRANSFER decline ×2

**Why after perfect entry (zero wrongs):** *“…with **many wrong answers**; presenting … NEG_DIST_MAIN…”*  
After MAIN → CONTRAST still claims gap (destination ok as isolate-expand). Contrast wrong + transfer Why citing sign misapplication: OK. Declines escalate correctly.

**Judgment: BUG-ish** — Invented history on the first transition.

---

### First-15 scorecard (aligned with EVAL_FIRST_15)

| # | Verdict | One-line |
|---|---|---|
| 1 | **BUG-ish** | “Moderate errors” after perfect MAIN |
| 2 | **PARTLY ODD** | Entry false gap; RULE + sign OK |
| 3 | **PARTLY ODD** | Assist on correct expand; invent errors after |
| 4 | **PARTLY ODD** | False gap → GEN; bare `-2` healthy |
| 5 | **PARTLY ODD** | Contrast skipped |
| 6 | **PARTLY ODD** | “Some wrong attempts” after perfect MAIN |
| 7 | **BUG-ish** | “Moderate errors” after perfect MAIN; contrast skipped |
| 8 | **PARTLY ODD** | Soft gap + option 0; bare z OK |
| 9 | **PARTLY ODD** | False moderate errors; decline assist flat |
| 10 | **PARTLY ODD** | GEN decline → MAIN recovery good |
| 11 | **PARTLY ODD** | Jump to transfer “after instruction” |
| 12 | **PARTLY ODD** | option 0 + decline pattern |
| 13 | **PARTLY ODD** | Contrast skipped; short correct path |
| 14 | **BUG-ish** | “Many wrong answers” after perfect MAIN |
| 15 | **BUG-ish** | “Many wrong answers” after perfect entry |

**Counts:** OK 0 · PARTLY ODD 11 · BUG-ish 4  
**Of first-15 Why texts that invent error counts after a perfect item:** **7** (mix_001, 003, 006, 007, 009, 014, 015).  
**“Likely gap” language after perfect entry:** nearly every AI transition off ENTRY in this batch.

---

## C. Patterns across the batch (not just 15)

From `index-100.json` (100 sessions) + skim of runs 16–30 and error-heavy mains:

### What keeps happening

| Pattern | Scale / notes |
|---|---|
| **False “likely gap” after perfect work** | ~**216** Why texts mention “likely gap”; **~79** after perfect ENTRY alone (of ~123 entry transitions). Systemic selector boilerplate, not rare. Runs 16–30 still show ENTRY_GAP almost every AI hop. |
| **Invented error severity** (“moderate errors” / “many wrong answers” / “some wrong attempts”) | **15** Whys in the full batch; **14** of those after an item that was all VALID/correct. Strongest bugs: mix_001, 007, 014, 015; also mix_017, 066, 077, 078, 081, 084, 085. |
| **Sign-product checks look solid** | **~79** INVALID steps with explicit sign-product messaging. On real wrongs (mix_017–030 mains), AI Why often correctly cites `(-2)(-5)` / multiplying negatives — healthy when evidence exists. |
| **Bare final `z` / bare number** | **~40** bare-number INVALIDs sampled; consistently `AI_FALLBACK` “not a valid transformation…”, **not** blamed as LIN_DISTRIBUTE_NEG. Good. |
| **Contrast skipped when scenario wanted wrong/decline** | **10** runs where contrast intent was non-`correct` but no CONTRAST item appeared (e.g. mix_005, 007, 010, 011, 013, 046, 047, 071, 076, 080). Selector jumped ENTRY→MAIN→TRANSFER or via GEN. |
| **“option 0” jargon** | **6** Whys (mix_008, 012, 021, 032, 068, 087) — internal choice label leaking into student-facing reasoning. |
| **`RULE_PROMPT` on correct contrast expand** | **25** assists on VALID `correct` steps — **all** on `NEG_DIST_CONTRAST` (mix_003 is the first-15 exemplar). |
| **RULE vs AI honesty** | RULE transitions (“fixed diagnostic sequence”) are boring but evidence-safe. AI destinations are often fine; **evidence claims** are the failure mode. |
| **When real errors exist, Why improves** | After actual MAIN sign wrongs (runs ~17–30), Why frequently names the specific product error and routes to CONTRAST — the behaviour we want, when grounded. |

### What looks healthy (keep)

- Deterministic invalidation of sign-product mistakes with equation-level text.
- Bare final answer rejected as format/transform, not as a distribution skill gap.
- RULE “fixed sequence” transitions do not invent errors.
- After real contrast sign errors, transfer Whys that cite `(-3)(-4)` match the trail.
- Generated-main double decline → another MAIN (mix_010) is a sensible practice loop.

---

## D. Where we need improvement (prioritized)

### 1. Highest impact / clearest bugs

#### 1a. Selector Why invents failures (error counts / “moderate errors”)

- **What’s wrong:** After all-VALID correct items (especially MAIN or ENTRY), AI Why claims “moderate errors,” “many wrong answers,” or “some wrong attempts.” Destination may still be a reasonable probe/transfer; the **causal evidence is false**.
- **Evidence:** First 15: mix_001, 003, 006, 007, 009, 014, 015. Full batch: **14** invent-after-perfect cases including mix_017, 066, 077–078, 081, 084–085.
- **Fix direction:**
  - Ground Why in structured evidence: `independentFailureCount`, INVALID step count this session/item, assistance count.
  - **Hard constraint:** forbid phrases like “errors / wrong answers / wrong attempts” when `independentFailureCount === 0` (or when the just-finished item has zero INVALIDs).
  - Prefer confirm/probe language: “not yet assessed on LIN_DISTRIBUTE_NEG” rather than “shows a gap with moderate errors.”

#### 1b. Systemic false “likely gap in LIN_DISTRIBUTE_NEG” after perfect entry

- **What’s wrong:** Successful `3x + 5 = 20` is routinely narrated as evidence of a distribution gap. Curriculum *probing* is fine; claiming a **gap** is not.
- **Evidence:** Near-universal in AI entry Whys (first 15 + runs 16–30); ~79 quantified after perfect ENTRY.
- **Fix direction:** Prompt/template: after correct non-target skill work, say **“next planned probe / not yet assessed”**; reserve “gap” for observed INVALID distribution steps or explicit don’t-know on a dist item.

---

### 2. Medium (prompt / labelling / assistance)

#### 2a. `RULE_PROMPT` attached to a one-shot correct contrast expand

- **What’s wrong:** Student submits `-3y + 12` VALID/correct and still gets a sign-product prompt.
- **Evidence:** mix_003; **25** such assists across the 100-batch, all on `NEG_DIST_CONTRAST`.
- **Fix direction:** Only offer RULE_PROMPT on INVALID or decline; never on VALID+correct first attempt.

#### 2b. “option 0” (and similar) leaking into Why

- **What’s wrong:** Internal selector choice labels appear in reasoning text.
- **Evidence:** mix_008, 012, 021, 032, 068, 087 (6 Whys).
- **Fix direction:** Strip choice indices from the Why renderer; refer to item keys / plain descriptions only.

#### 2c. Overclaiming “after instruction” / thin teaching → transfer

- **What’s wrong:** After declines + explanations only (or after perfect MAIN with no teaching failure), Why says transfer will “assess learning after instruction.”
- **Evidence:** mix_007, mix_011; similar wording elsewhere.
- **Fix direction:** Gate “after instruction” on real teach events; if jumping to transfer after declines only, say “check despite incomplete practice” or prefer another MAIN first (as mix_010 does well).

#### 2d. Contrast assist escalation inconsistency

- **What’s wrong:** Transfer declines escalate RULE_PROMPT → FULL_EXPLANATION; contrast double-decline sometimes stays on RULE_PROMPT ×2.
- **Evidence:** mix_009, mix_012 vs mix_003/007 transfer declines.
- **Fix direction:** Same escalation policy across stages.

#### 2e. Scenario intent vs actual path (collector / routing observability)

- **What’s wrong:** Mix labels expect contrast wrong/decline behaviours that never appear when the selector skips CONTRAST.
- **Evidence:** **10** contrast-skip runs (mix_005, 007, 010, 011, 013, …).
- **Fix direction:** Not necessarily a student-facing bug — log “intended stage not reached” in eval notes; optionally bias selector to hit CONTRAST when probing sign after MAIN success if that is product intent.

---

### 3. Nice-to-have / Phase B

| Item | Notes |
|---|---|
| Soften skill-tag jargon in Why (`LIN_DISTRIBUTE_NEG`, `LIN_REMOVE_COEFFICIENT`) | Fine for ops; consider student-safe paraphrases if Why is ever shown in UI. |
| Scenario name vs attempts (“sign_twice” with one wrong) | Collector ends session early; rename or allow second attempt for eval fidelity. |
| Prefer RULE wording when evidence is empty | RULE is already honest; use AI only when there is a concrete INVALID or don’t-know to cite. |
| Generated-item recovery loop | Keep mix_010-style “decline on GEN → another MAIN”; avoid mix_011-style skip-to-transfer as default. |
| Phase B: automated Why-vs-evidence lint | Unit/golden checks: if failureCount=0, reject Why containing error-severity phrases. |

---

## Appendix — quick owner checklist

1. **Stop inventing errors** when the trail is clean.  
2. **Stop calling probes “gaps”** until distribution work actually fails.  
3. **Keep** sign-product INVALID text and bare-final format handling.  
4. **Strip** “option 0”; **don’t assist** correct expands.  
5. Optionally **lint Why against evidence counts** before shipping selector copy.

---

*Companion:* [`EVAL_FIRST_15.md`](./EVAL_FIRST_15.md) (run-by-run judgments). This file is the owner-facing data + AI + improvements report.
