# Performance Optimization — Visual Reference

## Current Flow (Sequential) ❌

```
Student submits answer
         ↓
    [75ms] Grade & DB Write
         ↓ (blocking)
   [220ms] Diagnostic Engine
         ├─ Mastery update (50ms)
         ├─ Misconception detect (40ms)
         ├─ Retention compute (50ms)
         ├─ Velocity compute (40ms)
         └─ Error recovery (40ms)
         ↓ (blocking)
   [250ms] Decision Engine
         ├─ Query mastery (30ms)
         ├─ Query concept (50ms)
         ├─ Query transfer check (30ms)
         ├─ Query error recovery (25ms)
         ├─ Query retention (25ms)
         ├─ Query profile (20ms)
         ├─ Query misconceptions x3 (70ms)
         └─ Compute decision
         ↓ (blocking)
   [105ms] Question Selection
         ├─ Query candidates (60ms)
         ├─ Score & rank (20ms)
         └─ Fallback cascade (25ms)
         ↓
    Next question displayed

TOTAL: 650ms (P50) to 1200ms (P95)
```

---

## Phase 1 Flow (Parallel) ✅

```
Student submits answer
         ↓
    [60ms] Grade & DB Write
         ↓ (non-blocking)
   [100ms] Diagnostic Engine (PARALLEL)
         ├─ Mastery update (50ms)
         ├─ Misconception detect (40ms)
         └─ [PARALLEL]
             ├─ Retention compute (50ms)
             ├─ Velocity compute (40ms)
             └─ Error recovery (40ms)
         ↓ (non-blocking)
   [100ms] Decision Engine (PARALLEL)
         └─ [PARALLEL] All queries at once
             ├─ Mastery (30ms)
             ├─ Concept → CACHED (1ms)
             ├─ Transfer check (30ms)
             ├─ Error recovery (25ms)
             ├─ Retention (25ms)
             ├─ Profile (20ms)
             └─ Misconceptions x3 (70ms)
         ↓ (non-blocking)
    [90ms] Question Selection (INDEXED)
         ├─ Query candidates (20ms, indexed)
         ├─ Score & rank (20ms)
         └─ Fallback cascade (10ms)
         ↓
    Next question displayed

TOTAL: 400ms (P50) to 700ms (P95)

IMPROVEMENT: 38% faster (250ms saved)
```

---

## Phase 2 Flow (Cached) 🚀

```
Student submits answer
         ↓
    [60ms] Grade & DB Write
         ↓
   [100ms] Diagnostic (parallel, as Phase 1)
         ↓
    [50ms] Decision Engine (CACHED CONTEXT)
         └─ [PARALLEL] Most queries → cache hit
             ├─ Mastery (5ms, session cache)
             ├─ Concept (1ms, preloaded cache)
             ├─ Transfer check (1ms, preloaded)
             ├─ Error recovery (5ms, session cache)
             ├─ Retention (5ms, session cache)
             ├─ Profile (5ms, session cache)
             └─ Misconceptions (20ms, recent cache)
         ↓
    [60ms] Question Selection (WARM POOL)
         ├─ Check warm pool (5ms, cache hit)
         ├─ Score & select (10ms)
         └─ Fallback (rarely needed)
         ↓
    Next question displayed

TOTAL: 300ms (P50) to 550ms (P95)

IMPROVEMENT: 54% faster (350ms saved vs baseline)
```

---

## Phase 3 Flow (Pre-Generated) 🎯

```
Student submits answer
         ↓
    [60ms] Grade & DB Write
         ↓
   [100ms] Diagnostic (parallel)
         ↓
    [50ms] Decision (cached)
         ↓
    [20ms] Question Selection (PRE-WARMED)
         └─ Pool pre-warmed on:
             • Session start
             • Streak detection
             • Misconception trigger
         ↓
    Next question displayed (INSTANT)

    [Background: Pre-generate next 3 questions]
         ├─ Standard practice (always)
         ├─ Difficulty +1 (if streak)
         └─ Targeted (if misconception)

TOTAL: 250ms (P50) to 450ms (P95)

IMPROVEMENT: 62% faster (400ms saved vs baseline)
```

---

## Key Techniques Visualized

### 1. Parallelization (Phase 1)

**Before:**
```
Task A (100ms) → Task B (100ms) → Task C (100ms) = 300ms total
```

**After:**
```
Task A (100ms) ┐
Task B (100ms) ├─ Execute together = 100ms total
Task C (100ms) ┘
```

