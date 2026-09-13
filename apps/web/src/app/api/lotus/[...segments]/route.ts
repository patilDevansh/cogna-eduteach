import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LotusOverrideAction, LotusStudentResponse } from "@cogna/shared";

import { PrismaClient } from "@cogna/database";
import { OpenAIService } from "../../../../../../api/src/ai/openai.service";
import { assertStudentAccess, resolveActor } from "../../../../../../api/src/access/cogna-access";
import { LotusModelService } from "../../../../../../api/src/lotus/lotus-model.service";
import { LotusService } from "../../../../../../api/src/lotus/lotus.service";

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

  // Next may seed an empty value before this route is evaluated. In that case,
  // load only the Lotus variables from the workspace file without exposing them
  // to the client bundle.
  const contents = readFileSync(envFile, "utf8");
  for (const key of [
    "OPENAI_API_KEY",
    "LOTUS_EXPERIMENTAL_ENABLED",
    "LOTUS_STANDALONE_DEMO",
    "LOTUS_OPENAI_MODEL",
    "LOTUS_CHALLENGER_MODEL",
    "DATABASE_URL",
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

const globalLotus = globalThis as typeof globalThis & {
  __cognaLotusService?: LotusService;
  __cognaLotusPrisma?: PrismaClient;
};

function getLotusPrisma(): PrismaClient | null {
  if (process.env.LOTUS_STANDALONE_DEMO === "true" || !process.env.DATABASE_URL) return null;
  if (!globalLotus.__cognaLotusPrisma) {
    globalLotus.__cognaLotusPrisma = new PrismaClient();
  }
  return globalLotus.__cognaLotusPrisma;
}

function getLotus(): LotusService {
  if (!globalLotus.__cognaLotusService || !globalLotus.__cognaLotusService.status().ready) {
    const config = {
      get<T>(key: string): T | undefined {
        return process.env[key] as T | undefined;
      },
    };
    const models = new LotusModelService(new OpenAIService(), config as never);
    globalLotus.__cognaLotusService = new LotusService(models, getLotusPrisma());
  }
  return globalLotus.__cognaLotusService;
}

function errorResponse(error: unknown): Response {
  const candidate = error as {
    getStatus?: () => number;
    message?: string;
  };
  const status = typeof candidate?.getStatus === "function" ? candidate.getStatus() : 500;
  return Response.json(
    { message: candidate?.message ?? "Cogna Lotus could not complete this request." },
    { status },
  );
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  try {
    const { segments } = await context.params;
    const lotus = getLotus();
    if (segments.length === 1 && segments[0] === "status") {
      return Response.json(lotus.status());
    }
    if (segments.length === 2 && segments[0] === "sessions") {
      const actor = resolveActor(request.headers);
      const session = await lotus.get(segments[1]!);
      assertStudentAccess(actor, session.studentId);
      return Response.json(session);
    }
    return Response.json({ message: "Lotus route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  try {
    const { segments } = await context.params;
    const body = await bodyOf(request);
    const lotus = getLotus();
    const actor = resolveActor(request.headers);

    if (segments.length === 1 && segments[0] === "sessions") {
      const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
      if (!studentId) return Response.json({ message: "studentId is required." }, { status: 400 });
      assertStudentAccess(actor, studentId);
      return Response.json(await lotus.start(studentId));
    }

    if (segments.length === 3 && segments[0] === "sessions" && segments[2] === "answers") {
      const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
      if (!studentId) return Response.json({ message: "studentId is required." }, { status: 400 });
      assertStudentAccess(actor, studentId);
      const response: LotusStudentResponse = {
        answer: body.didNotKnow ? "I don't know" : String(body.answer ?? ""),
        working: String(body.working ?? ""),
        confidence: Number(body.confidence ?? 0),
        responseTimeMs: Number(body.responseTimeMs ?? 0),
        didNotKnow: Boolean(body.didNotKnow),
      };
      return Response.json(await lotus.answer(segments[1], studentId, response));
    }

    if (segments.length === 3 && segments[0] === "sessions" && segments[2] === "override") {
      const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
      const action = body.action as LotusOverrideAction;
      if (!studentId || !["REPLACE_QUESTION", "END_NOW"].includes(action)) {
        return Response.json({ message: "A valid studentId and action are required." }, { status: 400 });
      }
      assertStudentAccess(actor, studentId);
      return Response.json(await lotus.override(segments[1], studentId, action));
    }

    return Response.json({ message: "Lotus route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
