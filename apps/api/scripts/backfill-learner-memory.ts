/**
 * One-off (and safe to re-run): fills the learner memory from every finished test and lesson final
 * check already in the database. Run from apps/api with the root .env loaded:
 *   set -a; source ../../.env; set +a; node --import tsx scripts/backfill-learner-memory.ts
 */
import { PrismaClient } from "@cogna/database";
import { backfillLearnerMemory } from "../src/learner/learner-memory";

const prisma = new PrismaClient();
backfillLearnerMemory(prisma, console.log)
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
