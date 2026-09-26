import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { PilotStudentKey } from "@cogna/shared";
import {
  INSECURE_LOCAL_DEV_SESSION_SECRET,
  isProductionLike,
  sessionSecretFromEnv,
  signPayload as sign,
  verifyMac,
} from "@cogna/shared/dist/session";

// Re-exported so existing importers keep working; the implementation lives in @cogna/shared.
export { INSECURE_LOCAL_DEV_SESSION_SECRET, isProductionLike, sessionSecretFromEnv };

export const DEMO_STUDENT_KEYS: PilotStudentKey[] = [
  "aarav",
  "meena",
  "rohan",
  "divya",
  "kabir",
];

export const DEMO_SCHOOL_ID = "gurukul-pilot";

export type AccessActor =
  | { role: "student"; studentId: string }
  | { role: "teacher"; teacherEmail: string; schoolId: string }
  | { role: "worker" };

export function demoSessionsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_DEMO_STUDENT_SESSIONS === "false") return false;
  if (env.NODE_ENV === "production") return env.ALLOW_DEMO_STUDENT_SESSIONS === "true";
  return true;
}

export function demoSeedsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_PERSONALIZED_VIDEO_DEMO_SEEDS === "false") return false;
  if (env.NODE_ENV === "production") return env.ALLOW_PERSONALIZED_VIDEO_DEMO_SEEDS === "true";
  return true;
}

export function isDemoStudentId(studentId: string): boolean {
  return DEMO_STUDENT_KEYS.some((key) => studentId === `demo_${key}`);
}

export function schoolIdForStudent(studentId: string, env: NodeJS.ProcessEnv = process.env): string {
  if (isDemoStudentId(studentId) || studentId.startsWith("demo_")) return DEMO_SCHOOL_ID;
  return env.COGNA_DEFAULT_SCHOOL_ID?.trim() || DEMO_SCHOOL_ID;
}

export function canMintDemoStudent(studentId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return demoSessionsAllowed(env) && /^demo_[a-z][a-z0-9_]*$/.test(studentId);
}

export function demoStudentId(key: string): string {
  return `demo_${key}`;
}

export function issueStudentToken(
  studentId: string,
  env: NodeJS.ProcessEnv = process.env,
  ttlMs = 12 * 60 * 60 * 1000,
): string {
  const secret = sessionSecretFromEnv(env);
  if (!secret) throw new UnauthorizedException("Student session signing is not configured.");
  return sign(JSON.stringify({ role: "student", sub: studentId, exp: Date.now() + ttlMs }), secret);
}

export function issueTeacherToken(
  teacherEmail: string,
  schoolId: string,
  env: NodeJS.ProcessEnv = process.env,
  ttlMs = 12 * 60 * 60 * 1000,
): string {
  const secret = sessionSecretFromEnv(env);
  if (!secret) throw new UnauthorizedException("Teacher session signing is not configured.");
  return sign(
    JSON.stringify({ role: "teacher", sub: teacherEmail, schoolId, exp: Date.now() + ttlMs }),
    secret,
  );
}

export interface MediaAccessClaims {
  assignmentId: string;
  studentId: string;
  schoolId: string;
}

/** Query-token for <video>/<track> tags, which cannot send student/teacher headers. */
export function issueMediaToken(
  claims: MediaAccessClaims,
  env: NodeJS.ProcessEnv = process.env,
  ttlMs = 12 * 60 * 60 * 1000,
): string {
  const secret = sessionSecretFromEnv(env);
  if (!secret) throw new UnauthorizedException("Media signing is not configured.");
  return sign(
    JSON.stringify({
      role: "media",
      aid: claims.assignmentId,
      sub: claims.studentId,
      schoolId: claims.schoolId,
      exp: Date.now() + ttlMs,
    }),
    secret,
  );
}

export function verifyMediaToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): MediaAccessClaims | null {
  const secret = sessionSecretFromEnv(env);
  if (!secret || !token) return null;
  const payload = verifyMac(token, secret);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as {
      role?: string;
      aid?: string;
      sub?: string;
      schoolId?: string;
      exp?: number;
    };
    if (parsed.role !== "media" || !parsed.aid || !parsed.sub || !parsed.schoolId) return null;
    if ((parsed.exp ?? 0) < Date.now()) return null;
    return { assignmentId: parsed.aid, studentId: parsed.sub, schoolId: parsed.schoolId };
  } catch {
    return null;
  }
}

