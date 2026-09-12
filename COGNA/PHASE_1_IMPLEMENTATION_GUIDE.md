# Phase 1 Implementation Guide — Quick Wins

**Goal:** Reduce cognitive delay by 30-40% (~200-400ms) with low-risk parallelization and indexing changes.

**Timeline:** 1-2 weeks  
**Risk Level:** Low  
**Deployment:** Can be rolled out incrementally

---

## Change 1: Parallelize Diagnostic Sub-Operations

### File: `apps/api/src/engines/diagnostic-engine/diagnostic-engine.service.ts`

### Current Code (lines ~176-204):

```typescript
const retentionFactor = await this.computeAndStoreRetention(
  studentId,
  question.conceptId,
  attemptId,
);
if (retentionFactor) {
  diagnosticFactors.push(retentionFactor as unknown as DiagnosticInference);
}

const velocityFactor = await this.computeAndStoreVelocity(
  studentId,
  question.conceptId,
  attemptId,
);
if (velocityFactor) {
  diagnosticFactors.push(velocityFactor as unknown as DiagnosticInference);
}

const errorRecoveryFactor = await this.computeAndStoreErrorRecovery(
  studentId,
  question.conceptId,
  attemptId,
);
if (errorRecoveryFactor) {
  diagnosticFactors.push(errorRecoveryFactor as unknown as DiagnosticInference);
}
```

### Optimized Code:

```typescript
// MVP 2.0: retention / velocity / error recovery / engagement (post-baseline evidence)
// Parallel execution — these computations are independent and can run concurrently
const [retentionFactor, velocityFactor, errorRecoveryFactor] = await Promise.all([
  this.computeAndStoreRetention(studentId, question.conceptId, attemptId),
  this.computeAndStoreVelocity(studentId, question.conceptId, attemptId),
  this.computeAndStoreErrorRecovery(studentId, question.conceptId, attemptId),
]);

if (retentionFactor) {
  diagnosticFactors.push(retentionFactor as unknown as DiagnosticInference);
}
if (velocityFactor) {
  diagnosticFactors.push(velocityFactor as unknown as DiagnosticInference);
}
if (errorRecoveryFactor) {
  diagnosticFactors.push(errorRecoveryFactor as unknown as DiagnosticInference);
}
```

**Why Safe:**
- All three methods read different subsets of data
- Each writes to independent rows (different factorType)
- No shared mutable state
- Prisma handles transaction isolation

**Expected Gain:** 100-150ms (from ~250ms sequential → ~100ms parallel)

**Testing:**
```bash
# Before: run 10 attempts, measure tx2_diagnostic latency
npm run test:e2e -- diagnostic-engine.e2e-spec.ts

# After: verify same results, lower latency
# Check that all three factors still appear in diagnosticFactors array
```

---

## Change 2: Parallelize Decision Context Gathering

### File: `apps/api/src/learning-loop/learning-loop.service.ts`

### Current Code (lines ~1154-1272 in `buildDecisionExtras`):

```typescript
const idleSpikeCount = input.sessionAttempts.filter((a) =>
  isIdleSpike(a.idleTimeMs),
).length;

const mastery = await this.prisma.masteryScore.findUnique({
  where: {
    studentId_conceptId: {
      studentId: input.studentId,
      conceptId: input.conceptId,
    },
  },
});

const concept = await this.prisma.concept.findUnique({
  where: { id: input.conceptId },
});

const hasTransferCheckItem =
  (await this.prisma.question.count({
    where: {
      conceptId: input.conceptId,
      questionIntent: "TRANSFER_CHECK",
      reviewStatus: "APPROVED",
    },
  })) > 0;

const errorRecoveryFactor = await this.prisma.diagnosticFactor.findFirst({
  where: {
    studentId: input.studentId,
    conceptId: input.conceptId,
    factorType: "ERROR_RECOVERY",
  },
  orderBy: { createdAt: "desc" },
});

const retentionRow = await this.prisma.retentionEstimate.findFirst({
  where: {
    studentId: input.studentId,
    conceptId: input.conceptId,
    validUntil: { gt: new Date() },
  },
  orderBy: { createdAt: "desc" },
});

const activeHighMisconception =
  (await this.prisma.diagnosticFactor.findFirst({
    where: {
      studentId: input.studentId,
      conceptId: input.conceptId,
      factorType: "MISCONCEPTION",
      confidence: { gt: 0.6 },
    },
    orderBy: { createdAt: "desc" },
  })) != null;

const profile = await this.prisma.learnerProfile.findUnique({
  where: { studentId: input.studentId },
});

const latestMisconception = await this.prisma.diagnosticFactor.findFirst({
  where: {
    studentId: input.studentId,
    conceptId: input.conceptId,
    factorType: "MISCONCEPTION",
  },
  orderBy: { createdAt: "desc" },
});
```

