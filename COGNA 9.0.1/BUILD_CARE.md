# Cogna MVP 9.0.1 — Build Care

> Pitfalls and care items for Phase A / A2 / B1. Check off when enforced.

## Care items

- [x] **The plain-English README is a claim about the code; if they disagree, the README is the bug.** (`README.md` must describe what ships, not what we hope to ship. Updated in Phase A2 / D1.)
- [x] **AI's claimed answer is never trusted.** Authored items are re-solved independently; a mismatch is rejection, not correction. (`diagnostic-v2-authoring.ts`)
- [x] **Origin is stated, never inferred from an item-key prefix.** Pre-written / template-rendered / AI-authored are stored on the attempt row so a generated transfer item cannot be mistaken for an ordinary one.
- [x] **History that enters the selector prompt is labelled.** Cross-session micro-skill state is carried, but every skill line is marked `this session` or `earlier` so the model can weigh it. (D3 — owner locked.)
- [x] **A different seed is not enough — the rendered question text must differ.** `renderFreshInstance` re-rolls on collision against already-served opening lines. (D2)
- [x] **Bracket first-invalid checks the variable coefficient before constant deltas.** Outer-sign drop (`OUTER_SIGN_DROPPED`) must not share `NEGATIVE_SIGN_PRODUCT` with the canonical Arun error; a correctly expanded bracket with a vanished outer constant is `OUTER_CONSTANT_DROPPED`, not generic bracket blame.
- [x] **T5 live walkthrough cleaned up after itself.** Dedicated student / session / audit / evidence rows created for the live run were deleted; temporary harness scripts were removed.
- [x] **Local API/web must not share the agent shell's process group.** Cursor agent shell cleanup kills background `node dist/main.js` / `pnpm dev` children (API+web die together, `exit_code: unknown`, no Nest stack). Start with Python `subprocess.Popen(..., start_new_session=True)` and log to `tmp/cogna-api.log` / `tmp/cogna-web.log`. Plain `nohup` is not enough on macOS. `main.ts` now logs `unhandledRejection` / `uncaughtException` without exiting on rejection.
- [x] **Selector RULE fallback always carries a plain-language reason.** AI timeout / reject paths that fall back to the rule sequence include `Rule sequence: …` so the testing-only "Why this question" panel is never blank on RULE.
- [x] **"Why this question" is debug-only (`?debug=1`).** Live selectorDecision reasoning (AI or RULE) is shown near the working area and at the top of the debug panel; student chrome without debug is unchanged.
- [x] **Fraction clearing has its own first-invalid codes.** Swapped LCD, dropped term, and sign flip after clearing must not share generic `NOT_EQUIVALENT` — see `fraction-linear-verifier.ts` (`BUILD_PLAN_B.md`).
- [x] **Session routes by track/grammar, not one mega-parser.** Negative-distribution default track must stay byte-stable; fraction track opts in via `track: "FRACTION_LINEAR"`.
- [x] **AUTHOR stays off for fraction grammar in B1.** Templates + `verifyRendered` only; B1.5 reuses the A2 authored-item gate.
- [x] **Any new raw-text reader folds minus lookalikes** through the shared `foldMinusLookalikes()` helper (A2 D4 lesson) — including fraction templates and verifier string scans.
- [x] **Selector Why must not say "option N".** Live UI audit (`UI_FRACTION_AUDIT.md`) caught choice-index jargon; `OPTION_INDEX_PATTERN` rejects it and the selector prompt forbids it.
- [x] **Step API returns `firstInvalidActionCode`.** Description alone left the client unable to show stable codes (WRONG_COMMON_MULTIPLE etc.).
- [x] **Fraction prompts display as stacked fractions** in the Given/working area (`MathLine`); slash ASCII remains the input/API format.
- [x] **Home always surfaces Start fractions check** for returning students (not only first-time / no-history).
- [ ] **Interpreter hypotheses should prefer the current item's primary skill / this-session evidence.** Shared demo-student history makes "What we think is going on" narrate unrelated skills (e.g. LIN_REMOVE_CONSTANT during fraction clear).
- [x] **B2 identity track is a separate verifier.** `IDENTITY_DIFF_SQUARES` uses `identity-expr-verifier.ts` — never the fraction or bracket mega-parser.
- [x] **Fraction clearing stays fraction-safe.** B1 `fraction-linear-verifier` owns LCD / dropped-term / sign-after-clear codes; Rational/Frac syntax does not fall through the bracket mega-parser.
- [x] **Every Phase B topic rebuilds the three-piece kit.** Parser → independent solver → first-invalid finder. Do not reuse bracket/fraction/identity diffing for factorisation or quadratics.
- [x] **Factorisation compares polynomials, not strings.** Factor order may swap; incomplete forms (`k(quadratic)`, decimals) are `INCOMPLETE_FACTORISATION`, not a wrong-pair code.
- [x] **B3 non-monic transfer is intentional.** Owner example `2x²−5x−3` uses `FAC_NONMONIC_GROUP` on transfer while the track id stays `FACTOR_MONIC_TRINOMIAL`.
- [x] **B4 rejects non-integer-factorable quadratics.** Content gate + runtime `NOT_INTEGER_FACTORABLE`; roots are checked by substitution, not trusted from the student string alone.
- [x] **AUTHOR stays off for B3/B4** until B3.5 / B4.5 (same B1 → B1.5 pattern).
