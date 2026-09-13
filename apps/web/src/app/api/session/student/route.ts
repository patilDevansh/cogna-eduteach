import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canMintDemoStudent,
  issueStudentToken,
} from "../../../../../../api/src/access/cogna-access";

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
    const candidate = error as { getStatus?: () => number; message?: string };
    const status = typeof candidate.getStatus === "function" ? candidate.getStatus() : 503;
    return Response.json(
      { message: candidate.message ?? "Student session signing is not configured." },
      { status },
    );
  }
}
