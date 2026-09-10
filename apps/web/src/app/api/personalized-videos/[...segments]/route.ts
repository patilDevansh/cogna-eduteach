import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@cogna/database";
import {
  assertWorker,
  resolveActor,
} from "../../../../../../api/src/access/cogna-access";
import { PersonalizedVideosService } from "../../../../../../api/src/personalized-videos/personalized-videos.service";
import { createPersonalizedVideoMemoryDb } from "../../../../../../api/src/personalized-videos/personalized-videos.memory";
import { createVideoRendererFromEnv } from "../../../../../../api/src/personalized-videos/video-renderer.factory";

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
    "DATABASE_URL",
    "LOTUS_STANDALONE_DEMO",
    "COGNA_VIDEO_RENDER_ENDPOINT",
    "COGNA_VIDEO_RENDER_TOKEN",
    "COGNA_VIDEO_LOCAL_RENDERER",
    "COGNA_MEDIA_STORAGE_BUCKET",
    "COGNA_MEDIA_CDN_URL",
    "COGNA_MEDIA_LOCAL_DIR",
    "COGNA_MEDIA_PUBLIC_BASE_URL",
    "COGNA_SESSION_SECRET",
    "COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET",
    "COGNA_JOB_WORKER_TOKEN",
    "COGNA_CHROME_PATH",
    "COGNA_VIDEO_RENDER_WORKER",
    "COGNA_VIDEO_RENDER_WORKER_MS",
    "ALLOW_DEMO_STUDENT_SESSIONS",
    "ALLOW_PERSONALIZED_VIDEO_DEMO_SEEDS",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ]) {
    if (process.env[key]) continue;
    const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match) continue;
    const value = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[key] = value;
  }
}

loadWorkspaceEnvironment();

const globalStore = globalThis as typeof globalThis & {
  __cognaPersonalizedVideosV7?: PersonalizedVideosService;
  __cognaPersonalizedVideoWorkerV7?: ReturnType<typeof setInterval>;
};

function startRenderWorker(videos: PersonalizedVideosService): void {
  if (globalStore.__cognaPersonalizedVideoWorkerV7) return;
  if (process.env.COGNA_VIDEO_RENDER_WORKER === "false") return;
  const ms = Number(process.env.COGNA_VIDEO_RENDER_WORKER_MS ?? 2500);
  void videos.processPendingRenderJobs().catch(() => undefined);
  globalStore.__cognaPersonalizedVideoWorkerV7 = setInterval(() => {
    void videos.processPendingRenderJobs().catch(() => undefined);
  }, Number.isFinite(ms) && ms > 0 ? ms : 2500);
}

function getService(): PersonalizedVideosService {
  if (!globalStore.__cognaPersonalizedVideosV7) {
    const useMemory =
      process.env.LOTUS_STANDALONE_DEMO === "true" || !process.env.DATABASE_URL;
    const prisma = useMemory
      ? createPersonalizedVideoMemoryDb()
      : new PrismaClient();
    globalStore.__cognaPersonalizedVideosV7 = new PersonalizedVideosService(
      prisma as never,
      createVideoRendererFromEnv(),
    );
  }
  startRenderWorker(globalStore.__cognaPersonalizedVideosV7);
  return globalStore.__cognaPersonalizedVideosV7;
}

function errorResponse(error: unknown): Response {
  const candidate = error as { getStatus?: () => number; message?: string };
  const status = typeof candidate?.getStatus === "function" ? candidate.getStatus() : 500;
  return Response.json(
    { message: candidate?.message ?? "Personalized video request failed." },
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
    const url = new URL(request.url);
    const videos = getService();
    const actor = resolveActor(request.headers);
    if (segments.length === 1 && segments[0] === "teacher-report") {
      return Response.json(await videos.teacherReport(actor, url.searchParams.get("demo") === "1"));
    }
    if (segments.length === 1 && segments[0] === "for-student") {
      return Response.json(
        await videos.getForStudent(actor, {
          studentId: url.searchParams.get("studentId") ?? undefined,
          studentKey: url.searchParams.get("studentKey") ?? undefined,
        }),
      );
    }
    if (segments.length === 2 && segments[0] === "assignments") {
      return Response.json(await videos.getAssignment(segments[1]!, actor));
    }
    return Response.json({ message: "Personalized video route not found." }, { status: 404 });
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
    const videos = getService();
    const actor = resolveActor(request.headers);
    if (segments.length === 1 && segments[0] === "assignments") {
      return Response.json(
        await videos.createAssignment(
          {
            studentId: typeof body.studentId === "string" ? body.studentId : "",
            studentKey: typeof body.studentKey === "string" ? body.studentKey : undefined,
            lotusSessionId: typeof body.lotusSessionId === "string" ? body.lotusSessionId : undefined,
          },
          { actor },
        ),
      );
    }
    if (segments.length === 3 && segments[0] === "assignments" && segments[2] === "watched") {
      return Response.json(
        await videos.recordWatched(segments[1]!, Number(body.dwellMs ?? 0), actor),
      );
    }
    if (segments.length === 3 && segments[0] === "assignments" && segments[2] === "completed") {
      return Response.json(
        await videos.recordCompleted(segments[1]!, Number(body.dwellMs ?? 0), actor),
      );
    }
    if (segments.length === 3 && segments[0] === "assignments" && segments[2] === "exit") {
      return Response.json(
        await videos.recordExit(
          segments[1]!,
          {
            answer: String(body.answer ?? ""),
            working: String(body.working ?? ""),
          },
          actor,
        ),
      );
    }
    if (segments.length === 1 && segments[0] === "render-callback") {
      assertWorker(actor);
      return Response.json(
        await videos.handleRenderCallback({
          providerJobId: String(body.providerJobId ?? ""),
          status: typeof body.status === "string" ? body.status : undefined,
          storageRef: typeof body.storageRef === "string" ? body.storageRef : undefined,
          transcriptRef: typeof body.transcriptRef === "string" ? body.transcriptRef : undefined,
          durationMs: Number(body.durationMs ?? 0),
          integrity:
            body.integrity && typeof body.integrity === "object"
              ? (body.integrity as Record<string, unknown>)
              : undefined,
          message: typeof body.message === "string" ? body.message : undefined,
        }),
      );
    }
    return Response.json({ message: "Personalized video route not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