---

### 2. Caching (Phase 2)

**Before:**
```
Every request:
  → Query concept metadata (50ms)
  → Query prerequisites (30ms)
  → Query eligibility rules (40ms)
  = 120ms overhead
```

**After:**
```
First request:
  → Query + cache = 120ms

Subsequent requests:
  → Cache hit = 1ms
  = 119ms saved per request
```

---

### 3. Pre-Warming (Phase 3)

**Before:**
```
Student answers → Generate next question (100ms) → Display
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                   Student waits here
```

**After:**
```
Student answers → Select pre-generated (10ms) → Display
                   ^^^^^^^^^^^^^^^^^^^^^^
                   Minimal wait

[Background, during previous question]
  → Pre-generate next 3 likely questions
  → Store in warm pool
```

---

## Bottleneck Heatmap

```
┌─────────────────────────┬──────────┬──────────┬──────────┐
│ Stage                   │ Baseline │ Phase 1  │ Phase 3  │
├─────────────────────────┼──────────┼──────────┼──────────┤
│ Grade & Write          │   75ms   │   60ms ✓ │   60ms   │
│ Diagnostic             │  220ms 🔥 │  100ms ✓✓│  100ms   │
│ Decision Context       │  250ms 🔥 │  100ms ✓✓│   50ms ✓✓│
│ Question Selection     │  105ms 🔥 │   90ms ✓ │   20ms ✓✓│
├─────────────────────────┼──────────┼──────────┼──────────┤
│ TOTAL                  │  650ms   │  400ms   │  250ms   │
└─────────────────────────┴──────────┴──────────┴──────────┘

Legend:
🔥 = Hotspot (>200ms)
✓  = Improved (20-40%)
✓✓ = Major improvement (>50%)
```

---

## Database Query Reduction

### Before Phase 1:
```
Per answer: 18 queries
  ├─ Diagnostic: 8 queries (sequential)
  ├─ Decision: 9 queries (sequential)
  └─ Selection: 1 query (candidates)

Wait time: ~380ms (queries only)
```

### After Phase 1:
```
Per answer: 18 queries
  ├─ Diagnostic: 8 queries (3 parallel)
  ├─ Decision: 9 queries (8 parallel)
  └─ Selection: 1 query (indexed)

Wait time: ~100ms (queries only) ← 74% faster
```

### After Phase 2:
```
Per answer: 8 queries (10 cached)
  ├─ Diagnostic: 5 queries (3 cached)
  ├─ Decision: 2 queries (7 cached)
  └─ Selection: 1 query (pool cached)

Wait time: ~40ms (queries only) ← 89% faster
```

---

## Cache Architecture (Phase 2)

```
┌────────────────────────────────────────────────┐
│           Application Layer                    │
│  ┌──────────────────────────────────────────┐ │
│  │   Learning Loop Service                  │ │
│  └───────────┬──────────────────────────────┘ │
│              │ Check cache first              │
│  ┌───────────▼──────────────────────────────┐ │
│  │   Cache Layer (Redis or In-Memory)       │ │
│  │   ┌────────────────────────────────────┐ │ │
│  │   │ Concept Metadata (TTL: ∞)          │ │ │
│  │   │ - Mastery thresholds               │ │ │
│  │   │ - Prerequisites                    │ │ │
│  │   │ - Evidence requirements            │ │ │
│  │   └────────────────────────────────────┘ │ │
│  │   ┌────────────────────────────────────┐ │ │
│  │   │ Session Context (TTL: 30min)       │ │ │
│  │   │ - Recent attempts                  │ │ │
│  │   │ - Current mastery                  │ │ │
│  │   │ - Active remediations              │ │ │
│  │   └────────────────────────────────────┘ │ │
│  │   ┌────────────────────────────────────┐ │ │
│  │   │ Question Pools (TTL: 5min)         │ │ │
│  │   │ - Eligible by concept+difficulty   │ │ │
│  │   │ - Pre-scored candidates            │ │ │
│  │   └────────────────────────────────────┘ │ │
│  └───────────┬──────────────────────────────┘ │
│              │ Cache miss? Fetch + populate   │
│  ┌───────────▼──────────────────────────────┐ │
│  │   Database Layer (PostgreSQL)            │ │
│  └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

---

## Pre-Generation Strategy (Phase 3)

```
┌─────────────────────────────────────────────────┐
│  Student Timeline                               │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Question 1 displayed] ← Generated earlier     │
│         ↓ Student reads                         │
│  [Student typing answer...]                     │
│         ↓                                       │
│  {TRIGGER: Pre-generate Q2-Q4 in background}   │
│         ↓                                       │
│  [Student submits] → [Process 250ms]            │
│         ↓                                       │
│  [Question 2 displayed] ← Already generated! ✓  │
│         ↓ Student reads                         │
│  [Student typing answer...]                     │
│         ↓                                       │
│  {TRIGGER: Pre-generate Q3-Q5 in background}   │
│         ↓                                       │
│  [Student submits] → [Process 250ms]            │
│         ↓                                       │
│  [Question 3 displayed] ← Already generated! ✓  │
│                                                 │
└─────────────────────────────────────────────────┘

