# Interaction formats (game-like answers)

Status: **implemented**, on by default, one kill switch (`COGNA_GAME_FORMATS=off`).

Students in the pilot can answer some questions by building the answer from tiles instead of typing it: a **bracket bridge** (two brackets for x² + bx + c), **split it** (a full factorisation, boxes may stay empty) and a **term builder** (an expansion, one signed term per box). Practice also gets a **factor safe** (two dials with live product and sum lamps).

## The rule that makes this safe

A format changes how a student *enters* an answer, never how it is *marked*.

1. **The server builds the tiles** (`apps/api/src/interaction-formats/tile-builder.ts`) from the verified answer key and the item's known mistakes (Lotus `predictedMistakes`). Wrong tiles are the pieces of real mistakes: swapped signs, the other factor pair, the unfinished factor (x² − 9), part of a common factor (6 instead of 6x), the unmultiplied term (+ 2 in 3(x + 2)).
2. **Every tile set is checked before use.** The right picks must assemble into an answer the algebra engine marks `CORRECT` for the expression, every tile must parse, and there must be wrong tiles to choose. Otherwise the function returns null and the question stays typed. No model is involved.
3. **The browser sends picks, not answers.** `assembleTileAnswer` (in `@cogna/shared`) turns picks into plain answer text. The server re-runs it against the interaction it issued and marks that text with the existing code (`instantVerdict`, `taskVerdict`, `checkPracticeAnswer`). Whatever answer text the browser sends alongside is ignored.
4. **No answer key in the payload.** `TileBuildInteraction` carries the expression, the frame, the box count and the tile labels only.

## Where each stage uses it

| Stage | Which questions | Rules |
|---|---|---|
| Lotus diagnostic | `FACTORISE` items only, on turn 1, on every turn the plan repurposed (check / descent / widen), and every third coverage turn (`lotus-interactions.ts`). | No feedback, as before. A tile question drops the working request; the other ~60 % stay typed with working, which is the richest evidence. A repurposed check is in a different format from the evidence that raised the suspicion, so a gap confirmed in two formats isn't a format effect. The student can still choose "I don't know". Picks and "took a tile back out" counts are stored on the audit as weak evidence only. |
| Independent exit | Any exit with a code-checkable `exitCheck` (factorise or expand). | One attempt, enforced on the server (`409` on a second). The expected answer is blank in the view until the attempt is made. Only constructed formats are allowed. The scene plays its finishing move, then the picks are sent. |
| Practice | Code-generated sets gain a `build` item per family and a `factor-safe` item for trinomials. | Feedback, retries and worked steps as for other practice. The lesson verifier also checks these two formats, so salvaged and fake-author sets still pass. |

## Contracts

- `packages/shared/src/contracts/interaction-formats.ts`: `TileBuildInteraction`, `TileBuildResponse`, `assembleTileAnswer`, `INTERACTION_FORMATS`, `formatAllowedAt`.
- `LotusQuestion.interaction?`, `LotusStudentResponse.interaction?`.
- `PersonalizedVideoExitItem.interaction?`. `expected` is now blank before the attempt.
- `PracticeItem` gains `factor-safe` and `build`, and `PracticeAnswer` gains `{ picks }`.

## Web

`apps/web/src/components/games/TileGame.tsx` holds `TileGame` (bridge / crystal / lantern themes by format) and `FactorSafe`. They are used by the Lotus student page, the exit stage of the lesson page and `PracticeArena`. The component shows no right/wrong in the diagnostic or exit; it only reports picks.

## Tests

`apps/api/test/golden/interaction-formats.v1.spec.ts` (20 tests) covers:
- tile building and safety;
- picks that are tampered with or incomplete;
- the Lotus policy and kill switch;
- the server rebuilding the answer from the picks rather than the browser's text;
- the practice formats;
- the exit: one attempt, answer hidden before the attempt, and incomplete picks not using up the attempt.

## Open before relying on it for reports

- **Calibration.** Give the same skill in typed and tile form to the same pilot children. Until the results agree, tile answers should be read alongside typed ones, not instead of them.
- **More tile games** (spot the impostor, fishing, firefly catch, garden fences) are prototyped in the Interaction Lab but need new item kinds in Lotus. They are not built here.
- **Read-aloud** for questions is prototyped with recorded Cartesia audio. Live narration needs a server text-to-speech route.
