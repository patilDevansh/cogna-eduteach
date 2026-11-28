# Personalized Area chapter: build plan

Every child moves through the same topics in the same order, but each 20-minute session is built from that child's own answers.

Pilot-ready in about 11 weeks, with the work split equally between Devansh and Tanay (45 days each, about 10 spare days each).

## What we're building

| Part | What it is |
|---|---|
| Cards | 12 for Area, rhombus included. Each holds the idea's kind, its known mistakes, an optional one-line story, a check question with trap answers, and the fix for each trap. |
| The map | Which card stands on which, like floors of a building. |
| Meters | A confidence score per child per skill, updated after every answer by plain statistics. |
| The rules | Fixed code that decides what goes into a session: the gates, the miss ladder, the daily limits, ending on a win, and teacher flags. |
| The pieces | Reusable hands-on templates, short Maji Watches, and practice sets. |
| The AI planner | Suggests each child's next session, overnight or right after a session ends. The rules check its plan before anything reaches the child. |
| Two screens | A progress map for the child and a "who's stuck on what" list for the teacher. |

## How we're building it

| Principle | What it means |
|---|---|
| Area is the test | Once it works, a new chapter means new cards and a new map, not a new system. |
| Cheap before expensive | Run Aarav through the chapter on paper before any animation gets built. |
| Code decides, AI suggests | The rules always have the final say. If the AI's plan breaks a rule, the plain rules take over. |
| Templates, not one-off lessons | Each hands-on piece is a template. A new card only changes its shapes and numbers. |
| Log everything | Every answer, plan and unexpected mistake is saved. That's how the cards and meters improve, and it's the proof for schools. |

## The five steps

| Step | What gets made | Done when |
|---|---|---|
| 1. Cards | All 12 Area cards, with every trap answer and its fix written out, checked against published research on common misconceptions. | A reviewer can read each card and agree with it. |
| 2. Map and starting meters | The map drawn by hand, plus starting meters set from the existing diagnostic. | Aarav's 10 days can be worked out on paper from the cards and map alone. Then 5 real students go through on paper before anything expensive is built. |
| 3. Core engine | Meters, gates, the miss ladder (hands-on → worked example → step down a floor → stop and flag), the 20-minute unit builder, daily limits, and logging. | A fake student clicking through gets sensible sessions, and every decision can be explained. |
| 4. Pieces | 4 Rive hands-on templates (drop a height, cut and slide, zoom into a square metre, squares on the sides), short Watches through the video pipeline, and practice sets with trap answers as wrong options. The farm setting is replaced. | Every card has its pieces, built from templates. |
| 5. AI planner | A planner that reads a child's answers and working and proposes the next session from approved pieces. The rules check every plan, and it runs alongside the plain rules so the two can be compared. | For every child, both plans are logged and the rule-checked one is used. |

## Cut to fit two people

| Cut | Instead |
|---|---|
| 6 hands-on templates → 4 | Push the deck and split a shape become Watches for now. |
| Full teacher dashboard | A simple daily list of who's stuck on what. |
| AI planner live at launch | Live only if ready by Week 9. Otherwise it logs its plans in the background during the pilot while the rules decide. |

## Risks

| Risk | What we do |
|---|---|
| Rive work runs slow | Drop a hands-on template and use a Watch in its place. |
| No slack with two people | If either of us is out for a week, everything slides a week. About 10 spare days each, plus Week 10, are the buffer. |
| School meetings eat time | The other person picks up a Rive or Watch task to keep things moving. |
| No maths reviewer yet | Start looking in Week 1, not Week 8. A teacher we know, paid per chapter, is enough. |
| Meters start as guesses | Seed them from the diagnostic and tune them weekly from the logged answers. |

## Parked for later

| Idea | What it is |
|---|---|
| Live AI explanations | Maji writes and speaks a live explanation of each child's exact mistake, on top of the pre-built visuals. To test after the pilot starts. |

## Week-by-week plan