Warm Pool Contents (always 3-5 questions ahead):
┌──────────────────────────────────────────┐
│ Priority 1: Standard practice            │
│ Priority 2: Difficulty +1 (if streak)    │
│ Priority 3: Difficulty -1 (if struggle)  │
│ Priority 4: Targeted (if misconception)  │
│ Priority 5: Transfer check (if eligible) │
└──────────────────────────────────────────┘
```

---

## Decision Matrix — Quick Reference

| Approach | Time | Complexity | Gain | When to Use |
|----------|------|------------|------|-------------|
| **Parallelization** | 1w | Low | 150ms | ✅ Do first |
| **Indexing** | 1w | Low | 80ms | ✅ Do first |
| **In-Memory Cache** | 1w | Low | 50ms | ✅ Do first |
| **Redis Cache** | 2w | Med | 100ms | ⏸️ After Phase 1 |
| **Pre-Warming** | 3w | Med | 80ms | ⏸️ After Phase 2 |
| **Pre-Generation** | 3w | Med | 50ms | ⏸️ If LLM enabled |
| **Streaming** | 4w | High | UX | ⏸️ After all above |

---

## Measurement Dashboard

```
┌───────────────────────────────────────────────┐
│  Latency Metrics (P50 / P95 / P99)           │
├───────────────────────────────────────────────┤
│  Baseline:     650ms / 1100ms / 1800ms        │
│  Phase 1:      400ms /  700ms / 1100ms  38% ↓│
│  Phase 2:      300ms /  550ms /  900ms  54% ↓│
│  Phase 3:      250ms /  450ms /  750ms  62% ↓│
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│  Cache Hit Rates                              │
├───────────────────────────────────────────────┤
│  Concept metadata:      95%  (target >90%)    │
│  Session context:       80%  (target >70%)    │
│  Question pools:        60%  (target >50%)    │
│  Pre-generated:         65%  (target >60%)    │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│  Stage Breakdown (P50)                        │
├───────────────────────────────────────────────┤
│  tx1_graded:        60ms  [████░░░░░░]        │
│  tx2_diagnostic:   100ms  [████████░░]        │
│  tx3_decided:       50ms  [████░░░░░░]        │
│  tx4_content:       20ms  [██░░░░░░░░]        │
│  ─────────────────────────────────────        │
│  Total:            250ms  [████████░░]        │
└───────────────────────────────────────────────┘
```

---

## Risk Mitigation Checklist

### Before Phase 1:
- [ ] Baseline metrics captured (P50/P95/P99 for 1 week)
- [ ] Load test environment ready
- [ ] Rollback plan documented
- [ ] DB connection pool size validated

### During Phase 1:
- [ ] Deploy to staging first
- [ ] A/B test with 10% traffic
- [ ] Monitor error rates (<0.1% regression)
- [ ] Validate cache hit rates (>70%)

### After Phase 1:
- [ ] 1-week bake period before Phase 2
- [ ] User feedback collected
- [ ] Performance gains validated
- [ ] Go/No-Go decision for Phase 2

---

## Quick Command Reference

```bash
# Run baseline measurement
pnpm test:perf:baseline

# Deploy Phase 1 changes
pnpm build && pnpm test:golden && pnpm deploy:staging

# Monitor latency
pnpm monitor:latency --tail

# Check cache hit rates
curl http://localhost:3000/observability/cache-stats

# Run load test (100 students)
pnpm test:load --students=100 --questions=10
```

---

**See full documentation:**
- Plan: `/workspace/COGNA/PERFORMANCE_OPTIMIZATION_PLAN.md`
- Guide: `/workspace/COGNA/PHASE_1_IMPLEMENTATION_GUIDE.md`
- Summary: `/workspace/COGNA/COGNITIVE_DELAY_SUMMARY.md`