### Optimized Code:

```typescript
// Parallel context gathering — all queries are read-only and independent
const idleSpikeCount = input.sessionAttempts.filter((a) =>
  isIdleSpike(a.idleTimeMs),
).length;

const [
  mastery,
  concept,
  transferCheckCount,
  errorRecoveryFactor,
  retentionRow,
  activeHighMisconceptionFactor,
  profile,
  latestMisconception,
] = await Promise.all([
  this.prisma.masteryScore.findUnique({
    where: {
      studentId_conceptId: {
        studentId: input.studentId,
        conceptId: input.conceptId,
      },
    },
  }),
  this.prisma.concept.findUnique({
    where: { id: input.conceptId },
  }),
  this.prisma.question.count({
    where: {
      conceptId: input.conceptId,
      questionIntent: "TRANSFER_CHECK",
      reviewStatus: "APPROVED",
    },
  }),
  this.prisma.diagnosticFactor.findFirst({
    where: {
      studentId: input.studentId,
      conceptId: input.conceptId,
      factorType: "ERROR_RECOVERY",
    },
    orderBy: { createdAt: "desc" },
  }),
  this.prisma.retentionEstimate.findFirst({
    where: {
      studentId: input.studentId,
      conceptId: input.conceptId,
      validUntil: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  }),
  this.prisma.diagnosticFactor.findFirst({
    where: {
      studentId: input.studentId,
      conceptId: input.conceptId,
      factorType: "MISCONCEPTION",
      confidence: { gt: 0.6 },
    },
    orderBy: { createdAt: "desc" },
  }),
  this.prisma.learnerProfile.findUnique({
    where: { studentId: input.studentId },
  }),
  this.prisma.diagnosticFactor.findFirst({
    where: {
      studentId: input.studentId,
      conceptId: input.conceptId,
      factorType: "MISCONCEPTION",
    },
    orderBy: { createdAt: "desc" },
  }),
]);

const hasTransferCheckItem = transferCheckCount > 0;
const activeHighMisconception = activeHighMisconceptionFactor != null;

// ... rest of method unchanged (alternative explanation logic)
```

**Why Safe:**
- All queries are read-only
- No mutations during context gathering
- Results are independent of execution order
- Prisma connection pool handles concurrency

**Expected Gain:** 150-250ms (from ~300ms sequential → ~50ms parallel)

**Testing:**
```typescript
// Integration test
it('should gather decision context in parallel', async () => {
  const start = Date.now();
  const extras = await learningLoop['buildDecisionExtras']({
    studentId: testStudent.id,
    session: testSession,
    conceptId: 'C2_ONE_STEP_SUBTRACTION',
    recentIncorrectStreak: 0,
    sessionAttempts: [],
  });
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(100); // Should be <100ms with parallelization
  expect(extras).toHaveProperty('masteryValue');
  expect(extras).toHaveProperty('confidenceCalibration');
});
```

---

## Change 3: Add Composite Indexes

### File: New migration `packages/database/prisma/migrations/YYYYMMDDHHMMSS_add_perf_indexes/migration.sql`

```sql
-- Diagnostic factor lookups (most frequent hot path)
CREATE INDEX IF NOT EXISTS "idx_diagnostic_factor_student_concept_type" 
  ON "DiagnosticFactor"("studentId", "conceptId", "factorType", "createdAt" DESC);

-- Retention estimate lookups (decision context)
CREATE INDEX IF NOT EXISTS "idx_retention_estimate_valid" 
  ON "RetentionEstimate"("studentId", "conceptId", "validUntil", "createdAt" DESC);

-- Attempt recent queries (diagnostic computations)
CREATE INDEX IF NOT EXISTS "idx_attempt_student_recent" 
  ON "Attempt"("studentId", "createdAt" DESC);

-- Attempt session queries (streak computation)
CREATE INDEX IF NOT EXISTS "idx_attempt_session_recent" 
  ON "Attempt"("sessionId", "createdAt" DESC);

-- Question eligibility (selection hot path)
CREATE INDEX IF NOT EXISTS "idx_question_concept_difficulty_intent" 
  ON "Question"("conceptId", "difficulty", "questionIntent", "reviewStatus");

-- Question misconception targeting
CREATE INDEX IF NOT EXISTS "idx_question_misconception" 
  ON "Question"("conceptId", "reviewStatus") 
  WHERE "misconceptionsTested" IS NOT NULL AND array_length("misconceptionsTested", 1) > 0;

-- Misconception remediation state lookups
CREATE INDEX IF NOT EXISTS "idx_misconception_remediation_student_concept" 
  ON "MisconceptionRemediationState"("studentId", "conceptId", "updatedAt" DESC);

-- Revision queue due items
CREATE INDEX IF NOT EXISTS "idx_revision_queue_due" 
  ON "RevisionQueueItem"("studentId", "status", "dueAt" DESC, "priority" DESC);

-- Concept prerequisites (decision fallback)
CREATE INDEX IF NOT EXISTS "idx_concept_prerequisite_concept" 
  ON "ConceptPrerequisite"("conceptId");
```