| Week | Task | Owner | Days | Step | Done when |
|---|---|---|---|---|---|
| Week 1 | Draft and finalize cards 1–6 (what area is → triangles) with Claude | Devansh | 3 | 1. Cards | Every trap answer and its fix written out, checked against research |
| Week 1 | Draft and finalize cards 7–12 (trapeziums → hidden heights, rhombus included) with Claude | Tanay | 3 | 1. Cards | Every trap answer and its fix written out, checked against research |
| Week 1 | Set up storage for cards, map and answers | Tanay | 2 | 3. Engine | Cards and the map load from data, not code |
| Week 1 | Set up logging of every answer and decision | Devansh | 2 | 3. Engine | Every answer, plan and unexpected mistake is saved |
| Week 1 | Start looking for the maths reviewer | Devansh | 1 | Pilot | A teacher has agreed to review, paid per chapter |
| Week 2 | Draw the Area map: which card stands on which | Devansh | 1 | 2. Map and meters | Aarav's path can be worked out on paper from cards and map alone |
| Week 2 | Starting meters, seeded from the diagnostic | Tanay | 2 | 2. Map and meters | Each child starts with meters from their test, not from zero |
| Week 2 | Check-question gates | Devansh | 2 | 3. Engine | Right answer skips ahead; trap answer sends to its fix |
| Week 2 | Paper version of the chapter | Tanay | 1 | Checkpoint | Printable cards, questions and fixes |
| Week 2 | Paper checkpoint: run 5 real students through on paper | Both | 1 | Checkpoint | The cards catch the students' real mistakes |
| Week 3 | Fix the cards from the paper run | Both | 1 | 1. Cards | Every missed mistake added to its card |
| Week 3 | Miss ladder: hands-on → worked example → step down a floor → stop and flag | Tanay | 2 | 3. Engine | A child never gets the same thing twice in a row |
| Week 3 | 20-minute unit builder and daily limits (1 Watch + 1 Do a day) | Devansh | 2 | 3. Engine | Each unit ends on a question the child can get right |
| Weeks 4–6 | Rive template: drop a height | Devansh | 3 | 4. Pieces | Reusable: new card changes only shapes and numbers |
| Weeks 4–6 | Rive template: cut and slide | Tanay | 3 | 4. Pieces | Reusable: new card changes only shapes and numbers |
| Weeks 4–6 | Rive template: zoom into a square metre | Devansh | 3 | 4. Pieces | Reusable: new card changes only shapes and numbers |
| Weeks 4–6 | Rive template: squares on the sides | Tanay | 3 | 4. Pieces | Reusable: new card changes only shapes and numbers |
| Weeks 4–6 | Replace the farm setting | Devansh | 2 | 4. Pieces | No village feel; Maji stays |
| Weeks 4–6 | Test the engine with fake students | Tanay | 2 | 3. Engine | Sessions make sense and every decision can be explained |
| Weeks 4–6 | Child progress screen (skill map with meters) | Devansh | 3 | Screens | Child sees their meters fill up |
| Weeks 4–6 | Teacher daily list: who's stuck on what | Tanay | 3 | Screens | Teacher sees flags each morning |
| Weeks 6–7 | Watches for cards 1–6 (scripts with Claude, then video pipeline) | Devansh | 4 | 4. Pieces | Under 3 minutes, a stop about every 30 seconds |
| Weeks 6–7 | Watches for cards 7–12 (scripts with Claude, then video pipeline) | Tanay | 4 | 4. Pieces | Under 3 minutes, a stop about every 30 seconds |
| Weeks 6–7 | Practice sets for cards 1–6 | Tanay | 2 | 4. Pieces | Trap answers used as the wrong options |
| Weeks 6–7 | Practice sets for cards 7–12 | Devansh | 2 | 4. Pieces | Trap answers used as the wrong options |
| Weeks 6–7 | Connect all pieces to the engine | Both | 2 | 3. Engine | Every card has its pieces |
| Weeks 8–9 | AI planner: proposes the next session from approved pieces | Tanay | 5 | 5. AI planner | Both plans logged; if not ready, it runs in the background during the pilot |
| Weeks 8–9 | Guardrail checks on the AI planner's plans | Devansh | 3 | 5. AI planner | A plan that breaks a rule falls back to the plain rules |
| Weeks 8–9 | School conversations, including the comparison group | Devansh | 3 | Pilot | School agrees to a personalized group and a fixed-path group |
| Weeks 8–9 | Set up the before-test and comparison group | Tanay | 2 | Pilot | Same test ready for both groups |
| Week 10 | Full run-through, fixes, maths reviewer pass | Both | 5 | Pilot | Reviewer signs off on all 12 cards |
| Week 11 | Pilot launch: before-test given, logging on | Both | 2 | Pilot | First children through Day 1 |

The live version, with status tracking, is the "Area Build Plan" sheet on claude.ai.
