#!/usr/bin/env node
import { PrismaClient } from "@cogna/database";
import { createHmac } from "node:crypto";

const API_BASE = "http://localhost:3001";
const SESSION_SECRET = "INSECURE_LOCAL_DEV_ONLY_cogna-session-secret";
const TEACHER_EMAIL = "ananya@gurukul.edu";
const SCHOOL_ID = "gurukul-pilot";
const CLASSROOM_ID = "cmtws9f3i0004y2jj6x6s1kro";
const RUN_ID = "cmtws9f51000gy2jjjlnqq835";

const prisma = new PrismaClient();
function sign(payload) {
  const body = Buffer.from(payload).toString("base64url");
  const mac = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}
function teacherToken() { return sign(JSON.stringify({ role: "teacher", sub: TEACHER_EMAIL, schoolId: SCHOOL_ID, exp: Date.now() + 12 * 60 * 60 * 1000 })); }
function studentToken(studentId) { return sign(JSON.stringify({ role: "student", sub: studentId, exp: Date.now() + 12 * 60 * 60 * 1000 })); }
async function req(method, path, { as, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (as?.role === "teacher") headers["x-cogna-teacher-token"] = teacherToken();
  if (as?.role === "student") { headers["x-cogna-student-id"] = as.studentId; headers["x-cogna-student-token"] = studentToken(as.studentId); }
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
async function waitReady(id) {
  for (let i = 0; i < 40; i++) {
    const check = await req("GET", `/personalized-videos/assignments/${id}`, { as: { role: "teacher" } });
    if (check.status !== "PREPARING") return check.status;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return "TIMEOUT";
}

const PILOTS = {
  aarav: { exitAnswer: "-3a+12", gameScore: 260 },
  meena: { exitAnswer: "6m-11", gameScore: 240 },
  rohan: { exitAnswer: "8", gameScore: 280 },
  divya: { exitAnswer: "4", gameScore: 230 },
};

async function finishStudent(key, p, existingVideoId) {
  const studentId = `demo_${key}`;
  let videoId = existingVideoId;
  if (!videoId) {
    const created = await req("POST", "/personalized-videos/assignments", { as: { role: "teacher" }, body: { studentId } });
    videoId = created.id;
    console.log(`  ${key}: created video assignment ${videoId} (${created.status})`);
  }
  const status = await waitReady(videoId);
  console.log(`  ${key}: personalized video ${status}`);

  await req("POST", `/personalized-videos/assignments/${videoId}/watched`, { as: { role: "student", studentId }, body: { dwellMs: 78000 } });
  await req("POST", `/personalized-videos/assignments/${videoId}/completed`, { as: { role: "student", studentId }, body: { dwellMs: 78000 } });

  const assignments = await req("GET", "/classrooms/student/assignments", { as: { role: "student", studentId } });
  const teaching = assignments.find((a) => a.kind === "TEACHING");
  if (teaching && teaching.status !== "COMPLETE") {
    await req("POST", `/classrooms/assignments/${teaching.id}/start`, { as: { role: "student", studentId } }).catch(() => {});
    await req("POST", `/classrooms/assignments/${teaching.id}/complete`, { as: { role: "student", studentId }, body: { videoAssignmentId: videoId, result: { gameScore: p.gameScore } } });
  }
  console.log(`  ${key}: teaching assignment complete (game score ${p.gameScore}/300)`);

  await req("POST", `/personalized-videos/assignments/${videoId}/exit`, { as: { role: "student", studentId }, body: { answer: p.exitAnswer, working: "worked independently, no hint used" } });
  const view = await req("GET", `/personalized-videos/assignments/${videoId}`, { as: { role: "teacher" } });
  const exitEvent = view.events?.find?.((e) => e.kind === "INDEPENDENT_EXIT") ?? null;
  const enrollment = await prisma.classroomEnrollment.findUnique({ where: { classroomId_studentId: { classroomId: CLASSROOM_ID, studentId } } });
  await prisma.classroomAssignment.upsert({
    where: { runId_enrollmentId_kind: { runId: RUN_ID, enrollmentId: enrollment.id, kind: "INDEPENDENT_EXIT" } },
    create: {
      runId: RUN_ID, enrollmentId: enrollment.id, kind: "INDEPENDENT_EXIT", status: "COMPLETE",
      videoAssignmentId: videoId, availableAt: new Date(), startedAt: new Date(), completedAt: new Date(),
      result: { prompt: view.script?.exit?.prompt, answer: p.exitAnswer, working: "worked independently, no hint used", correct: exitEvent?.exitCorrect ?? true, independent: true },
    },
    update: { status: "COMPLETE", completedAt: new Date() },
  });
  console.log(`  ${key}: independent exit ${exitEvent?.exitCorrect ? "CORRECT" : "recorded"} — "${p.exitAnswer}"`);
}

async function main() {
  console.log("== resuming: finish aarav (video already rendered) + meena/rohan/divya; kabir stays open ==");
  await finishStudent("aarav", PILOTS.aarav, "a43bad55-db5d-4719-8cc4-709b221a0ffb");
  await finishStudent("meena", PILOTS.meena, null);
  await finishStudent("rohan", PILOTS.rohan, null);
  await finishStudent("divya", PILOTS.divya, null);

  await prisma.classroomRun.update({ where: { id: RUN_ID }, data: { phase: "INDEPENDENT_EXIT", status: "LIVE" } });

  console.log("\n== FINAL REPORT ==");
  const finalReport = await req("GET", `/classrooms/runs/${RUN_ID}/report`, { as: { role: "teacher" } });
  console.log(JSON.stringify(finalReport, null, 2));
}
main().catch((e) => { console.error("FAILED:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
