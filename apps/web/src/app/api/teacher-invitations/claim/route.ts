import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { issueTeacherToken } from "../../../../../../api/src/access/cogna-access";

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
    const candidate = error as { getStatus?: () => number; message?: string };
    const status = typeof candidate.getStatus === "function" ? candidate.getStatus() : 503;
    return NextResponse.json(
      { message: candidate.message ?? "Teacher session signing is not configured." },
      { status },
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
