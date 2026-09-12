# Performance Optimization Plan — Cognitive Delay Mitigation

## Current Bottlenecks (Identified)

### 1. Sequential Processing in Learning Loop
**Location:** `apps/api/src/learning-loop/learning-loop.service.ts`

**Current Flow:**
```
Answer Submit → Tx1 Grade (DB) → Tx2 Diagnostic (DB) → Tx3 Decision (DB) → Tx4 Content (DB) → Response
```

**Measured Stages (from logs):**
- `tx1_graded`: Grade computation + DB write
- `tx2_diagnostic`: Mastery update, misconception detection, retention, velocity, error recovery
- `tx3_decided`: Decision engine with multiple DB queries for context
- `tx4_content_resolved`: Question selection or generation

**Problem:** Each stage blocks the next; DB writes are synchronous; no pre-fetching.

---

### 2. Diagnostic Engine Heavy Computation
**Location:** `apps/api/src/engines/diagnostic-engine/diagnostic-engine.service.ts`

**Operations per attempt:**
- Mastery score update (read prior, compute, write new)
- Misconception pattern matching (query recent attempts)
- Retention estimate (scan 50 attempts, filter, compute)
- Learning velocity (7-day mastery history scan)
- Error recovery rate (7-day attempt analysis)
- Profile patch (15 recent attempts analysis)

**Problem:** No caching; recalculates everything on every attempt; queries overlap.

---

### 3. Decision Engine Context Gathering
**Location:** `apps/api/src/engines/decision-engine/decision-engine.service.ts`

**Queries per decision:**
- `buildDecisionExtras`: 10+ separate DB queries
  - Mastery score
  - Concept metadata
  - Transfer check availability
  - Error recovery factor
  - Retention estimate
  - Active misconception
  - Learner profile
  - Alternative explanations

**Problem:** Sequential queries; no batching; no caching of stable data (concept metadata).

---

### 4. Question Selection
**Location:** `apps/api/src/engines/question-generator/question-generator.service.ts`

**Current:**
- Query 30 candidates (filter by concept, difficulty, intent)
- Score each candidate
- Fallback cascades if none found (nearest difficulty, prerequisite, alternates)

**Problem:** No pre-filtered question pools; no warmth scoring cache; shuffle is expensive.

---

### 5. Live Teaching Agent (LLM Generation)
**Location:** `apps/api/src/engines/live-teaching/live-teaching-agent.service.ts`

**Current:**
- 2500ms timeout for LLM param generation
- Synchronous verification
- Shadow mode still blocks student path if enabled

**Problem:** LLM latency adds 200-2000ms even when not serving; no pre-generation.

---

## Mitigation Strategies

### Priority 1: Parallel Processing (High Impact, Low Risk)

#### 1.1 Parallelize Tx2 Diagnostic Sub-Operations

**Before:**
```typescript
// Sequential
await computeRetention();
await computeVelocity();
await computeErrorRecovery();
```

**After:**
```typescript
const [retention, velocity, errorRecovery] = await Promise.all([
  this.computeAndStoreRetention(...),
  this.computeAndStoreVelocity(...),
  this.computeAndStoreErrorRecovery(...),
]);
```

**Estimated Gain:** 30-50% reduction in Tx2 time (currently ~150-300ms → 50-150ms)

---

#### 1.2 Parallelize Decision Context Gathering

**Before:**
```typescript
// buildDecisionExtras calls 10+ separate awaits
const mastery = await this.prisma.masteryScore.findUnique(...);
const concept = await this.prisma.concept.findUnique(...);
const hasTransferCheck = await this.prisma.question.count(...);
```

**After:**
```typescript
const [mastery, concept, hasTransferCheck, errorRecovery, retention, profile, ...] = 
  await Promise.all([
    this.prisma.masteryScore.findUnique(...),
    this.prisma.concept.findUnique(...),
    this.prisma.question.count(...),
    this.prisma.diagnosticFactor.findFirst(...),
    this.prisma.retentionEstimate.findFirst(...),
    this.prisma.learnerProfile.findUnique(...),
    // ... all other queries
  ]);
```

**Estimated Gain:** 60-80% reduction in decision context time (currently ~200-400ms → 50-100ms)

---

### Priority 2: Caching (High Impact, Medium Risk)

#### 2.1 In-Memory Cache for Stable Reference Data

**Cache Targets:**
- Concept metadata (mastery thresholds, minimum evidence, prerequisites)
- Question eligibility pools (pre-filtered by concept + difficulty + intent)
- Recent attempt IDs per student (rolling window, last 40)

**Implementation:**
```typescript
// Redis or in-memory with TTL
class ConceptCache {
  private cache = new Map<string, ConceptMetadata>();
  
  async get(conceptId: string): Promise<ConceptMetadata> {
    if (this.cache.has(conceptId)) return this.cache.get(conceptId)!;
    const concept = await this.prisma.concept.findUnique({ where: { id: conceptId } });
    this.cache.set(conceptId, concept);
    return concept;
  }
}
```

