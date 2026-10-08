-- Daily spend ledger for billed APIs (call + dollar caps shared across API replicas).
CREATE TABLE "ApiSpendDay" (
    "service" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiSpendDay_pkey" PRIMARY KEY ("service","day")
);
