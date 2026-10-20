/**
 * Dev only: creates the three walkthrough students (walk_aarav, walk_meena,
 * walk_rohan) with access codes, so the recorded pilot can sign in and join a
 * class like real students. Run from the repo root:
 *   node scripts/pilot-walkthrough/seed-students.mjs
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../packages/database/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

if (process.env.NODE_ENV === "production") throw new Error("The walkthrough seed never runs in production.");

export const WALKTHROUGH_STUDENTS = [
  { id: "walk_aarav", name: "Aarav Choudhury", code: "AARAV-8B", gap: "signs" },
  { id: "walk_meena", name: "Meena Krishnan", code: "MEENA-8B", gap: "grouping" },
  { id: "walk_rohan", name: "Rohan Sengupta", code: "ROHAN-8B", gap: "common-factor" },
];

const hash = (code) => createHash("sha256").update(code.trim().toLowerCase()).digest("hex");

const prisma = new PrismaClient();
const user = await prisma.user.upsert({
  where: { clerkId: "dev_walkthrough_parent" },
  create: { clerkId: "dev_walkthrough_parent", email: "walkthrough-parent@cogna.local", role: "PARENT" },
  update: {},
});
const parent = await prisma.parent.upsert({
  where: { userId: user.id },
  create: { userId: user.id, name: "Walkthrough parent", subscriptionStatus: "trial" },
  update: {},
});
for (const s of WALKTHROUGH_STUDENTS) {
  await prisma.student.upsert({
    where: { id: s.id },
    create: { id: s.id, primaryParentId: parent.id, name: s.name, grade: 8, curriculum: "CBSE", accessCodeHash: hash(s.code) },
    update: { name: s.name, accessCodeHash: hash(s.code), deletedAt: null },
  });
  await prisma.parentStudentLink.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: s.id } },
    create: { parentId: parent.id, studentId: s.id },
    update: {},
  });
  // A fresh walkthrough: drop earlier class enrollments and lessons for these accounts.
  await prisma.classroomEnrollment.deleteMany({ where: { studentId: s.id } });
  await prisma.personalizedVideoAssignment.deleteMany({ where: { studentId: s.id } });
}
console.log(`Walkthrough students ready: ${WALKTHROUGH_STUDENTS.map((s) => `${s.name} (${s.code})`).join(", ")}`);
await prisma.$disconnect();
