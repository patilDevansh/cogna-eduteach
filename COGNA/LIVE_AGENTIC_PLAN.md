# Live Agentic Plan

> Stages, flags, flip criteria, and ops metrics. Companion to HOW_THE_PRODUCT_WORKS.

## Product rule

Nothing generated reaches a child until **ContentVerifier** passes (answer + steps + pedagogy + voice + hints).  
**Day one:** generate + verify + **log** (shadow); **serve bank**.  
**Serve generated** only when flip criteria met and `LIVE_AGENTIC_SERVE_GENERATED=true`.

## Paths

| Path | What happens | Default |
|---|---|---|
| **C-lite** | LLM (or deterministic RNG) picks parameters; templates render stem/hints/explanation | **On** when `LIVE_AGENTIC_GENERATE=true` |
| **Free-form** | LLM returns full JSON item | Off until metrics + explicit enable |
| **Bank** | Approved questions only | Always available; always served in shadow |

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `LIVE_AGENTIC_GENERATE` | `false` | Run generate+verify+shadow log |
| `LIVE_AGENTIC_SERVE_GENERATED` | `false` | Serve verified generated content (kill switch when false) |
| `LIVE_AGENTIC_MODEL` | `gpt-4.1-mini` | Pinned model |
| `OPENAI_API_KEY` | — | Required for LLM; without it C-lite can use deterministic params |
| `AI_QUESTION_RECOMMENDER_GENERATE` | `false` | Shadow-compare AI re-rank vs rules (opens scored path) |
| `AI_QUESTION_RECOMMENDER_SERVE` | `false` | Await AI and apply its legal-set index (kill switch when false) |

### Decision re-rank (question recommender)

Rules still build the **legal candidate set**. AI may only pick an index inside that set.

- **GENERATE only:** fire-and-forget shadow log; student gets the rule pick.
- **SERVE:** decision engine awaits the recommender; if the call passes and the index is in-bounds, that candidate is served. Hard gates (`END_SESSION` / `SUGGEST_BREAK`) still win before scoring/AI. On timeout/failure → rules.

## Flip criteria (shadow → serve)

| Metric | Threshold |
|---|---|
| Verifier pass rate | > 90% over last 200 shadow items |
| Forbidden-term leaks | 0 in last 500 shadow items |
| p95 gen+verify latency | < 2500ms (with prefetch) |
| Step-level explanation failures | < 2% of explanation shadows |

## Acceptance / ops metrics

| Control | Target |
|---|---|
| Verifier pass rate (shadow) | > 90% before serve flip |
| Fallback rate (live) | < 15% per session; alert if > 25% |
| Token cost | Cap logged per session; alert on spike |
| Model version | Pinned env; logged per item |
| Kill switch | `LIVE_AGENTIC_SERVE_GENERATED=false` |
| Alerts | Verifier failure spike, fallback spike |

## ContentVerifier layers

1. **Answer** — re-solve / match accepted answers  
2. **Steps** — each explanation line preserves solution (substitute answer)  
3. **Pedagogy** — one-variable linear; clean solution; concept matches intent; not near-duplicate in session  
4. **Voice** — forbidden-term guard  
5. **Hints** — no hint contains final answer  

Timeout 2–3s → bank. Prefetch next while student solves current.

## Stages

| Stage | Outcome | Gate |
|---|---|---|
| **0** | Docs + testUI UX + C-lite + shadow + verifier | `pnpm test:fast` + Playwright |
| **1** | Staging, Clerk, 3–5 families | Staging + **≥1 live child on real phone** |
| **2** | Flip serve when metrics hit | Flip table satisfied |
| **3** | Modality / explanation style | Serve metrics stable |
| **4** | Offline policy training | Volume + safety eval |
| **5** | Production SLO / content ops | Full regression + ops |

## Keys you need

- `OPENAI_API_KEY` for LLM shadow/gen (billing on)  
- Clerk keys for production parent auth  
- Optional: Sentry / PostHog  