### Validation

```sql
-- Check index usage after deployment (PostgreSQL)
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY idx_scan DESC;

-- Explain analyze critical queries
EXPLAIN ANALYZE
SELECT * FROM "DiagnosticFactor"
WHERE "studentId" = 'student-123'
  AND "conceptId" = 'C2_ONE_STEP_SUBTRACTION'
  AND "factorType" = 'MISCONCEPTION'
ORDER BY "createdAt" DESC
LIMIT 1;
```

**Expected Gain:** 50-100ms (query latencies reduced by 20-40%)

---

## Change 4: Partial Concept Metadata Caching

### File: New service `apps/api/src/engines/concept-cache/concept-cache.service.ts`

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConceptMetadata {
  id: string;
  masteryThreshold: number;
  minimumEvidence: number;
  prerequisites: string[];
}

@Injectable()
export class ConceptCacheService implements OnModuleInit {
  private readonly logger = new Logger(ConceptCacheService.name);
  private cache = new Map<string, ConceptMetadata>();
  private loading = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Warm cache on startup
    await this.warmCache();
  }

  async get(conceptId: string): Promise<ConceptMetadata | null> {
    // Check cache first
    if (this.cache.has(conceptId)) {
      return this.cache.get(conceptId)!;
    }

    // Load on-demand if not cached
    return this.loadConcept(conceptId);
  }

  private async warmCache(): Promise<void> {
    if (this.loading) return;
    
    this.loading = true;
    try {
      const concepts = await this.prisma.concept.findMany({
        include: {
          prerequisites: {
            select: { prerequisiteId: true },
          },
        },
      });

      for (const concept of concepts) {
        this.cache.set(concept.id, {
          id: concept.id,
          masteryThreshold: concept.masteryThreshold,
          minimumEvidence: concept.minimumEvidence,
          prerequisites: concept.prerequisites.map((p) => p.prerequisiteId),
        });
      }

      this.logger.log(`Concept cache warmed: ${this.cache.size} concepts`);
    } catch (err) {
      this.logger.error(`Failed to warm concept cache: ${err}`);
    } finally {
      this.loading = false;
    }
  }

  private async loadConcept(conceptId: string): Promise<ConceptMetadata | null> {
    try {
      const concept = await this.prisma.concept.findUnique({
        where: { id: conceptId },
        include: {
          prerequisites: {
            select: { prerequisiteId: true },
          },
        },
      });

      if (!concept) return null;

      const metadata: ConceptMetadata = {
        id: concept.id,
        masteryThreshold: concept.masteryThreshold,
        minimumEvidence: concept.minimumEvidence,
        prerequisites: concept.prerequisites.map((p) => p.prerequisiteId),
      };

      this.cache.set(conceptId, metadata);
      return metadata;
    } catch (err) {
      this.logger.error(`Failed to load concept ${conceptId}: ${err}`);
      return null;
    }
  }

  // Invalidate cache when concepts are updated (admin operations only)
  invalidate(conceptId?: string): void {
    if (conceptId) {
      this.cache.delete(conceptId);
      this.logger.log(`Invalidated concept cache: ${conceptId}`);
    } else {
      this.cache.clear();
      this.logger.log('Cleared entire concept cache');
      // Rewarm asynchronously
      void this.warmCache();
    }
  }
}
```

### Integration in `learning-loop.service.ts`:

```typescript
// Inject cache service
constructor(
  // ... existing deps
  private readonly conceptCache: ConceptCacheService,
) {}

// In buildDecisionExtras, replace:
const concept = await this.prisma.concept.findUnique({
  where: { id: input.conceptId },
});

