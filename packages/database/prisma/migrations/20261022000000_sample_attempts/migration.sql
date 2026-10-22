-- Sample diagnostics from a public link: parent email and consent first, report unlocked by payment.
CREATE TABLE "SampleAttempt" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT NOT NULL,
    "amountPaise" INTEGER,
    "orderId" TEXT,
    "paymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "resultEmailedAt" TIMESTAMP(3),
    "reportEmailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SampleAttempt_token_key" ON "SampleAttempt"("token");
CREATE UNIQUE INDEX "SampleAttempt_studentId_key" ON "SampleAttempt"("studentId");
CREATE UNIQUE INDEX "SampleAttempt_orderId_key" ON "SampleAttempt"("orderId");
CREATE INDEX "SampleAttempt_parentEmail_createdAt_idx" ON "SampleAttempt"("parentEmail", "createdAt");
CREATE INDEX "SampleAttempt_ipHash_createdAt_idx" ON "SampleAttempt"("ipHash", "createdAt");
CREATE INDEX "SampleAttempt_createdAt_idx" ON "SampleAttempt"("createdAt");

ALTER TABLE "SampleAttempt" ADD CONSTRAINT "SampleAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