**Estimated Gain:** 
- Concept queries: ~50ms → <1ms per decision
- Question pool queries: ~100ms → ~10ms (pre-filter once per minute)

---

#### 2.2 Student Context Cache (Session-Scoped)

**Cache per session:**
- Recent attempts (last 20)
- Current mastery scores (active concepts)
- Active remediation states

**Invalidation:**
- On new attempt completion
- On decision application

**Estimated Gain:** Eliminate 3-5 DB queries per decision (~100-150ms saved)

---

### Priority 3: Asynchronous Write Offloading (Medium Impact, Medium Risk)

#### 3.1 Deferred Diagnostic Factor Writes

**Current:** All diagnostic factors written synchronously in Tx2
**Proposed:** Write to message queue; persist asynchronously

**Risk Mitigation:**
- Keep critical writes synchronous (mastery score, remediation state)
- Offload only observability/analytics writes (diagnostic factors, history)

**Estimated Gain:** 20-40ms per attempt

---

#### 3.2 Shadow Agent Fire-and-Forget Pattern

**Current:** Some shadow agents already non-blocking, but verification happens in-band
**Proposed:** Move ALL shadow-mode work (break advisor, practice recommender, live teaching verify) to background queue

**Estimated Gain:** 0-50ms (depends on whether LIVE_AGENTIC_GENERATE is enabled)

---

### Priority 4: Pre-Generation & Warm Pools (High Impact, High Complexity)

#### 4.1 Question Pool Pre-Warming

**Strategy:**
- On session start, pre-fetch 3-5 questions matching likely next intents
- Predict next concept/difficulty based on mastery trajectory

**Pre-warm triggers:**
- Session start: fetch baseline blueprint questions
- After 2 correct streak: fetch difficulty+1 questions
- On misconception detection: fetch TARGET_MISCONCEPTION questions

**Implementation:**
```typescript
class QuestionPoolService {
  async warmForSession(sessionId: string, studentId: string): Promise<void> {
    const session = await getSession(sessionId);
    const predictions = [
      { conceptId: session.activeConceptId, difficulty: session.activeDifficulty, intent: 'STANDARD_PRACTICE' },
      { conceptId: session.activeConceptId, difficulty: session.activeDifficulty + 1, intent: 'INCREASE_DIFFICULTY' },
      { conceptId: session.activeConceptId, difficulty: session.activeDifficulty - 1, intent: 'DECREASE_DIFFICULTY' },
    ];
    
    await Promise.all(
      predictions.map(pred => this.preFetchPool(pred.conceptId, pred.difficulty, pred.intent))
    );
  }
}
```

**Estimated Gain:** Question selection ~100ms → ~10ms (cache hit)

---

#### 4.2 LLM Pre-Generation (If Live Agentic Enabled)

**Strategy:**
- Generate 2-3 questions ahead of time during idle periods
- Use websocket "student is reading explanation" signal to trigger generation
- Pre-generate during hint requests (student still engaged, next question coming)

**Triggers:**
- On explanation view: generate retest question
- On hint request: generate next question
- On idle detection (>5s no activity): pre-generate standard practice

**Estimated Gain:** LLM latency ~500-2000ms → ~0ms (pre-generated hit rate ~60%)

---

### Priority 5: Database Optimization (Medium Impact, Low Risk)

#### 5.1 Add Composite Indexes

**Missing indexes identified:**
```sql
-- Diagnostic factor lookups
CREATE INDEX idx_diagnostic_factor_student_concept_type 
  ON "DiagnosticFactor"(studentId, conceptId, factorType, createdAt DESC);

-- Retention estimate lookups
CREATE INDEX idx_retention_estimate_valid 
  ON "RetentionEstimate"(studentId, conceptId, validUntil, createdAt DESC);

-- Attempt recent queries
CREATE INDEX idx_attempt_student_recent 
  ON "Attempt"(studentId, createdAt DESC);

-- Question eligibility
CREATE INDEX idx_question_concept_difficulty_intent 
  ON "Question"(conceptId, difficulty, questionIntent, reviewStatus);
```

**Estimated Gain:** 20-40% reduction in query latency for complex filters

---

#### 5.2 Denormalize Hot Paths

**Candidates:**
- Add `lastAttemptAt` to `MasteryScore` (avoid max(createdAt) scan)
- Add `recentCorrectCount` / `recentIncorrectCount` to session (avoid streak computation)
- Add `activeMisconceptionId` to session (avoid latest factor lookup)

**Estimated Gain:** 3-5 queries eliminated per decision (~50-80ms)

---

### Priority 6: Protocol Optimization (Low Impact, Low Risk)

#### 6.1 Streaming Responses

**Current:** Client waits for full `AnswerSubmittedResponse` before rendering
**Proposed:** Stream partial results

