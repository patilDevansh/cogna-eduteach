import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Next may infer a workspace root outside this repository when another lockfile
 * exists above it. Load only the server-side session/invitation configuration
 * needed by this local BFF route, matching the student-session route.
 */
function loadWorkspaceEnvironment(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];
  const envFile = candidates.find(existsSync);
  if (!envFile) return;
  if (typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
  const contents = readFileSync(envFile, "utf8");
  for (const key of [
    "COGNA_SESSION_SECRET",
    "COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET",
    "TEACHER_PILOT_INVITATIONS",
  ]) {
    if (process.env[key]) continue;
    const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match) continue;
    const value = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[key] = value;
  }
}

loadWorkspaceEnvironment();

type TeacherInvitation = {
  email: string;
  code: string;
  teacherName: string;
  schoolId: string;
  schoolName: string;
};

const DEMO_INVITATION: TeacherInvitation = {
  email: "ananya@gurukul.edu",
  code: "GURUKUL-2026",
  teacherName: "Ananya Rao",
  schoolId: "gurukul-pilot",
  schoolName: "Gurukul",
};

const INSECURE_LOCAL_DEV_SESSION_SECRET = "INSECURE_LOCAL_DEV_ONLY_cogna-session-secret";

function configuredInvitations(): TeacherInvitation[] {
  const configured = process.env.TEACHER_PILOT_INVITATIONS;
  if (!configured) return [DEMO_INVITATION];
  try {
    const parsed = JSON.parse(configured) as TeacherInvitation[];
    return Array.isArray(parsed) && parsed.length ? parsed : [DEMO_INVITATION];
  } catch {
    return [DEMO_INVITATION];
  }
}

function codesMatch(expected: string, actual: string): boolean {
  const expectedHash = createHash("sha256").update(expected.toUpperCase()).digest();
  const actualHash = createHash("sha256").update(actual.toUpperCase()).digest();
  return timingSafeEqual(expectedHash, actualHash);
}

function sessionSecretFromEnv(): string | null {
  const configured = process.env.COGNA_SESSION_SECRET?.trim();
  if (configured) return configured;
  const era = (process.env.COGNA_ENV ?? "").trim().toLowerCase();
  const productionLike = process.env.NODE_ENV === "production" || era === "production" || era === "staging";
  if (!productionLike && process.env.COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET === "true") {
    return INSECURE_LOCAL_DEV_SESSION_SECRET;
  }
  return null;
}

function issueTeacherToken(teacherEmail: string, schoolId: string, ttlMs = 12 * 60 * 60 * 1000): string {
  const secret = sessionSecretFromEnv();
  if (!secret) throw new Error("Teacher session signing is not configured.");
  const body = Buffer.from(
    JSON.stringify({ role: "teacher", sub: teacherEmail, schoolId, exp: Date.now() + ttlMs }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; inviteCode?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!email || !inviteCode) {
    return NextResponse.json({ message: "Enter your approved school email and invitation code." }, { status: 400 });
  }

  const invitation = configuredInvitations().find(
    (candidate) => candidate.email.toLowerCase() === email && codesMatch(candidate.code, inviteCode),
  );

  if (!invitation) {
    return NextResponse.json(
      { message: "This email and invitation code do not match an approved teacher. Ask your school administrator for a new invitation." },
      { status: 401 },
    );
  }

  let token: string | undefined;
  try {
    token = issueTeacherToken(invitation.email, invitation.schoolId);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Teacher session signing is not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    teacherEmail: invitation.email,
    teacherName: invitation.teacherName,
    schoolId: invitation.schoolId,
    schoolName: invitation.schoolName,
    role: "teacher",
    invitationVerified: true,
    token,
  });
}
