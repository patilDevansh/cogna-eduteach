# Cogna MVP 9.0.1 — Build Care

> Pitfalls and care items for Phase A / A2. Check off when enforced.

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
- [x] **Phase C buffer hit rate is an observation metric, not a correctness gate.** Log `diagnostic_v2_buffer.hit` / `.miss` / `.filled` and tune session cap (~2–3) from hit rate; never raise `TIMEOUT_MS` to compensate for a cold buffer.
- [x] **Phase D report polish: numbers are a hard gate.** Forbidden-term reject alone is not enough — every count / % / mastery figure in AI prose must appear in `structuredData` (`report-numeric-gate.ts`). Flags default OFF in `.env.example`.
