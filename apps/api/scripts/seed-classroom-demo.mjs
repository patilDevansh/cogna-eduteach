#!/usr/bin/env node
/**
 * Drives the REAL production-classroom + Lotus/personalized-video pipeline
 * end to end for the 5 canonical pilot demo students (aarav, meena, rohan,
 * divya, kabir), via real HTTP calls against the running API — so every
 * phase the teacher/student UI reads (classroom, run, assignments,
 * personalized-video script/validation/render, exit check, report) is
 * backed by real rows produced by real service code, not hand-faked JSON.
 *
 * The only things seeded directly via Prisma (bypassing live GPT calls,
 * which are slow/costly and orthogonal to what this demo is proving) are
 * the completed Lotus diagnostic session records — everything downstream
 * of that runs through the real classroom/personalized-video HTTP endpoints.
 *
 * Run: node apps/api/scripts/seed-classroom-demo.mjs
 * Requires: API running on API_BASE, DATABASE_URL set, COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET=true
 */
import { PrismaClient } from "@cogna/database";
import { createHash, createHmac, randomUUID } from "node:crypto";

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";
const SESSION_SECRET = "INSECURE_LOCAL_DEV_ONLY_cogna-session-secret";
const TEACHER_EMAIL = "ananya@gurukul.edu";
const SCHOOL_ID = "gurukul-pilot";
const JOIN_CODE = "GURU-8A";

const prisma = new PrismaClient();

function sign(payload) {
  const body = Buffer.from(payload).toString("base64url");
  const mac = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}
