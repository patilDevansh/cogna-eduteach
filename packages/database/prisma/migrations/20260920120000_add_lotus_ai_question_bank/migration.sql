-- AI-authored question content becomes reusable only after a real learner has
-- answered it. No student response or learner identifier is copied here.
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

CREATE UNIQUE INDEX "LotusQuestionBankItem_sourceSessionId_sourceQuestionId_key"
  ON "LotusQuestionBankItem"("sourceSessionId", "sourceQuestionId");
CREATE INDEX "LotusQuestionBankItem_topic_skillId_isActive_idx"
  ON "LotusQuestionBankItem"("topic", "skillId", "isActive");
CREATE INDEX "LotusQuestionBankItem_topic_questionPrint_idx"
  ON "LotusQuestionBankItem"("topic", "questionPrint");
