import { sessionSecretFromEnv, signPayload } from "@cogna/shared/dist/session";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    "ALLOW_DEMO_STUDENT_SESSIONS",
  ]) {
    if (process.env[key]) continue;
    const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match) continue;
    const value = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[key] = value;
  }
}

loadWorkspaceEnvironment();

function demoSessionsAllowed(): boolean {
  if (process.env.ALLOW_DEMO_STUDENT_SESSIONS === "false") return false;
  if (process.env.NODE_ENV === "production") return process.env.ALLOW_DEMO_STUDENT_SESSIONS === "true";
  return true;
}

function canMintDemoStudent(studentId: string): boolean {
  // Real demo/practice-code accounts (parents.service.ts) are minted as
  // `demo_` + randomBytes(12).toString("hex") — 24 lowercase hex chars, most
  // of which start with a digit. Requiring a letter right after `demo_`
  // rejected the majority of genuine demo students the moment any feature
  // (Lotus, personalized-video, classroom) called ensureDemoStudentSession
  // to refresh their token, even though the rest of the pattern already
  // allows digits freely — this only ever excluded them from position 0.
  return demoSessionsAllowed() && /^demo_[a-z0-9][a-z0-9_]*$/.test(studentId);
}

function issueStudentToken(studentId: string, ttlMs = 12 * 60 * 60 * 1000): string {
  const secret = sessionSecretFromEnv();
  if (!secret) throw new Error("Student session signing is not configured.");
  return signPayload(JSON.stringify({ role: "student", sub: studentId, exp: Date.now() + ttlMs }), secret);
}

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(request, "auth");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as {
    studentId?: unknown;
    name?: unknown;
  } | null;
  const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!studentId) {
    return Response.json({ message: "studentId is required." }, { status: 400 });
  }
  if (!canMintDemoStudent(studentId)) {
    return Response.json(
      { message: "This student identity cannot be issued a demo session." },
      { status: 403 },
    );
  }
  try {
    const token = issueStudentToken(studentId);
    return Response.json({
      studentId,
      name: name || studentId,
      token,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Student session signing is not configured." },
      { status: 503 },
    );
  }
}
