# MVP 3.0 — Production Auth

> **Delta from MVP 2.0:** Same Clerk production path. Add admin roles for draft review and experiment ops.

## Carry-forward

From [`docs/mvp-2.0/PRODUCTION_AUTH.md`](../mvp-2.0/PRODUCTION_AUTH.md):

- Parent Clerk Bearer for production
- Dev `X-Parent-Id` / demo-login local only
- Student session binding unchanged

## New roles (proposed)

| Role | Can |
|---|---|
| `content_reviewer` | Validate queue, approve/reject drafts |
| `experiment_ops` | Start/pause experiments, export assignments |
| `admin` | Both + prompt version config |

Reviewer tokens must not be available to student clients.

## Secrets

| Secret | Scope |
|---|---|
| Clerk keys | Web + API |
| LLM provider key | API workers only |
| Analysis export storage | Workers / ops |

### LLM Provider Key Management

**Provider choice process:**

1. Before Canonical freeze, evaluate OpenAI, Anthropic, and other suitable providers for structured JSON output quality, latency, and cost.
2. Selection criteria: schema adherence, temperature stability, math correctness in outputs, ToS compliance for educational content.
3. Decision must be documented in this file before MVP 3.0 promotion to Canonical.
4. **Placeholder:** Provider TBD — finalize before Canonical promotion.

**Key security:**

```text
- Provider API keys NEVER in client code, environment variables visible to web bundle, or committed to repo
- Keys stored in secure secret management (e.g., Vercel environment secrets, AWS Secrets Manager, or equivalent)
- API workers fetch keys at boot or per-request from secure runtime environment only
- Staging and production use separate keys
- Key rotation plan: quarterly or on suspected compromise
```

**Staging vs production:**

| Environment | Key | Rate limits | Usage |
|---|---|---|---|
| Staging | Separate staging key | Shared team limit | Draft experiments, validation testing |
| Production | Production-only key | Pilot workload limit | APPROVED pilot cohort draft jobs only |

Keys must be scoped to prevent accidental cross-environment usage.

## Non-goals

- Student OAuth redesign
- Teacher SSO (MVP 4.0+ visibility may revisit)
