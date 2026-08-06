# Privacy and Data (Live Agentic)

> Plain English for managers and parents. India DPDP context for minors.

## Core promises

1. **No names or student IDs in LLM prompts** — only concept states, difficulty band, error pattern tags (e.g. “sign handling”), and anonymous session hashes if needed for dedupe.  
2. **Parental consent** — parent creates the account and issues the child’s access code; practice is under that relationship. Production should keep Clerk (or equivalent) parent auth before live pilots.  
3. **OpenAI API data use** — we use API keys under OpenAI’s API terms that **do not train** foundation models on API payloads (confirm current OpenAI data usage policy when flipping serve).  
4. **Retention of generations** — shadow logs and verified drafts are stored for audit, quality, and bank promotion. Do not keep prompts with PII. Purge policy: keep shadow logs ≤ 90 days unless escalated for safety review.  
5. **Kill switch** — `LIVE_AGENTIC_SERVE_GENERATED=false` stops showing generated content immediately (no redeploy).

## What parents should be told

In parent-facing FAQ / onboarding:

- Practice answers stay on Cogna systems for learning and reports.  
- When live generation is served, a machine verifier checks math before the child sees it; until then the child only sees human-approved bank items (shadow mode).  
- We do not send the child’s name to third-party AI providers.  
- Reports avoid clinical language and overclaiming.

## Engineer checklist

- Prompts: conceptId → human label optional in system text, never student name/email  
- Logs: no `accessCode`, no full email in gen audit rows  
- Flags: see [`LIVE_AGENTIC_PLAN.md`](./LIVE_AGENTIC_PLAN.md)  