```typescript
// Stream grade immediately
res.write({ processingStatus: 'GRADED', grade, isCorrect });

// Stream decision when ready
res.write({ processingStatus: 'DECIDED', decision });

// Stream content when ready
res.write({ processingStatus: 'COMPLETED', next });
```

**Estimated Gain:** Perceived latency reduction ~30-50% (user sees feedback sooner)

---

#### 6.2 Optimistic UI Updates

**Client-side:**
- Show "checking answer..." immediately
- Pre-render next question skeleton
- Show grade immediately when streamed
- Lazy-load explanation content

**Estimated Gain:** Perceived latency reduction ~40-60%

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)
1. ✅ Parallelize diagnostic sub-operations (1.1)
2. ✅ Parallelize decision context gathering (1.2)
3. ✅ Add composite indexes (5.1)
4. ✅ Cache concept metadata (2.1 partial)

**Expected Total Gain:** 200-400ms reduction (30-40% improvement)

---

### Phase 2: Caching Infrastructure (2-3 weeks)
1. ✅ Implement Redis/in-memory cache layer
2. ✅ Session-scoped student context cache (2.2)
3. ✅ Question pool pre-filtering cache (2.1 full)
4. ✅ Cache invalidation strategy

**Expected Total Gain:** Additional 150-250ms reduction (15-20% improvement)

---

### Phase 3: Pre-Generation (3-4 weeks)
1. ✅ Question pool pre-warming service (4.1)
2. ✅ Predictive pool warming on session start
3. ✅ LLM pre-generation triggers (4.2, if enabled)
4. ✅ Warm pool cache eviction policy

**Expected Total Gain:** Additional 100-300ms reduction (10-25% improvement)

---

### Phase 4: Advanced Optimization (4-6 weeks)
1. ⬜ Streaming responses (6.1)
2. ⬜ Optimistic UI updates (6.2)
3. ⬜ Async write offloading (3.1, 3.2)
4. ⬜ Denormalization (5.2)

**Expected Total Gain:** Additional 100-200ms reduction + perceived latency improvement

---

## Measurement & Validation

### Baseline Metrics (Current)
```
Total loop time: 600-1200ms
- tx1_graded: 50-100ms
- tx2_diagnostic: 150-300ms
- tx3_decided: 200-400ms
- tx4_content_resolved: 100-300ms
```

### Target Metrics (Post Phase 3)
```
Total loop time: 250-500ms (50-60% reduction)
- tx1_graded: 30-60ms (parallel writes)
- tx2_diagnostic: 50-100ms (parallel compute)
- tx3_decided: 50-100ms (cached context)
- tx4_content_resolved: 20-60ms (warm pools)
```

### Monitoring
- Add `performance.mark()` / `performance.measure()` to all stages
- Log P50, P95, P99 latencies per stage
- Alert on regressions >10%
- Track cache hit rates (target >70%)

---

## Risk Mitigation

### Cache Invalidation Bugs
- **Risk:** Stale data served to students
- **Mitigation:** Conservative TTLs (30-60s); invalidate on writes; version cache keys

### Parallel Writes Race Conditions
- **Risk:** Inconsistent state if writes conflict
- **Mitigation:** Keep critical writes sequential (mastery, remediation); only parallelize independent writes

### Pre-Generation Waste
- **Risk:** Generate questions never used
- **Mitigation:** Track hit rates; throttle generation; cap pool size; evict LRU

### Database Load
- **Risk:** More concurrent queries spike DB load
- **Mitigation:** Connection pooling; query timeouts; graceful degradation to sequential on error

---

## Dependencies

- Redis or in-memory cache solution (for Phase 2+)
- Message queue (RabbitMQ / SQS) for async writes (Phase 4)
- Database migration for indexes (Phase 1)
- Client-side changes for streaming (Phase 4)

---

## Measurement Plan

### Before Implementation
1. Run load test: 100 students, 10 questions each
2. Capture baseline P50/P95/P99 per stage
3. Identify outliers (>2s responses)

### After Each Phase
1. Re-run same load test
2. Compare latencies per stage
3. Validate cache hit rates
4. Check error rates (regressions)
5. A/B test if possible (10% traffic to optimized path)

---

## Open Questions

1. **Which cache solution?** Redis (shared, persistent) vs in-memory (fast, process-local)?
2. **Pre-generation scope?** Only standard practice or also explanations?
3. **Streaming feasibility?** Does client support chunked transfer encoding?
4. **Database read replicas?** Offload heavy analytical queries?

---

## Summary

**Conservative Estimate (Phase 1-3):** 
- **50-60% latency reduction** (600-1200ms → 250-500ms)
- **Implementation time:** 6-9 weeks
- **Risk level:** Low-Medium (mostly additive changes)

**Aggressive Estimate (Phase 1-4):**
- **60-75% latency reduction** (including perceived latency via streaming)
- **Implementation time:** 10-16 weeks
- **Risk level:** Medium (requires protocol and client changes)

**Immediate next step:** Implement Phase 1 parallelization + indexes (1-2 weeks, low risk, 30-40% gain).
