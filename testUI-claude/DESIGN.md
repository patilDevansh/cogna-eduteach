# Cogna — design notes

## Direction: “the quiet classroom”

Pale sage paper, spruce-green ink, a faint graph-paper grid on learning surfaces, and
one signature element: the **worked line** — a ruled underline beneath every equation,
echoing a notebook baseline. The landing hero uses it literally: `2x + 5 = 17` quietly
solves itself in three timed steps.

This deliberately avoids purple SaaS gradients, cream/terracotta brochure serifs, dark
mode, pill clusters, and hero sticker overlays.

## Tokens (see `src/app/globals.css`)

- **Color** — `--bg #f4f7f3` (sage paper), `--ink #16241d` (spruce ink),
  `--accent #0e6b54`, `--success #17734f`, `--caution #a2660d`, `--surface #fff`.
  Correct/incorrect never rely on color alone (check / gentle mark icons + words).
- **Type** — Bricolage Grotesque (display), Instrument Sans (body),
  IBM Plex Mono (equations + access codes). Loaded via Google Fonts `<link>`.
- **Motion** — three purposeful moves only: `phase-in` (question/phase change),
  `settle` + drawn check (feedback), `breathe` (break screen).
  `prefers-reduced-motion` disables all of them.

## Decision-driven practice

`src/components/PracticeSession.tsx` renders strictly from the last
`Decision { uiAction, learningIntent }`. It never chooses a teaching move; it asks
`src/lib/api.ts` and renders whichever of `SHOW_QUESTION / SHOW_HINT /
SHOW_EXPLANATION / SUGGEST_BREAK / END_SESSION` comes back. Hints stack as a ladder;
explanations are the approved step lists; the session hard-ends at 15 minutes.

## API client

`src/lib/api.ts` speaks the real contract. With `NEXT_PUBLIC_COGNA_API_URL` set, every
call goes to the backend. Without it, a small local orchestrator produces decisions from
the human-reviewed bank in `src/lib/content.ts` so the whole product is demoable
offline. No math is ever generated at runtime; concept IDs are always mapped to human
labels before display.

## Copy rules honored

Students never see mastery numbers, misconception IDs, or clinical language — only the
approved phrasings (“this pattern needs another check”, “time for a short break”).
Parent letters separate **What happened** (observations) from **What it might mean**
(cautious, with an explicit certainty line) and end with one short next practice
suggestion plus an uncertainty note.

## Run

```bash
npm install
npm run dev        # demo mode, everything works offline
# or point at the backend:
NEXT_PUBLIC_COGNA_API_URL=https://api.cogna.app npm run dev
```

Demo student access code: **MATH42**. Parent login accepts any email locally.
