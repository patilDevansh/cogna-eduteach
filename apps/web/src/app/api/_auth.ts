import { createHmac, timingSafeEqual } from "node:crypto";

const DEMO_SCHOOL_ID = "gurukul-pilot";
const DEMO_STUDENT_KEYS = ["aarav", "meena", "rohan", "divya", "kabir"];
const INSECURE_LOCAL_DEV_SESSION_SECRET = "INSECURE_LOCAL_DEV_ONLY_cogna-session-secret";

export type WebApiActor =
  | { role: "student"; studentId: string }
  | { role: "teacher"; teacherEmail: string; schoolId: string }
  | { role: "worker" };

function isProductionLike(): boolean {
  const era = (process.env.COGNA_ENV ?? "").trim().toLowerCase();
  return process.env.NODE_ENV === "production" || era === "production" || era === "staging";
}

function sessionSecretFromEnv(): string | null {
  const configured = process.env.COGNA_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (!isProductionLike() && process.env.COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET === "true") {
    return INSECURE_LOCAL_DEV_SESSION_SECRET;
  }
  return null;
}

function verifyMac(token: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const expected = createHmac("sha256", secret).update(parts[1]!).digest("base64url");
  const actual = parts[2]!;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(actual);
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;
  try {
    return Buffer.from(parts[1]!, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function readHeader(headers: Headers, name: string): string {
  return headers.get(name) ?? "";
}

function workerTokenFromEnv(): string | null {
  return process.env.COGNA_JOB_WORKER_TOKEN?.trim() || process.env.COGNA_VIDEO_RENDER_TOKEN?.trim() || null;
}

function isDemoStudentId(studentId: string): boolean {
  return DEMO_STUDENT_KEYS.some((key) => studentId === `demo_${key}`);
}

function schoolIdForStudent(studentId: string): string {
  if (isDemoStudentId(studentId) || studentId.startsWith("demo_")) return DEMO_SCHOOL_ID;
  return process.env.COGNA_DEFAULT_SCHOOL_ID?.trim() || DEMO_SCHOOL_ID;
}

export function resolveWebApiActor(headers: Headers): WebApiActor {
  const secret = sessionSecretFromEnv();
  const authorization = readHeader(headers, "authorization");
  const workerToken = workerTokenFromEnv();
  if (workerToken && authorization === `Bearer ${workerToken}`) {
    return { role: "worker" };
  }

  const teacherToken = readHeader(headers, "x-cogna-teacher-token");
  if (teacherToken) {
    if (!secret) throw Object.assign(new Error("Session signing is not configured."), { status: 401 });
    const payload = verifyMac(teacherToken, secret);
    if (!payload) throw Object.assign(new Error("Teacher session is invalid."), { status: 401 });
    const parsed = JSON.parse(payload) as { role?: string; sub?: string; schoolId?: string; exp?: number };
    if (parsed.role !== "teacher" || !parsed.sub || !parsed.schoolId || (parsed.exp ?? 0) < Date.now()) {
      throw Object.assign(new Error("Teacher session has expired."), { status: 401 });
    }
    return { role: "teacher", teacherEmail: parsed.sub, schoolId: parsed.schoolId };
  }

  const studentId = readHeader(headers, "x-cogna-student-id");
  const studentToken = readHeader(headers, "x-cogna-student-token");
  if (studentId && studentToken) {
    if (!secret) throw Object.assign(new Error("Session signing is not configured."), { status: 401 });
    const payload = verifyMac(studentToken, secret);
    if (!payload) throw Object.assign(new Error("Student session is invalid."), { status: 401 });
    const parsed = JSON.parse(payload) as { role?: string; sub?: string; exp?: number };
    if (parsed.role !== "student" || parsed.sub !== studentId || (parsed.exp ?? 0) < Date.now()) {
      throw Object.assign(new Error("Student session does not match this learner."), { status: 401 });
    }
    return { role: "student", studentId };
  }

  throw Object.assign(new Error("Sign in as the student or teacher to continue."), { status: 401 });
}

export function assertStudentAccess(actor: WebApiActor, studentId: string, schoolId = schoolIdForStudent(studentId)): void {
  if (actor.role === "worker") return;
  if (actor.role === "teacher") {
    if (actor.schoolId !== schoolId) throw Object.assign(new Error("This student is not in your school."), { status: 403 });
    return;
  }
  if (actor.studentId !== studentId) throw Object.assign(new Error("This record belongs to a different student."), { status: 403 });
}

export function assertWorker(actor: WebApiActor): void {
  if (actor.role !== "worker") throw Object.assign(new Error("A worker credential is required."), { status: 403 });
}
