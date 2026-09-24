import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSECURE_LOCAL_DEV_SESSION_SECRET = "INSECURE_LOCAL_DEV_ONLY_cogna-session-secret";

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

function isProductionLike(): boolean {
  const era = (process.env.COGNA_ENV ?? "").trim().toLowerCase();
  return process.env.NODE_ENV === "production" || era === "production" || era === "staging";
}

function demoSessionsAllowed(): boolean {
  if (process.env.ALLOW_DEMO_STUDENT_SESSIONS === "false") return false;
  if (process.env.NODE_ENV === "production") return process.env.ALLOW_DEMO_STUDENT_SESSIONS === "true";
  return true;
}

function canMintDemoStudent(studentId: string): boolean {
  return demoSessionsAllowed() && /^demo_[a-z][a-z0-9_]*$/.test(studentId);
}

function sessionSecretFromEnv(): string | null {
  const configured = process.env.COGNA_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (!isProductionLike() && process.env.COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET === "true") {
    return INSECURE_LOCAL_DEV_SESSION_SECRET;
  }
  return null;
}

function issueStudentToken(studentId: string, ttlMs = 12 * 60 * 60 * 1000): string {
  const secret = sessionSecretFromEnv();
  if (!secret) throw new Error("Student session signing is not configured.");
  const body = Buffer.from(JSON.stringify({ role: "student", sub: studentId, exp: Date.now() + ttlMs })).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

export async function POST(request: Request): Promise<Response> {
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
