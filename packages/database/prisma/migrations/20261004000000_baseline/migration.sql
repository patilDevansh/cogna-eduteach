-- Baseline: the full schema as of 2026-10-04, replacing nine earlier migrations that only
-- created 11 of the tables (the rest came from 'prisma db push'). Existing databases mark this
-- as applied instead of running it: see docs/DATABASE_MIGRATIONS.md.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARENT', 'STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ClassroomRunPhase" AS ENUM ('ENROLLMENT', 'DIAGNOSTIC', 'CLASS_REPORT', 'TEACHING', 'INDEPENDENT_EXIT', 'FINAL_REPORT', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ClassroomRunStatus" AS ENUM ('DRAFT', 'LIVE', 'PAUSED', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClassroomAssignmentKind" AS ENUM ('DIAGNOSTIC', 'TEACHING', 'INDEPENDENT_EXIT');

-- CreateEnum
CREATE TYPE "ClassroomAssignmentStatus" AS ENUM ('WAITING', 'READY', 'IN_PROGRESS', 'COMPLETE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConceptKind" AS ENUM ('PREREQ', 'CORE');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('NUMERIC', 'MCQ', 'WORD_PROBLEM');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('BASELINE', 'ADAPTIVE_PRACTICE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('CORRECT', 'INCORRECT', 'PARTIALLY_CORRECT', 'INVALID_FORMAT', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'GRADED', 'PROFILE_UPDATED', 'DECIDED', 'CONTENT_RESOLVED', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT');

-- CreateEnum
CREATE TYPE "UiAction" AS ENUM ('SHOW_QUESTION', 'SHOW_EXPLANATION', 'SHOW_HINT', 'END_SESSION', 'SUGGEST_BREAK');

-- CreateEnum
CREATE TYPE "LearningIntent" AS ENUM ('STANDARD_PRACTICE', 'INCREASE_DIFFICULTY', 'DECREASE_DIFFICULTY', 'TARGET_MISCONCEPTION', 'REVIEW_PREREQUISITE', 'EXECUTE_DUE_REVISION', 'RETEST_AFTER_EXPLANATION', 'CONCEPT_REINFORCEMENT', 'BASELINE_ASSESSMENT', 'RETENTION_REVIEW', 'TRANSFER_CHECK', 'BREAK_FOR_FATIGUE', 'UNIT_BRIDGE_REVIEW', 'HORIZON_FOCUS_PRACTICE', 'SHOW_TEACHING_MODULE', 'MODALITY_RETEST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT');

-- CreateEnum
CREATE TYPE "ReportDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "ReportDeliveryChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "ContentReviewStatus" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentReviewType" AS ENUM ('QUESTION', 'EXPLANATION');

-- CreateEnum
CREATE TYPE "ModalityKind" AS ENUM ('TEXT', 'ANIMATION', 'VIDEO', 'VOICE');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('CANDIDATE', 'SHADOW', 'EXPERIMENT', 'PROMOTION_REQUESTED', 'PROMOTED', 'REJECTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "RemediationState" AS ENUM ('UNCONFIRMED', 'TARGETING', 'EXPLANATION_REQUIRED', 'RETESTING', 'RESOLVED', 'STILL_ACTIVE');

-- CreateEnum
CREATE TYPE "RevisionItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportAudience" AS ENUM ('STUDENT', 'PARENT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ReportTrigger" AS ENUM ('SESSION_ENDED', 'DAILY_REPORT_JOB', 'WEEKLY_REPORT_JOB', 'PARENT_REQUESTED_REPORT');

-- CreateEnum
CREATE TYPE "StepValidityV2" AS ENUM ('VALID', 'INVALID', 'AMBIGUOUS', 'PARSE_FAILED');

-- CreateEnum
CREATE TYPE "StepTransformationV2" AS ENUM ('SIMPLIFY', 'ADD_BOTH_SIDES', 'SUBTRACT_BOTH_SIDES', 'MULTIPLY_BOTH_SIDES', 'DIVIDE_BOTH_SIDES', 'DISTRIBUTE', 'COMBINE_LIKE_TERMS', 'SUBSTITUTE_CHECK', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AssistanceLevelV2" AS ENUM ('NONE', 'REVIEW_OPPORTUNITY', 'GENERAL_PROMPT', 'LOCATION_HINT', 'RULE_PROMPT', 'MICRO_QUESTION', 'PARTIAL_WORKED_STEP', 'FULL_EXPLANATION');

-- CreateEnum
CREATE TYPE "MicroSkillStatusV2" AS ENUM ('UNKNOWN', 'EMERGING', 'DEVELOPING', 'RELIABLE', 'LIKELY_GAP');

-- CreateEnum
CREATE TYPE "DiagnosticV2SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "VerificationSourceV2" AS ENUM ('DETERMINISTIC', 'AI_FALLBACK');

-- CreateEnum
CREATE TYPE "PersonalizedVideoAssignmentStatus" AS ENUM ('PREPARING', 'UNDER_REVIEW', 'READY', 'FALLBACK', 'TEMPORARILY_UNAVAILABLE', 'ABSTAINED');

-- CreateEnum
CREATE TYPE "PersonalizedVideoEvidenceKind" AS ENUM ('WATCHED', 'COMPLETED', 'INDEPENDENT_EXIT');

-- CreateEnum
CREATE TYPE "HypothesisSourceV2" AS ENUM ('RULE', 'AI');

-- CreateEnum
CREATE TYPE "MicroSkillEvidenceKindV2" AS ENUM ('INDEPENDENT_CORRECT', 'INDEPENDENT_INCORRECT', 'SELF_CORRECTED', 'ASSISTED_CORRECT', 'ASSISTED_INCORRECT', 'TRANSFER_SUCCESS', 'TRANSFER_FAILURE', 'SKIPPED', 'INSUFFICIENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "role" "UserRole" NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "primaryParentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL DEFAULT 8,
    "curriculum" TEXT NOT NULL DEFAULT 'CBSE',
    "accessCodeHash" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "aiAssistedPracticePaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomEnrollment" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "rollNumber" TEXT,
    "admissionNumber" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ClassroomEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomRun" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "phase" "ClassroomRunPhase" NOT NULL DEFAULT 'ENROLLMENT',
    "status" "ClassroomRunStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomAssignment" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "kind" "ClassroomAssignmentKind" NOT NULL,
    "status" "ClassroomAssignmentStatus" NOT NULL DEFAULT 'WAITING',
    "diagnosticSessionId" TEXT,
    "videoAssignmentId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "availableAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentStudentLink" (
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'parent',
    "canViewReports" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ParentStudentLink_pkey" PRIMARY KEY ("parentId","studentId")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ConceptKind" NOT NULL,
    "masteryThreshold" DOUBLE PRECISION NOT NULL,
    "minimumEvidence" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptPrerequisite" (
    "conceptId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "ConceptPrerequisite_pkey" PRIMARY KEY ("conceptId","prerequisiteId")
);

-- CreateTable
CREATE TABLE "Misconception" (
    "id" TEXT NOT NULL,
    "conceptIds" TEXT[],
    "minimumMatchingAttempts" INTEGER NOT NULL,
    "activationConfidence" DOUBLE PRECISION NOT NULL,
    "alternativeExplanations" TEXT[],
    "maxTargetedBeforeExplanation" INTEGER NOT NULL DEFAULT 2,
    "maxExplanationCycles" INTEGER NOT NULL DEFAULT 2,
    "resolutionConsecutiveCorrect" INTEGER NOT NULL DEFAULT 2,
    "resolutionMaxHintLevel" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Misconception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "conceptId" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "questionIntent" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "stem" TEXT NOT NULL,
    "acceptedAnswers" JSONB NOT NULL,
    "misconceptionsTested" TEXT[],
    "misconceptionPatterns" JSONB,
    "prerequisiteConceptIds" TEXT[],
    "solutionSteps" JSONB NOT NULL,
    "hintLadder" JSONB NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "itemQualityWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "options" JSONB,
    "unitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id","version")
);

-- CreateTable
CREATE TABLE "Explanation" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "misconceptionId" TEXT,
    "style" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "checkForUnderstanding" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Explanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionMode" "SessionMode" NOT NULL DEFAULT 'ADAPTIVE_PRACTICE',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "baselineSlotIndex" INTEGER NOT NULL DEFAULT 0,
    "activeConceptId" TEXT,
    "activeDifficulty" INTEGER NOT NULL DEFAULT 2,
    "breakSuggestedAt" TIMESTAMP(3),

    CONSTRAINT "LearningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawEvent" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "grade" "Grade" NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeToFirstResponseMs" INTEGER NOT NULL,
    "totalTimeMs" INTEGER NOT NULL,
    "idleTimeMs" INTEGER NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "hintCount" INTEGER NOT NULL,
    "highestHintLevel" INTEGER NOT NULL,
    "selfRatedConfidence" INTEGER,
    "inferredConfidence" DOUBLE PRECISION,
    "answerChangedBeforeSubmit" BOOLEAN NOT NULL,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'GRADED',
    "storedResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasteryScore" (
    "studentId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "modelVersion" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasteryScore_pkey" PRIMARY KEY ("studentId","conceptId")
);

-- CreateTable
CREATE TABLE "MasteryHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "attemptId" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticFactor" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conceptId" TEXT,
    "factorType" TEXT NOT NULL,
    "factorKey" TEXT,
    "value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "evidenceAttemptIds" TEXT[],
    "alternativeExplanations" TEXT[],
    "modelVersion" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MisconceptionRemediationState" (
    "studentId" TEXT NOT NULL,
    "misconceptionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "state" "RemediationState" NOT NULL DEFAULT 'UNCONFIRMED',
    "targetedAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "explanationCycleCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MisconceptionRemediationState_pkey" PRIMARY KEY ("studentId","misconceptionId","conceptId")
);

-- CreateTable
CREATE TABLE "MisconceptionRemediationStateHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "misconceptionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "fromState" "RemediationState",
    "toState" "RemediationState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MisconceptionRemediationStateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerProfile" (
    "studentId" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL DEFAULT 1,
    "masterySummary" JSONB NOT NULL DEFAULT '{}',
    "activeMisconceptions" JSONB NOT NULL DEFAULT '[]',
    "confidenceCalibration" TEXT,
    "hintDependence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisionNeedSignals" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerProfile_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "LearnerProfileHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnerProfileHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningDecision" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptId" TEXT,
    "uiAction" "UiAction" NOT NULL,
    "learningIntent" "LearningIntent" NOT NULL,
    "contentStyle" JSONB,
    "parameters" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "decisionVersion" TEXT NOT NULL,
    "inputSnapshot" JSONB,
    "selectionReasoning" JSONB,
    "latencyMs" INTEGER,
    "fallbackGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionQueueItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "microSkillId" TEXT,
    "type" TEXT NOT NULL,
    "targetMisconception" TEXT,
    "priority" DOUBLE PRECISION NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "status" "RevisionItemStatus" NOT NULL DEFAULT 'PENDING',
    "reasoning" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "recommendationVersion" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "audience" "ReportAudience" NOT NULL,
    "trigger" "ReportTrigger" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "structuredData" JSONB NOT NULL,
    "renderedText" TEXT NOT NULL,
    "reportVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "runAfter" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resultRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionEstimate" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "estimate" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "daysSinceSuccess" INTEGER NOT NULL,
    "evidenceAttemptIds" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplanationOutcome" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "explanationId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "misconceptionId" TEXT,
    "viewedEventId" TEXT NOT NULL,
    "retestAttemptId" TEXT,
    "effective" BOOLEAN,
    "highestHintLevel" INTEGER,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExplanationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemStatistic" (
    "questionId" TEXT NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "correctRate" DOUBLE PRECISION NOT NULL,
    "avgTimeMs" INTEGER NOT NULL,
    "hintRate" DOUBLE PRECISION NOT NULL,
    "misconceptionHits" JSONB NOT NULL,
    "discriminationScore" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemStatistic_pkey" PRIMARY KEY ("questionId","questionVersion")
);

-- CreateTable
CREATE TABLE "ReportDelivery" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "channel" "ReportDeliveryChannel" NOT NULL,
    "status" "ReportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReview" (
    "id" TEXT NOT NULL,
    "contentType" "ContentReviewType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "reviewer" TEXT NOT NULL,
    "status" "ContentReviewStatus" NOT NULL,
    "checklist" JSONB NOT NULL,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentDefinition" (
    "id" TEXT NOT NULL,
    "experimentKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "armsJson" JSONB NOT NULL,
    "eligibilityJson" JSONB NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "experimentKey" TEXT NOT NULL,
    "arm" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sticky" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "draftType" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "difficulty" INTEGER,
    "targetMisconception" TEXT,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT,
    "promptVersion" TEXT,
    "status" TEXT NOT NULL,
    "validationErrors" JSONB,
    "reviewNotes" TEXT,
    "promotedContentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateActionScore" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "candidatesJson" JSONB NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "experimentId" TEXT,
    "experimentArmId" TEXT,
    "shadow" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateActionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumUnit" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" TEXT,
    "prerequisiteUnitIds" JSONB NOT NULL,
    "unlockRule" TEXT NOT NULL,
    "priorityWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitConcept" (
    "unitId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "kind" "ConceptKind" NOT NULL,

    CONSTRAINT "UnitConcept_pkey" PRIMARY KEY ("unitId","conceptId")
);

-- CreateTable
CREATE TABLE "CurriculumPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "horizonWeeks" INTEGER NOT NULL,
    "planJson" JSONB NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurriculumPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherStudentLink" (
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "role" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModalityAsset" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "modality" "ModalityKind" NOT NULL,
    "conceptId" TEXT NOT NULL,
    "misconceptionId" TEXT,
    "unitId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "transcriptRef" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "retestQuestionId" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModalityAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModalityOutcome" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "dwellMs" INTEGER NOT NULL,
    "retestCorrect" BOOLEAN,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModalityOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'CANDIDATE',
    "artifactRef" TEXT NOT NULL,
    "safetyEvalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "promotionRequestedBy" TEXT,
    "promotionRequestedAt" TIMESTAMP(3),
    "promotionApprovedBy" TEXT,
    "promotionApprovedAt" TIMESTAMP(3),
    "promotionRejectedBy" TEXT,
    "promotionRejectedAt" TIMESTAMP(3),
    "promotionRejectedReason" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,
    "rolledBackReason" TEXT,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyEval" (
    "id" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "metricsJson" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyEval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDecisionAuditLog" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "model" TEXT,
    "ruleOutput" JSONB NOT NULL,
    "aiOutput" JSONB,
    "rejectedOutput" JSONB,
    "served" BOOLEAN NOT NULL DEFAULT false,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecisionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticV2Session" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "DiagnosticV2SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStageId" TEXT NOT NULL,
    "stageHistory" JSONB NOT NULL DEFAULT '[]',
    "policyVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "DiagnosticV2Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticV2Attempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "equationPrompt" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'PRE_WRITTEN',
    "templateId" TEXT,
    "stageId" TEXT NOT NULL DEFAULT 'ENTRY_TWO_STEP',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DiagnosticV2Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticV2Step" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "previousLine" TEXT NOT NULL,
    "submittedLine" TEXT NOT NULL,
    "normalizedPreviousLine" TEXT,
    "normalizedSubmittedLine" TEXT,
    "attemptedTransformation" "StepTransformationV2" NOT NULL,
    "validity" "StepValidityV2" NOT NULL,
    "verificationSource" "VerificationSourceV2" NOT NULL DEFAULT 'DETERMINISTIC',
    "aiGraderConfidence" DOUBLE PRECISION,
    "firstInvalidActionCode" TEXT,
    "firstInvalidActionDescription" TEXT,
    "primaryMicroSkillId" TEXT,
    "supportingMicroSkillIds" TEXT[],
    "topicId" TEXT,
    "competencyFamilyId" TEXT,
    "contextModifierIds" TEXT[],
    "assistanceLevel" "AssistanceLevelV2" NOT NULL DEFAULT 'NONE',
    "selfCorrectionOfStepId" TEXT,
    "verifierVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticV2Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroSkillEvidenceEventV2" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stepId" TEXT,
    "microSkillId" TEXT NOT NULL,
    "topicId" TEXT,
    "competencyFamilyId" TEXT,
    "contextModifierIds" TEXT[],
    "evidenceKind" "MicroSkillEvidenceKindV2" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "assistanceLevel" "AssistanceLevelV2" NOT NULL DEFAULT 'NONE',
    "evidencePolicyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicroSkillEvidenceEventV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroSkillStateV2" (
    "studentId" TEXT NOT NULL,
    "microSkillId" TEXT NOT NULL,
    "status" "MicroSkillStatusV2" NOT NULL DEFAULT 'UNKNOWN',
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "independentSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "independentFailureCount" INTEGER NOT NULL DEFAULT 0,
    "assistedSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "observedContextStrengths" TEXT[],
    "observedContextGaps" TEXT[],
    "lastEvidenceAt" TIMESTAMP(3),
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "policyVersion" TEXT NOT NULL,

    CONSTRAINT "MicroSkillStateV2_pkey" PRIMARY KEY ("studentId","microSkillId")
);

-- CreateTable
CREATE TABLE "DiagnosticV2Hypothesis" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "microSkillId" TEXT NOT NULL,
    "attemptId" TEXT,
    "stepId" TEXT,
    "hypothesisLabel" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "source" "HypothesisSourceV2" NOT NULL,
    "childFacingSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticV2Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticV2EvidenceRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptId" TEXT,
    "stepId" TEXT,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "questionNumber" INTEGER,
    "stepNumber" INTEGER,
    "questionText" TEXT,
    "submittedText" TEXT,
    "verbatimText" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticV2EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotusSessionRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "pseudonymId" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotusSessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotusEvidenceRecord" (
    "id" TEXT NOT NULL,
    "sessionRecordId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "questionText" TEXT,
    "submittedText" TEXT,
    "verificationStatus" TEXT,
    "verbatimText" TEXT NOT NULL,
    "metadata" JSONB,
    "questionId" TEXT,
    "submissionId" TEXT,
    "queuedAt" TIMESTAMP(3),
    "analysisStartedAt" TIMESTAMP(3),
    "analysisCompletedAt" TIMESTAMP(3),
    "installedSlot" INTEGER,
    "shownAckAt" TIMESTAMP(3),
    "costCents" INTEGER,
    "promptVersion" TEXT,
    "modelVersion" TEXT,
    "policyVersion" TEXT,
    "skillMapVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotusEvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotusQuestionBankItem" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "question" JSONB NOT NULL,
    "questionPrint" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "itemKind" TEXT NOT NULL,
    "level" TEXT,
    "sourceSessionId" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "firstAnsweredAt" TIMESTAMP(3) NOT NULL,
    "reuseCount" INTEGER NOT NULL DEFAULT 0,
    "lastReusedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotusQuestionBankItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizedVideoAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentKey" TEXT,
    "schoolId" TEXT,
    "lotusSessionId" TEXT,
    "status" "PersonalizedVideoAssignmentStatus" NOT NULL DEFAULT 'PREPARING',
    "diagnosticState" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "learningObjective" TEXT NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    "script" JSONB,
    "scriptSource" TEXT,
    "mathValidation" JSONB,
    "languageValidation" JSONB,
    "assetId" TEXT,
    "renderJobId" TEXT,
    "renderResult" JSONB,
    "fallbackReason" TEXT,
    "abstainReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizedVideoAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizedVideoEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "PersonalizedVideoEvidenceKind" NOT NULL,
    "dwellMs" INTEGER,
    "exitPrompt" TEXT,
    "exitAnswer" TEXT,
    "exitWorking" TEXT,
    "exitCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalizedVideoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_identityKey_key" ON "Teacher"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");

-- CreateIndex
CREATE INDEX "Teacher_schoolId_idx" ON "Teacher"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_userId_key" ON "Parent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Student_primaryParentId_idx" ON "Student"("primaryParentId");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_joinCode_key" ON "Classroom"("joinCode");

-- CreateIndex
CREATE INDEX "Classroom_teacherId_archivedAt_idx" ON "Classroom"("teacherId", "archivedAt");

-- CreateIndex
CREATE INDEX "Classroom_schoolId_idx" ON "Classroom"("schoolId");

-- CreateIndex
CREATE INDEX "ClassroomEnrollment_classroomId_leftAt_idx" ON "ClassroomEnrollment"("classroomId", "leftAt");

-- CreateIndex
CREATE INDEX "ClassroomEnrollment_studentId_idx" ON "ClassroomEnrollment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomEnrollment_classroomId_studentId_key" ON "ClassroomEnrollment"("classroomId", "studentId");

-- CreateIndex
CREATE INDEX "ClassroomRun_classroomId_createdAt_idx" ON "ClassroomRun"("classroomId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassroomRun_status_phase_idx" ON "ClassroomRun"("status", "phase");

-- CreateIndex
CREATE INDEX "ClassroomAssignment_enrollmentId_status_idx" ON "ClassroomAssignment"("enrollmentId", "status");

-- CreateIndex
CREATE INDEX "ClassroomAssignment_runId_kind_status_idx" ON "ClassroomAssignment"("runId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomAssignment_runId_enrollmentId_kind_key" ON "ClassroomAssignment"("runId", "enrollmentId", "kind");

-- CreateIndex
CREATE INDEX "idx_concept_prerequisite_concept" ON "ConceptPrerequisite"("conceptId");

-- CreateIndex
CREATE INDEX "Question_conceptId_difficulty_reviewStatus_idx" ON "Question"("conceptId", "difficulty", "reviewStatus");

-- CreateIndex
CREATE INDEX "Question_unitId_idx" ON "Question"("unitId");

-- CreateIndex
CREATE INDEX "idx_question_concept_difficulty_intent" ON "Question"("conceptId", "difficulty", "questionIntent", "reviewStatus");

-- CreateIndex
CREATE INDEX "LearningSession_studentId_startedAt_idx" ON "LearningSession"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "RawEvent_studentId_createdAt_idx" ON "RawEvent"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "RawEvent_sessionId_createdAt_idx" ON "RawEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_eventId_key" ON "Attempt"("eventId");

-- CreateIndex
CREATE INDEX "Attempt_studentId_createdAt_idx" ON "Attempt"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_createdAt_idx" ON "Attempt"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_attempt_student_recent" ON "Attempt"("studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_attempt_session_recent" ON "Attempt"("sessionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MasteryHistory_studentId_conceptId_createdAt_idx" ON "MasteryHistory"("studentId", "conceptId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticFactor_studentId_createdAt_idx" ON "DiagnosticFactor"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_diagnostic_factor_student_concept_type" ON "DiagnosticFactor"("studentId", "conceptId", "factorType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_misconception_remediation_student_concept" ON "MisconceptionRemediationState"("studentId", "conceptId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "MisconceptionRemediationStateHistory_studentId_misconceptio_idx" ON "MisconceptionRemediationStateHistory"("studentId", "misconceptionId", "conceptId", "createdAt");

-- CreateIndex
CREATE INDEX "LearnerProfileHistory_studentId_createdAt_idx" ON "LearnerProfileHistory"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningDecision_sessionId_createdAt_idx" ON "LearningDecision"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "RevisionQueueItem_studentId_status_dueAt_idx" ON "RevisionQueueItem"("studentId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "idx_revision_queue_due" ON "RevisionQueueItem"("studentId", "status", "dueAt" DESC, "priority" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RevisionQueueItem_studentId_dedupeKey_key" ON "RevisionQueueItem"("studentId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Report_studentId_createdAt_idx" ON "Report"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_createdAt_idx" ON "Job"("status", "runAfter", "createdAt");

-- CreateIndex
CREATE INDEX "Job_jobType_status_idx" ON "Job"("jobType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobType_idempotencyKey_key" ON "Job"("jobType", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RetentionEstimate_studentId_conceptId_idx" ON "RetentionEstimate"("studentId", "conceptId");

-- CreateIndex
CREATE INDEX "idx_retention_estimate_valid" ON "RetentionEstimate"("studentId", "conceptId", "validUntil", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RetentionEstimate_studentId_conceptId_modelVersion_validUnt_key" ON "RetentionEstimate"("studentId", "conceptId", "modelVersion", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ExplanationOutcome_viewedEventId_key" ON "ExplanationOutcome"("viewedEventId");

-- CreateIndex
CREATE INDEX "ExplanationOutcome_studentId_conceptId_idx" ON "ExplanationOutcome"("studentId", "conceptId");

-- CreateIndex
CREATE INDEX "ExplanationOutcome_sessionId_idx" ON "ExplanationOutcome"("sessionId");

-- CreateIndex
CREATE INDEX "ReportDelivery_reportId_idx" ON "ReportDelivery"("reportId");

-- CreateIndex
CREATE INDEX "ReportDelivery_status_idx" ON "ReportDelivery"("status");

-- CreateIndex
CREATE INDEX "ContentReview_contentType_contentId_contentVersion_idx" ON "ContentReview"("contentType", "contentId", "contentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentDefinition_experimentKey_key" ON "ExperimentDefinition"("experimentKey");

-- CreateIndex
CREATE INDEX "ExperimentAssignment_experimentKey_arm_idx" ON "ExperimentAssignment"("experimentKey", "arm");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentAssignment_studentId_experimentKey_key" ON "ExperimentAssignment"("studentId", "experimentKey");

-- CreateIndex
CREATE INDEX "ContentDraft_status_createdAt_idx" ON "ContentDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentDraft_conceptId_draftType_idx" ON "ContentDraft"("conceptId", "draftType");

-- CreateIndex
CREATE INDEX "CandidateActionScore_studentId_createdAt_idx" ON "CandidateActionScore"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateActionScore_experimentId_experimentArmId_idx" ON "CandidateActionScore"("experimentId", "experimentArmId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumUnit_unitId_key" ON "CurriculumUnit"("unitId");

-- CreateIndex
CREATE INDEX "CurriculumUnit_subjectId_idx" ON "CurriculumUnit"("subjectId");

-- CreateIndex
CREATE INDEX "UnitConcept_conceptId_idx" ON "UnitConcept"("conceptId");

-- CreateIndex
CREATE INDEX "CurriculumPlan_studentId_validUntil_idx" ON "CurriculumPlan"("studentId", "validUntil");

-- CreateIndex
CREATE INDEX "TeacherStudentLink_studentId_idx" ON "TeacherStudentLink"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherStudentLink_teacherId_studentId_key" ON "TeacherStudentLink"("teacherId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_subjectId_key" ON "Subject"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ModalityAsset_assetId_key" ON "ModalityAsset"("assetId");

-- CreateIndex
CREATE INDEX "ModalityAsset_subjectId_conceptId_idx" ON "ModalityAsset"("subjectId", "conceptId");

-- CreateIndex
CREATE INDEX "ModalityAsset_reviewStatus_idx" ON "ModalityAsset"("reviewStatus");

-- CreateIndex
CREATE INDEX "ModalityAsset_unitId_idx" ON "ModalityAsset"("unitId");

-- CreateIndex
CREATE INDEX "ModalityOutcome_studentId_createdAt_idx" ON "ModalityOutcome"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ModalityOutcome_assetId_idx" ON "ModalityOutcome"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_policyVersion_key" ON "PolicyVersion"("policyVersion");

-- CreateIndex
CREATE INDEX "PolicyVersion_status_idx" ON "PolicyVersion"("status");

-- CreateIndex
CREATE INDEX "SafetyEval_policyVersion_idx" ON "SafetyEval"("policyVersion");

-- CreateIndex
CREATE INDEX "AiDecisionAuditLog_capability_studentId_createdAt_idx" ON "AiDecisionAuditLog"("capability", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticV2Session_studentId_startedAt_idx" ON "DiagnosticV2Session"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "DiagnosticV2Attempt_sessionId_createdAt_idx" ON "DiagnosticV2Attempt"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticV2Step_attemptId_stepIndex_idx" ON "DiagnosticV2Step"("attemptId", "stepIndex");

-- CreateIndex
CREATE INDEX "MicroSkillEvidenceEventV2_studentId_microSkillId_createdAt_idx" ON "MicroSkillEvidenceEventV2"("studentId", "microSkillId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticV2Hypothesis_sessionId_microSkillId_createdAt_idx" ON "DiagnosticV2Hypothesis"("sessionId", "microSkillId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticV2Hypothesis_attemptId_stepId_idx" ON "DiagnosticV2Hypothesis"("attemptId", "stepId");

-- CreateIndex
CREATE INDEX "DiagnosticV2EvidenceRecord_sessionId_createdAt_idx" ON "DiagnosticV2EvidenceRecord"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticV2EvidenceRecord_sessionId_eventType_createdAt_idx" ON "DiagnosticV2EvidenceRecord"("sessionId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticV2EvidenceRecord_attemptId_stepId_idx" ON "DiagnosticV2EvidenceRecord"("attemptId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "LotusSessionRecord_sessionId_key" ON "LotusSessionRecord"("sessionId");

-- CreateIndex
CREATE INDEX "LotusSessionRecord_studentId_startedAt_idx" ON "LotusSessionRecord"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "LotusSessionRecord_pseudonymId_idx" ON "LotusSessionRecord"("pseudonymId");

-- CreateIndex
CREATE INDEX "LotusSessionRecord_retentionUntil_idx" ON "LotusSessionRecord"("retentionUntil");

-- CreateIndex
CREATE INDEX "LotusEvidenceRecord_sessionRecordId_createdAt_idx" ON "LotusEvidenceRecord"("sessionRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "LotusEvidenceRecord_sessionRecordId_eventType_idx" ON "LotusEvidenceRecord"("sessionRecordId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "LotusEvidenceRecord_sessionRecordId_questionId_submissionId_key" ON "LotusEvidenceRecord"("sessionRecordId", "questionId", "submissionId");

-- CreateIndex
CREATE INDEX "LotusQuestionBankItem_topic_skillId_isActive_idx" ON "LotusQuestionBankItem"("topic", "skillId", "isActive");

-- CreateIndex
CREATE INDEX "LotusQuestionBankItem_topic_questionPrint_idx" ON "LotusQuestionBankItem"("topic", "questionPrint");

-- CreateIndex
CREATE UNIQUE INDEX "LotusQuestionBankItem_sourceSessionId_sourceQuestionId_key" ON "LotusQuestionBankItem"("sourceSessionId", "sourceQuestionId");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_studentId_createdAt_idx" ON "PersonalizedVideoAssignment"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_studentKey_idx" ON "PersonalizedVideoAssignment"("studentKey");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_schoolId_idx" ON "PersonalizedVideoAssignment"("schoolId");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_status_idx" ON "PersonalizedVideoAssignment"("status");

-- CreateIndex
CREATE INDEX "PersonalizedVideoAssignment_lotusSessionId_idx" ON "PersonalizedVideoAssignment"("lotusSessionId");

-- CreateIndex
CREATE INDEX "PersonalizedVideoEvent_assignmentId_createdAt_idx" ON "PersonalizedVideoEvent"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalizedVideoEvent_studentId_kind_idx" ON "PersonalizedVideoEvent"("studentId", "kind");

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomRun" ADD CONSTRAINT "ClassroomRun_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ClassroomRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssignment" ADD CONSTRAINT "ClassroomAssignment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassroomEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptPrerequisite" ADD CONSTRAINT "ConceptPrerequisite_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptPrerequisite" ADD CONSTRAINT "ConceptPrerequisite_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Explanation" ADD CONSTRAINT "Explanation_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RawEvent"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_questionId_questionVersion_fkey" FOREIGN KEY ("questionId", "questionVersion") REFERENCES "Question"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryScore" ADD CONSTRAINT "MasteryScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryScore" ADD CONSTRAINT "MasteryScore_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryHistory" ADD CONSTRAINT "MasteryHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticFactor" ADD CONSTRAINT "DiagnosticFactor_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MisconceptionRemediationState" ADD CONSTRAINT "MisconceptionRemediationState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MisconceptionRemediationStateHistory" ADD CONSTRAINT "MisconceptionRemediationStateHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerProfile" ADD CONSTRAINT "LearnerProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningDecision" ADD CONSTRAINT "LearningDecision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningDecision" ADD CONSTRAINT "LearningDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionQueueItem" ADD CONSTRAINT "RevisionQueueItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionEstimate" ADD CONSTRAINT "RetentionEstimate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionEstimate" ADD CONSTRAINT "RetentionEstimate_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplanationOutcome" ADD CONSTRAINT "ExplanationOutcome_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemStatistic" ADD CONSTRAINT "ItemStatistic_questionId_questionVersion_fkey" FOREIGN KEY ("questionId", "questionVersion") REFERENCES "Question"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDelivery" ADD CONSTRAINT "ReportDelivery_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumUnit" ADD CONSTRAINT "CurriculumUnit_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("subjectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitConcept" ADD CONSTRAINT "UnitConcept_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "CurriculumUnit"("unitId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModalityAsset" ADD CONSTRAINT "ModalityAsset_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("subjectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModalityOutcome" ADD CONSTRAINT "ModalityOutcome_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ModalityAsset"("assetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_safetyEvalId_fkey" FOREIGN KEY ("safetyEvalId") REFERENCES "SafetyEval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticV2Session" ADD CONSTRAINT "DiagnosticV2Session_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticV2Attempt" ADD CONSTRAINT "DiagnosticV2Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticV2Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticV2Step" ADD CONSTRAINT "DiagnosticV2Step_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DiagnosticV2Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroSkillEvidenceEventV2" ADD CONSTRAINT "MicroSkillEvidenceEventV2_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroSkillStateV2" ADD CONSTRAINT "MicroSkillStateV2_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticV2Hypothesis" ADD CONSTRAINT "DiagnosticV2Hypothesis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticV2Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticV2EvidenceRecord" ADD CONSTRAINT "DiagnosticV2EvidenceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticV2Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotusEvidenceRecord" ADD CONSTRAINT "LotusEvidenceRecord_sessionRecordId_fkey" FOREIGN KEY ("sessionRecordId") REFERENCES "LotusSessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedVideoAssignment" ADD CONSTRAINT "PersonalizedVideoAssignment_lotusSessionId_fkey" FOREIGN KEY ("lotusSessionId") REFERENCES "LotusSessionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedVideoEvent" ADD CONSTRAINT "PersonalizedVideoEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PersonalizedVideoAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

