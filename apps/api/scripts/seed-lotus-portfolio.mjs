/** Local demo fixtures for Gate 5. These are labelled synthetic, never production evidence.
 * Run from apps/api after loading the local DATABASE_URL: node scripts/seed-lotus-portfolio.mjs
 */
import { PrismaClient } from "@cogna/database";
import { createHash } from "node:crypto";
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("Local demo seed only");
const db = new PrismaClient();
try {
  const teacher = await db.teacher.findUnique({ where: { identityKey: "gurukul-pilot:ananya@gurukul.edu" } });
  const parent = await db.parent.findFirst();
  if (!teacher || !parent) throw new Error("Create the local Gurukul teacher and a parent first");
  const classroom = await db.classroom.upsert({ where: { joinCode: "LOTUS-PORTFOLIO" }, update: {}, create: {
    name: "Lotus portfolio · synthetic demo", teacherId: teacher.id, schoolId: teacher.schoolId,
    grade: 8, subjectId: "mathematics", joinCode: "LOTUS-PORTFOLIO", isDemo: true,
  } });
  if (!classroom.isDemo || classroom.teacherId !== teacher.id) throw new Error("Seed classroom ownership mismatch");
  for (let index = 1; index <= 12; index++) {
    const studentId = `demo_portfolio_${index}`;
    await db.student.upsert({ where: { id: studentId }, update: {}, create: {
      id: studentId, name: `Synthetic portfolio learner ${index}`, grade: 8, curriculum: "CBSE",
      primaryParentId: parent.id, accessCodeHash: createHash("sha256").update(`portfolio-${index}-demo`).digest("hex"),
    } });
    await db.classroomEnrollment.upsert({ where: { classroomId_studentId: { classroomId: classroom.id, studentId } }, update: { leftAt: null }, create: { classroomId: classroom.id, studentId, rollNumber: String(index) } });
    const skills = [["FAC_GCF_NUMERIC", "Common factors"], ["FAC_GCF_NEGATIVE", "Negative common factors"], ["FAC_MONIC_TRINOMIAL", "Quadratic factorisation"]].map(([skillId, name], skillIndex) => {
      const rating = ((index + skillIndex) % 5) + 1;
      return { skillId, name, rating, state: rating >= 4 ? "SECURE" : rating === 3 ? "OBSERVED" : "CONFIRMED", evidence: ["Synthetic demo fixture; not a real student assessment"] };
    });
    const sessionId = `lotus-portfolio-fixture-${index}`;
    const payload = { sessionId, studentId, status: "COMPLETE", board: "CBSE", topic: "FACTORISATION", audits: [], finalReport: {
      board: "CBSE", outcome: "SOLID_GAP", startingPoint: "Synthetic demo fixture", skills,
      observedStrengths: [], uncertainAreas: [], evidenceSummary: ["Synthetic fixture"], recommendedNextStep: "Demo only", limitations: ["Synthetic fixtures are not student evidence"],
    } };
    await db.lotusSessionRecord.upsert({ where: { sessionId }, update: { payload }, create: { sessionId, studentId, status: "COMPLETE", phase: "done", startedAt: new Date(), endedAt: new Date(), payload } });
  }
  console.log(JSON.stringify({ classroomId: classroom.id, students: 12, synthetic: true, route: `/teacher/lotus-portfolio?classroom=${classroom.id}` }));
} finally { await db.$disconnect(); }
