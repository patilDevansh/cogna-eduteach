# MVP 9.0.1 — Phase D: LLM-assisted report prose (plan)

> Follow-on to Phase A. Sequencing: [`BUILD_PLAN.md`](./BUILD_PLAN.md). Independent of B and C.
> Use `~~strikethrough~~` when completed.

## One line

Add AI-authored student/parent report prose on top of the existing deterministic `structuredData` + template renderers, with a numeric cross-check gate stricter than voice alone.

## Decisions locked

1. **Slot-in only at render:** Keep [`report-generator.service.ts`](../apps/api/src/engines/report-generator/report-generator.service.ts) `generateSessionSummary` / `generateWeeklyReport` data assembly untouched. AI runs only where `renderStudentSummary` / `renderParentSummary` / `renderInternalSummary` / `renderWeeklyParentReport` produce `renderedText` today.
2. **Capability:** `REPORT_GENERATOR` via `AiOrchestratorService.call()` — flags `AI_REPORT_GENERATOR_GENERATE` / `SERVE` / optional `MODEL`. `ruleOutput` = today’s template string (fallback quality identical to production if AI is off or fails).
3. **Safety stack (all must pass before serve):**
   - Parse to a bounded shape (e.g. `{ renderedText: string }`).
   - `containsForbiddenTerm` on AI prose (shared voice list) — same reject pattern as interpreter.
   - **Numeric cross-check (new):** every number the AI states (counts, accuracy %, mastery from/to/deltas, weekly `questionCount`, pattern confidence when quoted) must match values present in `structuredData`. Mismatch → reject → template `renderedText`. Voice alone is not enough.
4. **Audiences in D.v1:** Session STUDENT + PARENT; weekly PARENT. INTERNAL stays template-only in D.v1 (machine string is already precise; no warmth needed).
5. **Triggers unchanged:** session end (`SessionsService.end`), weekly job / parent request — still sync/off-path; no Phase C latency concern.
6. **Independence:** D does not wait on B or C. It never writes diagnostic evidence — read-only over structured report data.
7. **D.v1 data source:** Existing LearningSession mastery / accuracy `structuredData` (what the pipeline already builds). DiagnosticV2 micro-skill parent/student report is **D.v2 follow-on** (new structured payload from `MicroSkillStateV2` / hypotheses), listed under Out of scope for D.v1 so this peel-off stays contained.

## Checklist

### Agent service

- [x] ~~e.g. `report-generator-agent.service.ts` — `polishSummary({ audience, structuredData, ruleText })` → orchestrator call → gates → return AI text or null~~

### Wire paths

- [x] ~~Session STUDENT + PARENT create paths use polished text when `served`~~
- [x] ~~Weekly PARENT create path uses polished text when `served`~~
- [x] ~~INTERNAL stays template-only in D.v1~~

### Numeric gate

- [x] ~~Pure function over `(aiText, structuredData)` with explicit extract/compare rules~~
- [x] ~~Unit table: inventing %, wrong counts, swapped mastery deltas → reject~~

### Flags + infrastructure

- [x] ~~Add `REPORT_GENERATOR` to `KNOWN_CAPABILITIES` + latency budget in shadow-gate formulas~~
- [x] ~~`.env.example` entries `AI_REPORT_GENERATOR_GENERATE` / `SERVE` / optional `MODEL` — default **off** (unlike diagnostic-v2)~~

### Goldens

- [x] ~~AI off → identical to today’s templates~~
- [x] ~~Forbidden term reject → template fallback~~
- [x] ~~Numeric mismatch reject → template fallback~~
- [x] ~~Happy-path serve when GENERATE+SERVE on (orchestrator mocked)~~

### Tracking

- [x] ~~Update [`BUILD_PLAN.md`](./BUILD_PLAN.md) sequencing / [`README.md`](./README.md) / [`SKIPPED.md`](./SKIPPED.md) parent-report deferral when implementation ships~~

## Out of scope for D.v1

- Changing `structuredData` schema or Prisma `Report` model
- AI inventing recommendations not grounded in `revisionPlan` / parentActions already in structured data
- ~~DiagnosticV2-native report content (**D.v2**)~~ — **shipped** (see below)
- Email copy / delivery changes beyond using the new `renderedText`
- AI polish for INTERNAL audience

## D.v2 — DiagnosticV2-native reports (shipped)

- [x] ~~Assemble structured facts from MicroSkillStateV2 / hypotheses / attempts / stageHistory (`diagnostic-v2-report.service.ts`)~~
- [x] ~~Student rule text = existing `buildChildFacingSummary`; parent rule = deterministic sibling with counts~~
- [x] ~~Reuse `ReportGeneratorAgentService.polishSummary` + numeric/forbidden gates~~
- [x] ~~Persist STUDENT + PARENT `Report` rows with `reportVersion = diagnostic-v2-report-v1`~~
- [x] ~~`GET …/summary` returns polished `childFacingSummary` + `parentFacingSummary` (all 5 tracks)~~
- [x] ~~Goldens: template shape, AI-off, invented-number reject, happy path~~
