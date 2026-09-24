# Build care

- Preserve all older demo and prototype routes.
- Never fall back from a failed production request to mock data.
- Do not merge assisted or gamified practice into independent exit evidence.
- Preserve user changes already present in the worktree.
- Every schema change requires a checked-in migration and Prisma validation.
- Complete browser acceptance before marking this era shipped.

## Verification — 2026-09-11

- Full `pnpm build` passes, including all 38 web pages. Added required Suspense boundaries to teacher evidence, teacher Lotus evidence, and student Lotus routes.
- Focused classroom and personalized-video suites: 44 tests pass, zero failures. Coverage now includes rejection of browser-claimed independent exit completion when no persisted exit evidence event exists.
- Production classroom handoffs keep students in the live queue: diagnostic completion returns to `/student/classroom/live`, production teaching requires a signed student identity, hides demo-fill helpers, and completed teaching returns to the classroom queue instead of the old pilot report.
- Student home now exposes the live production classroom entry point directly, so signed-in students can move from `/student/home` to `/student/classroom/live` instead of being stranded in the older individual-practice/demo flow.
- Web BFF session/media routes mint or verify the existing HMAC token format without importing API/Nest access helpers into those route bundles. Lotus and personalized-video proxy routes now use the same web-local auth helper instead of importing API auth helpers.
- Next output file tracing is pinned to the repo root in web config, removing the multiple-lockfile root inference warning.
- Web CSS compatibility warnings for classroom/teacher flex alignment have been removed.
- Prisma schema validation passes against the current checked-in schema.
- `git diff --check` passes.
- Runtime acceptance remains unverified: current checks show no PostgreSQL response on `/tmp:5432` and no web/API listener on `localhost:3000` or `localhost:4000`. Docker is not installed, and an isolated local Postgres cluster under `/tmp` cannot initialize because this sandbox blocks the required shared-memory syscall. The visible `localhost:3002/student/home` instance is running from `/Users/dp/eduTeach/.claude/worktrees/cogna-teacher-report-528ac3/apps/web`, not from this active checkout, and therefore returns 404 for the new `/student/classroom/live` route. The checked-in migration has not been verified against a running database. Do not treat passing builds or mocked service tests as proof of the cross-device classroom workflow.
- Nonfatal build warning still present: the Next personalized-video proxy route imports the API service implementation, which pulls Nest internals into that route bundle. The build succeeds, but a cleaner future shape is to call the API over HTTP or split shared service code away from Nest exceptions.
