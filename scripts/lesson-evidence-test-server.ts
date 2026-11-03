/** Local-only verification harness. Real controller/service + disposable PostgreSQL; no authoring workers or paid providers. */
import { createServer } from "node:http";
import { PrismaClient } from "../packages/database/src";
import { PersonalizedVideosService } from "../apps/api/src/personalized-videos/personalized-videos.service";
import { PersonalizedVideosController } from "../apps/api/src/personalized-videos/personalized-videos.controller";
import { VideoRendererAdapter } from "../apps/api/src/personalized-videos/video-renderer.adapter";
import { issueStudentToken } from "../apps/api/src/access/cogna-access";

async function main() {
const dbUrl = process.env.COGNA_LESSON_EVIDENCE_TEST_DATABASE_URL;
if (!dbUrl || new URL(dbUrl).hostname !== "127.0.0.1" || new URL(dbUrl).port !== "55439" || new URL(dbUrl).pathname !== "/cogna_s1") throw new Error("Only the disposable Sprint 1 database is supported.");
process.env.COGNA_SESSION_SECRET = "s1-local-verification-only-not-production";
const prisma = new PrismaClient({ datasourceUrl: dbUrl });
const reviewDemo = process.env.COGNA_LESSON_EVIDENCE_REVIEW_DEMO === "true";
const studentId = reviewDemo ? "demo_s1_review" : "s1_browser_student";
const reuseId = reviewDemo ? process.env.COGNA_LESSON_EVIDENCE_REVIEW_ASSIGNMENT_ID : undefined;
if (reuseId && !/^s1_browser_\d+$/.test(reuseId)) throw new Error("Only an existing synthetic review assignment may be reused.");
const id = reuseId ?? `s1_browser_${Date.now()}`;
if (reuseId) {
  const existing = await prisma.personalizedVideoAssignment.findUniqueOrThrow({ where: { id } });
  if (existing.studentId !== studentId || existing.schoolId !== "s1-isolated-school") throw new Error("Review assignment does not belong to the isolated fixture.");
}
const service = new PersonalizedVideosService(prisma, new VideoRendererAdapter({}));
const controller = new PersonalizedVideosController(service);
const items = [
  { id: "typed-1", expression: "x^2+5x+6", answer: "(x+2)(x+3)", hint: "Find two numbers with product 6 and sum 5." },
  { id: "typed-2", expression: "x^2+7x+12", answer: "(x+3)(x+4)", hint: "Find two numbers with product 12 and sum 7." },
].map((item) => ({ ...item, format: "type-answer", task: "factorise", prompt: "Factorise the expression.", workedSteps: [item.hint, item.answer] }));
if (!reuseId) await prisma.personalizedVideoAssignment.create({ data: { id, studentId, schoolId: "s1-isolated-school", status: "READY", diagnosticState: "SUFFICIENT", conceptId: "factorisation", learningObjective: "Choose signs and factorise monic trinomials", evidenceSnapshot: {}, script: {
  name: "Test learner", learnerDecision: "Practise after your lesson", teacherDecision: "Reference verification only", format: "SHORT",
  lesson: { title: "Factorisation: checking the signs", duration: "About 20 seconds", scenes: [] },
  micro: { brief: { studentFirstName: "Learner", grade: 8, topic: "Factorisation", targetSkill: { id: "FAC_MONIC", name: "Factorisation" }, buildsOn: [], mistakes: [], strengths: [], studentItems: [{ questionNumber: 1, prompt: "Factorise", expression: "x^2-7x+12", task: "factorise", studentAnswer: "(x+3)(x+4)", correctAnswer: "(x-3)(x-4)" }] } },
  practice: { source: "CODE_GENERATED", skillId: "FAC_MONIC", items },
} } });
const token = issueStudentToken(studentId);
// The optional review fixture starts after the lesson so its link opens directly at practice.
if (reviewDemo && !reuseId) await service.recordCompleted(id, 0, { role: "student", studentId });
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const path = new URL(req.url!, "http://localhost").pathname;
    let result: unknown;
    if (path === "/fixture") result = { assignmentId: id, studentId, token };
    else if (path === "/fixture/state") {
      const row = await prisma.personalizedVideoAssignment.findUniqueOrThrow({ where: { id } });
      result = { script: row.script, events: await prisma.personalizedVideoEvent.findMany({ where: { assignmentId: id } }) };
    } else {
      const match = path.match(/^\/personalized-videos\/assignments\/([^/]+)(?:\/(.*))?$/);
      if (!match) { res.statusCode = 404; res.end(JSON.stringify({ message: "Not found" })); return; }
      const assignmentId = decodeURIComponent(match[1]!); const action = match[2] ?? "";
      let raw = ""; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "GET" && !action) result = await controller.getAssignment(req.headers, assignmentId);
      else if (req.method === "GET" && action === "practice") result = await controller.practice(req.headers, assignmentId);
      else if (req.method === "GET" && action === "micro-lesson") result = await controller.microLesson(req.headers, assignmentId);
      else if (req.method === "POST" && action === "practice-evidence") result = await controller.practiceEvidence(req.headers, assignmentId, body);
      else if (req.method === "POST" && action === "watched") result = await controller.watched(req.headers, assignmentId, body);
      else if (req.method === "POST" && action === "completed") result = await controller.completed(req.headers, assignmentId, body);
      else { res.statusCode = 404; result = { message: "Unsupported test route" }; }
    }
    res.end(JSON.stringify(result));
  } catch (error) {
    const e = error as { getStatus?: () => number; message?: string };
    res.statusCode = e.getStatus?.() ?? 500; res.end(JSON.stringify({ message: e.message ?? "Test failure" }));
  }
});
server.listen(4311, "127.0.0.1", () => console.log("Sprint 1 isolated controller/storage fixture ready on 127.0.0.1:4311"));
let stopping = false;
async function stop() { if (stopping) return; stopping = true; server.close(); if (!reuseId) await prisma.personalizedVideoAssignment.deleteMany({ where: { id } }); await prisma.$disconnect(); process.exit(0); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);

}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