export function attachMediaAccess(url: string | null | undefined, claims: MediaAccessClaims): string | undefined {
  if (!url) return undefined;
  if (!/\/generated-media\//.test(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}media=${encodeURIComponent(issueMediaToken(claims))}`;
}

const ALLOWED_LESSON_FILES = new Set(["lesson.mp4", "lesson.vtt"]);
const SCENE_AUDIO_FILE = /^scene-\d+\.mp3$/;

function isAllowedLessonFile(name: string): boolean {
  return ALLOWED_LESSON_FILES.has(name) || SCENE_AUDIO_FILE.test(name);
}

export function authorizeGeneratedMediaPath(
  segments: string[],
  mediaToken: string | null,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; status: number; message: string } {
  if (segments[0] === "render-jobs") {
    return { ok: false, status: 404, message: "Not found" };
  }
  if (segments.length !== 3 || segments[0] !== "lessons" || !segments[1] || !isAllowedLessonFile(segments[2]!)) {
    return { ok: false, status: 404, message: "Not found" };
  }
  const claims = mediaToken ? verifyMediaToken(mediaToken, env) : null;
  if (!claims) {
    return { ok: false, status: 401, message: "A signed student or teacher media token is required." };
  }
  if (claims.assignmentId !== segments[1]) {
    return { ok: false, status: 403, message: "This media belongs to a different lesson." };
  }
  return { ok: true };
}

function readHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? "";
  }
  const rec = headers as Record<string, string | string[] | undefined>;
  const raw = rec[name] ?? rec[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
}

export function workerTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.COGNA_JOB_WORKER_TOKEN?.trim() || env.COGNA_VIDEO_RENDER_TOKEN?.trim() || null;
}

export function resolveActor(
  headers: Headers | Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): AccessActor {
  const secret = sessionSecretFromEnv(env);
  const authorization = readHeader(headers, "authorization");
  const workerToken = workerTokenFromEnv(env);
  if (workerToken && authorization === `Bearer ${workerToken}`) {
    return { role: "worker" };
  }

  const teacherToken = readHeader(headers, "x-cogna-teacher-token");
  if (teacherToken) {
    if (!secret) throw new UnauthorizedException("Session signing is not configured.");
    const payload = verifyMac(teacherToken, secret);
    if (!payload) throw new UnauthorizedException("Teacher session is invalid.");
    const parsed = JSON.parse(payload) as { role?: string; sub?: string; schoolId?: string; exp?: number };
    if (parsed.role !== "teacher" || !parsed.sub || !parsed.schoolId || (parsed.exp ?? 0) < Date.now()) {
      throw new UnauthorizedException("Teacher session has expired.");
    }
    return { role: "teacher", teacherEmail: parsed.sub, schoolId: parsed.schoolId };
  }

  const studentId = readHeader(headers, "x-cogna-student-id");
  const studentToken = readHeader(headers, "x-cogna-student-token");
  if (studentId && studentToken) {
    if (!secret) throw new UnauthorizedException("Session signing is not configured.");
    const payload = verifyMac(studentToken, secret);
    if (!payload) throw new UnauthorizedException("Student session is invalid.");
    const parsed = JSON.parse(payload) as { role?: string; sub?: string; exp?: number };
    if (parsed.role !== "student" || parsed.sub !== studentId || (parsed.exp ?? 0) < Date.now()) {
      throw new UnauthorizedException("Student session does not match this learner.");
    }
    return { role: "student", studentId };
  }

  throw new UnauthorizedException("Sign in as the student or teacher to continue.");
}

export function assertCanReadStudent(
  actor: AccessActor,
  studentId: string,
  schoolId: string = schoolIdForStudent(studentId),
): void {
  if (actor.role === "worker") return;
  if (actor.role === "teacher") {
    if (actor.schoolId !== schoolId) {
      throw new ForbiddenException("This student is not in your school.");
    }
    return;
  }
  if (actor.studentId !== studentId) {
    throw new ForbiddenException("This record belongs to a different student.");
  }
}

export function assertStudentAccess(actor: AccessActor, studentId: string, schoolId?: string): void {
  assertCanReadStudent(actor, studentId, schoolId);
}

export function assertStudentOwner(actor: AccessActor, studentId: string): void {
  if (actor.role === "worker") return;
  if (actor.role !== "student" || actor.studentId !== studentId) {
    throw new ForbiddenException("Only the signed-in student can change this record.");
  }
}

export function assertTeacher(actor: AccessActor): void {
  if (actor.role !== "teacher" && actor.role !== "worker") {
    throw new ForbiddenException("A verified teacher session is required.");
  }
}

export function assertWorker(actor: AccessActor): void {
  if (actor.role !== "worker") {
    throw new ForbiddenException("A worker credential is required.");
  }
}