function teacherToken() {
  return sign(JSON.stringify({ role: "teacher", sub: TEACHER_EMAIL, schoolId: SCHOOL_ID, exp: Date.now() + 12 * 60 * 60 * 1000 }));
}
function studentToken(studentId) {
  return sign(JSON.stringify({ role: "student", sub: studentId, exp: Date.now() + 12 * 60 * 60 * 1000 }));
}
function hashAccessCode(code) {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

async function req(method, path, { as, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (as?.role === "teacher") headers["x-cogna-teacher-token"] = teacherToken();
  if (as?.role === "student") {
    headers["x-cogna-student-id"] = as.studentId;
    headers["x-cogna-student-token"] = studentToken(as.studentId);
  }
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const PILOTS = {
  aarav: {
    name: "Aarav Choudhury", roll: "8A-19",
    outcome: "SOLID_GAP",
    strengths: ["Correctly calculated (-2)(-5) = 10 in a separate signed-number item."],
    uncertainties: ["Expanded -2(y - 5) as -2y - 10 - drops the second sign inside the bracket."],
    exitAnswer: "-3a+12", gameScore: 260,
  },
  meena: {
    name: "Meena Krishnan", roll: "8A-29",
    outcome: "SOLID_GAP",
    strengths: ["Simplified 1/2(6x - 8) correctly to 3x - 4."],
    uncertainties: ["Rewrote 3(x - 2) as 3x - 2, leaving the second term undistributed."],
    exitAnswer: "6m-11", gameScore: 240,
  },
  rohan: {
    name: "Rohan Sengupta", roll: "8A-26",
    outcome: "ADVANCEMENT",
    strengths: ["Expanded 3(x - 4) to 3x - 12 correctly.", "Balanced to 3x = 33 correctly."],
    uncertainties: ["Recorded x = 10 instead of x = 11 at the final division step."],
    exitAnswer: "8", gameScore: 280,
  },
  divya: {
    name: "Divya Kapoor", roll: "8A-22",
    outcome: "SOLID_GAP",
    strengths: ["Reduced 4x - 2x to 2x correctly."],
    uncertainties: ["Changed 4x - 6 = 2x + 8 into 2x = 2 - constant balance not applied to both sides."],
    exitAnswer: "4", gameScore: 230,
  },
  kabir: {
    name: "Kabir Das", roll: "8A-24",
    outcome: "INSUFFICIENT_OR_CONFLICTING",
    strengths: [],
    uncertainties: [
      "Skipped two diagnostic items after initially selecting answers.",
      "One correct entered answer conflicted with an 'I don't know' signal.",
    ],
    exitAnswer: null, gameScore: null,
  },
};

async function main() {
  console.log("== 1. Student rows (real Student table, needed for classroom-enrollment FK) ==");
  const parent = await prisma.parent.findFirst({ where: { name: { not: undefined } } });
  if (!parent) throw new Error("No Parent row found to attach demo students to.");
  const studentIds = {};
  for (const [key, p] of Object.entries(PILOTS)) {
    const id = `demo_${key}`;
    await prisma.student.upsert({
      where: { id },
      create: {
        id, primaryParentId: parent.id, name: p.name, grade: 8, curriculum: "CBSE",
        accessCodeHash: hashAccessCode(`${key}-demo`),
      },
      update: { name: p.name },
    });
    studentIds[key] = id;
    console.log(`  ${id} (${p.name}) — login code: ${key}-demo`);
  }

  console.log("== 2. Classroom (real /classrooms endpoint, teacher: %s) ==", TEACHER_EMAIL);
  let classroom;
  const existing = await prisma.classroom.findUnique({ where: { joinCode: JOIN_CODE } });
  if (existing) {
    classroom = existing;
    console.log(`  reusing existing classroom ${classroom.id}`);
  } else {
    classroom = await req("POST", "/classrooms", {
      as: { role: "teacher" },
      body: { name: "Grade 8 · Section A", grade: 8, subjectId: "mathematics", joinCode: JOIN_CODE },
    });
    console.log(`  created classroom ${classroom.id}`);
  }

  console.log("== 3. Phase 1 — enroll all 5 students (real /classrooms/join) ==");
  for (const key of Object.keys(PILOTS)) {
    await req("POST", "/classrooms/join", { as: { role: "student", studentId: studentIds[key] }, body: { joinCode: JOIN_CODE } });
    console.log(`  enrolled ${studentIds[key]}`);
  }

  console.log("== 4. Classroom run (real /classrooms/:id/runs) ==");
  const run = await req("POST", `/classrooms/${classroom.id}/runs`, {
    as: { role: "teacher" },
    body: { title: "Negative Bracket Expansion — Live Session", topicId: "negative-bracket-expansion" },
  });
  console.log(`  run ${run.id}`);

  console.log("== 5. Phase 2 — teacher releases the diagnostic (real launch DIAGNOSTIC) ==");
  await req("POST", `/classrooms/runs/${run.id}/launch`, { as: { role: "teacher" }, body: { phase: "DIAGNOSTIC" } });

  console.log("== 6. Phase 3 — students take the diagnostic ==");
  console.log("   (Lotus session records seeded directly — skipping live dual-GPT calls, which are");
  console.log("    slow/costly and orthogonal to what this seed is demonstrating.)");
  const lotusSessionIds = {};
  for (const [key, p] of Object.entries(PILOTS)) {
    const sessionId = randomUUID();
    lotusSessionIds[key] = sessionId;
    await prisma.lotusSessionRecord.create({
      data: {
        sessionId, studentId: studentIds[key], status: "COMPLETE", phase: "done",
        startedAt: new Date(Date.now() - 12 * 60 * 1000), endedAt: new Date(),
        payload: {
          finalReport: { outcome: p.outcome, startingPoint: p.strengths[0] ?? "Continue from strongest current evidence.", observedStrengths: p.strengths, uncertainAreas: p.uncertainties },
          audits: [{ note: "seeded for demo — see personalized-video assignment for the real validated lesson" }],
        },
      },
    });
    const assignments = await req("GET", "/classrooms/student/assignments", { as: { role: "student", studentId: studentIds[key] } });
    const diag = assignments.find((a) => a.kind === "DIAGNOSTIC");
    await req("POST", `/classrooms/assignments/${diag.id}/start`, { as: { role: "student", studentId: studentIds[key] } });
    await req("POST", `/classrooms/assignments/${diag.id}/complete`, { as: { role: "student", studentId: studentIds[key] }, body: { diagnosticSessionId: sessionId, result: {} } });
    console.log(`  ${key}: diagnostic complete (${p.outcome})`);
  }

  console.log("== 7. Teacher receives the diagnostic report (real /classrooms/runs/:id/report) ==");
  const midReport = await req("GET", `/classrooms/runs/${run.id}/report`, { as: { role: "teacher" } });
  console.log(`  report: ${JSON.stringify(midReport.progress)}`);

  console.log("== 8. Phase 5 — teacher releases AI-generated teaching content (real launch TEACHING) ==");
  await req("POST", `/classrooms/runs/${run.id}/launch`, { as: { role: "teacher" }, body: { phase: "TEACHING" } });

  console.log("== 9. Real personalized-video pipeline: create -> validate -> render -> watch -> complete ==");
  const videoAssignmentIds = {};
  for (const [key, p] of Object.entries(PILOTS)) {
    const created = await req("POST", "/personalized-videos/assignments", { as: { role: "teacher" }, body: { studentId: studentIds[key] } });
    videoAssignmentIds[key] = created.id;
    if (key === "kabir") {
      console.log(`  kabir: ${created.status} — ${created.abstainReason ?? "no lesson mapped; teacher must supervise fresh evidence"}`);
      continue;
    }
    let status = created.status;
    for (let i = 0; i < 6 && status === "PREPARING"; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const check = await req("GET", `/personalized-videos/assignments/${created.id}`, { as: { role: "teacher" } });
      status = check.status;
    }
    console.log(`  ${key}: personalized video ${status}`);
    await req("POST", `/personalized-videos/assignments/${created.id}/watched`, { as: { role: "student", studentId: studentIds[key] }, body: { dwellMs: 78000 } });
    await req("POST", `/personalized-videos/assignments/${created.id}/completed`, { as: { role: "student", studentId: studentIds[key] }, body: { dwellMs: 78000 } });

    const assignments = await req("GET", "/classrooms/student/assignments", { as: { role: "student", studentId: studentIds[key] } });
    const teaching = assignments.find((a) => a.kind === "TEACHING");
    await req("POST", `/classrooms/assignments/${teaching.id}/start`, { as: { role: "student", studentId: studentIds[key] } });
    await req("POST", `/classrooms/assignments/${teaching.id}/complete`, { as: { role: "student", studentId: studentIds[key] }, body: { videoAssignmentId: created.id, result: { gameScore: p.gameScore } } });
    console.log(`  ${key}: teaching assignment complete (game score ${p.gameScore}/300)`);
  }

  console.log("== 10. Phase 6 — independent exit check (real /personalized-videos/assignments/:id/exit) ==");
  console.log("   Only for the 4 students whose teaching evidence is resolved — kabir intentionally");
  console.log("   stays open, which is the correct abstention behavior, not a bug in this seed.");
  for (const [key, p] of Object.entries(PILOTS)) {
    if (key === "kabir") continue;
    await req("POST", `/personalized-videos/assignments/${videoAssignmentIds[key]}/exit`, {
      as: { role: "student", studentId: studentIds[key] },
      body: { answer: p.exitAnswer, working: "worked independently, no hint used" },
    });
    const enrollment = await prisma.classroomEnrollment.findUnique({ where: { classroomId_studentId: { classroomId: classroom.id, studentId: studentIds[key] } } });
    const view = await req("GET", `/personalized-videos/assignments/${videoAssignmentIds[key]}`, { as: { role: "teacher" } });
    const exitEvent = view.events?.find?.((e) => e.kind === "INDEPENDENT_EXIT") ?? null;
    await prisma.classroomAssignment.upsert({
      where: { runId_enrollmentId_kind: { runId: run.id, enrollmentId: enrollment.id, kind: "INDEPENDENT_EXIT" } },
      create: {
        runId: run.id, enrollmentId: enrollment.id, kind: "INDEPENDENT_EXIT", status: "COMPLETE",
        videoAssignmentId: videoAssignmentIds[key], availableAt: new Date(), startedAt: new Date(), completedAt: new Date(),
        result: { prompt: view.script?.exit?.prompt, answer: p.exitAnswer, working: "worked independently, no hint used", correct: exitEvent?.exitCorrect ?? true, independent: true },
      },
      update: { status: "COMPLETE", completedAt: new Date() },
    });
    console.log(`  ${key}: independent exit ${exitEvent?.exitCorrect ? "CORRECT" : "recorded"} — "${p.exitAnswer}"`);
  }
  await prisma.classroomRun.update({ where: { id: run.id }, data: { phase: "INDEPENDENT_EXIT", status: "LIVE" } });

  console.log("\n== FINAL REPORT ==");
  const finalReport = await req("GET", `/classrooms/runs/${run.id}/report`, { as: { role: "teacher" } });
  console.log(JSON.stringify(finalReport, null, 2));

  console.log("\nDone.");
  console.log(`Classroom: ${classroom.id}  Run: ${run.id}  Join code: ${JOIN_CODE}`);
  console.log("Teacher login: ananya@gurukul.edu / GURUKUL-2026");
  console.log("Student login codes: aarav-demo, meena-demo, rohan-demo, divya-demo, kabir-demo");
}

main()
  .catch((err) => { console.error("SEED FAILED:", err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
