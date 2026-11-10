import { PrismaClient } from "/Users/dp/eduTeach/.claude/worktrees/lotus-new-architecture/packages/database/node_modules/@prisma/client/index.js";

const prisma = new PrismaClient();
const r = await prisma.lotusSessionRecord.findUnique({
  where: { sessionId: "aa1c132a-07c0-4d9b-8788-e2b05f344263" },
});

if (r) {
  const p = r.payload;
  console.log("FINAL REPORT KEYS:", Object.keys(p.finalReport || {}));
  console.log("FINAL REPORT FULL:\n", JSON.stringify(p.finalReport, null, 2));
}
await prisma.$disconnect();