// With:
const concept = await this.conceptCache.get(input.conceptId);
```

### Module Registration:

```typescript
// apps/api/src/engines/concept-cache/concept-cache.module.ts
import { Module } from '@nestjs/common';
import { ConceptCacheService } from './concept-cache.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ConceptCacheService],
  exports: [ConceptCacheService],
})
export class ConceptCacheModule {}
```

**Expected Gain:** 10-20ms per decision (concept query ~50ms → <1ms)

**Testing:**
```typescript
describe('ConceptCacheService', () => {
  it('should warm cache on init', async () => {
    const service = new ConceptCacheService(prismaMock);
    await service.onModuleInit();
    
    const concept = await service.get('C2_ONE_STEP_SUBTRACTION');
    expect(concept).toBeDefined();
    expect(concept.masteryThreshold).toBe(0.75);
  });

  it('should cache miss load from DB', async () => {
    const service = new ConceptCacheService(prismaMock);
    // Don't warm cache
    
    const concept = await service.get('NEW_CONCEPT');
    expect(prismaMock.concept.findUnique).toHaveBeenCalled();
  });
});
```

---

## Rollout Plan

### Week 1:
1. **Day 1-2:** Implement Change 1 (diagnostic parallelization)
   - Create feature branch
   - Apply code changes
   - Run unit + integration tests
   - Measure latency improvement in dev

2. **Day 3-4:** Implement Change 2 (decision context parallelization)
   - Apply code changes
   - Run full test suite
   - Load test in staging (100 students, 10 questions each)
   - Compare baseline vs optimized metrics

3. **Day 5:** Deploy Changes 1+2 to staging
   - Monitor error rates
   - Validate P50/P95/P99 latencies
   - Check for race conditions or timeouts

### Week 2:
1. **Day 1-2:** Implement Change 3 (indexes)
   - Write migration
   - Test on staging replica
   - Verify query plans improve
   - Measure query latency reduction

2. **Day 3:** Deploy indexes to staging
   - Monitor database load
   - Check slow query logs
   - Validate no regressions

3. **Day 4:** Implement Change 4 (concept cache)
   - Create cache service
   - Wire into learning loop
   - Test cache hits/misses
   - Measure latency improvement

4. **Day 5:** Deploy all changes to production
   - Gradual rollout (10% → 50% → 100%)
   - Monitor dashboards
   - Compare week-over-week metrics

---

## Success Metrics

### Before Phase 1:
```
P50: 650ms
P95: 1100ms
P99: 1800ms

Breakdown:
- tx1_graded: 75ms (P50)
- tx2_diagnostic: 220ms (P50)
- tx3_decided: 250ms (P50)
- tx4_content: 105ms (P50)
```

### Target After Phase 1:
```
P50: 400ms (38% reduction)
P95: 700ms (36% reduction)
P99: 1100ms (39% reduction)

Breakdown:
- tx1_graded: 60ms (20% improvement)
- tx2_diagnostic: 100ms (55% improvement)
- tx3_decided: 100ms (60% improvement)
- tx4_content: 90ms (14% improvement)
```

### Monitoring Queries:

```typescript
// Add to learning-loop.service.ts processAnswer()
const metrics = {
  totalMs: Date.now() - loopStarted,
  stages: {
    tx1: tx1Latency,
    tx2: tx2Latency,
    tx3: tx3Latency,
    tx4: tx4Latency,
  },
  parallelization: {
    diagnosticParallelized: true,
    contextParallelized: true,
  },
};

this.logger.log(`perf_metrics: ${JSON.stringify(metrics)}`);
```

---

## Rollback Plan

If latency increases or errors spike:

1. **Diagnostic parallelization rollback:**
   ```typescript
   // Revert to sequential
   const retentionFactor = await this.computeAndStoreRetention(...);
   const velocityFactor = await this.computeAndStoreVelocity(...);
   const errorRecoveryFactor = await this.computeAndStoreErrorRecovery(...);
   ```

2. **Context parallelization rollback:**
   - Revert commit
   - Sequential queries are safe default

3. **Index rollback:**
   ```sql
   DROP INDEX IF EXISTS idx_diagnostic_factor_student_concept_type;
   -- etc.
   ```

4. **Cache rollback:**
   - Remove ConceptCacheService injection
   - Revert to direct Prisma queries

---

## Questions for Implementation

1. **Database connection pool size:** Current pool size? Need to increase for parallel queries?
2. **Monitoring tooling:** DataDog / New Relic / custom? Where to send perf metrics?
3. **Feature flag:** Should parallelization be behind a flag for gradual rollout?
4. **Load testing:** What peak load should we test? (students/second, questions/second)

---

## Next Steps

After Phase 1 success:
- Move to Phase 2: Redis caching infrastructure
- Implement question pool pre-warming
- Explore LLM pre-generation (if LIVE_AGENTIC enabled)
