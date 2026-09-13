# Gurukul demo: five students, five personalized teaching trails

Status: interactive pilot demonstration. The five learner records are evidence-designed fixtures used to demonstrate the complete product loop; they are not claims about real children.

## The user story

As Ananya Rao, a Grade 8 mathematics teacher, I want Cogna to turn each student’s diagnostic evidence into the smallest useful personal lesson, so that I can see what was taught, whether the student then worked independently, and what I should do next without reading a long AI report.

## Complete trail

1. The student completes a supervised Cogna Lotus diagnostic.
2. Cogna records the final answer, working steps, confidence, skips, response timing, and deterministic mathematical verification.
3. Cogna makes an evidence-bounded learner-state decision. A conclusion may be a supported teaching need, a procedural or arithmetic issue, advancement, or insufficient evidence.
4. The video planner chooses one learning objective. It must not introduce an unsupported weakness label.
5. An AI author may draft student-specific narration and examples.
6. Deterministic verification checks every mathematical expression and transformation before release. Unverified content is rejected, not shown.
7. Cogna publishes a short narrated visual lesson with captions and playback controls.
8. The student completes a fresh, unassisted exit item. Guided practice and independent evidence remain separate.
9. The teacher receives a concise result: what was observed, what Cogna taught, what the student independently demonstrated, uncertainty, and the next teaching action.
10. Delayed retention remains unclaimed until a later fresh check.

## Five evidence paths

| Student | Diagnostic evidence pattern | Personalized response | Exit purpose |
|---|---|---|---|
| Aarav Choudhury | Knows negative × negative, but loses a sign during written distribution | Make both signed products visible | Test the routine on a fresh negative bracket |
| Meena Krishnan | Opens the fractional bracket but incompletely distributes the second bracket | One arrow per term across every bracket | Test transfer with two brackets and a fraction |
| Rohan Sengupta | Algebraic method is valid; final division is inaccurate | Add a ten-second substitution check | Solve and verify without reteaching the method |
| Divya Kapoor | Combines variable terms but changes constants asymmetrically | Show the same balance operation on both sides | Fresh variables-on-both-sides equation |
| Kabir Das | Skips and conflicting inputs leave insufficient usable evidence | Calm evidence reset, not gap remediation | Collect one of two required fresh evidence items |

## Teacher’s first screen

The teacher first sees:

- five of five videos generated and mathematically verified;
- three students with supported targeted bridges;
- one student whose method is present but needs a checking routine;
- one student for whom Cogna abstained;
- video watched/not watched and exit evidence status;
- one next action per student.

Exact question-and-step evidence is available behind each student card, but it is not forced into the teacher’s 30-second view.

## Pilot acceptance checks

- [x] Five distinct evidence patterns produce distinct learning objectives.
- [x] Every teacher-facing conclusion links to observable diagnostic evidence.
- [x] The insufficient-evidence case does not receive a fabricated academic weakness.
- [x] Every video exposes its generation reason and verification status.
- [x] Student playback includes captions, pause, navigation, and optional narration.
- [x] Every video ends in a fresh independent item.
- [x] Exit performance is reported separately from watched/generated status.
- [x] One successful exit item does not become a broad mastery or retention claim.
- [ ] Replace fixture records with persisted multi-device Lotus sessions before a live 30-device school pilot.
- [ ] Add asynchronous production media rendering only after scripts pass mathematical and content validation.
