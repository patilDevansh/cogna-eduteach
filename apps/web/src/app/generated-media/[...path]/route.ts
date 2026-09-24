import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { defaultMediaRoot } from "../../../../../api/src/personalized-videos/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loadWorkspaceEnvironment(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  const envFile = candidates.find(existsSync);
  if (!envFile) return;
  if (typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
  const contents = readFileSync(envFile, "utf8");
  for (const key of [
    "COGNA_SESSION_SECRET",
    "COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET",
    "COGNA_MEDIA_LOCAL_DIR",
  ]) {
    if (process.env[key]) continue;
    const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match) continue;
    const value = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[key] = value;
  }
}

loadWorkspaceEnvironment();

const ALLOWED_LESSON_FILES = new Set(["lesson.mp4", "lesson.vtt"]);
const SCENE_AUDIO_FILE = /^scene-\d+\.mp3$/;

function isAllowedLessonFile(name: string): boolean {
  return ALLOWED_LESSON_FILES.has(name) || SCENE_AUDIO_FILE.test(name);
}

function sessionSecretFromEnv(): string | null {
  return process.env.COGNA_SESSION_SECRET?.trim() || null;
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

function authorizeGeneratedMediaPath(
  segments: string[],
  mediaToken: string | null,
): { ok: true } | { ok: false; status: number; message: string } {
  if (segments[0] === "render-jobs") {
    return { ok: false, status: 404, message: "Not found" };
  }
  if (segments.length !== 3 || segments[0] !== "lessons" || !segments[1] || !isAllowedLessonFile(segments[2]!)) {
    return { ok: false, status: 404, message: "Not found" };
  }
  const secret = sessionSecretFromEnv();
  if (!secret || !mediaToken) {
    return { ok: false, status: 401, message: "A signed student or teacher media token is required." };
  }
  const payload = verifyMac(mediaToken, secret);
  if (!payload) {
    return { ok: false, status: 401, message: "A signed student or teacher media token is required." };
  }
  try {
    const parsed = JSON.parse(payload) as { role?: string; aid?: string; sub?: string; schoolId?: string; exp?: number };
    if (parsed.role !== "media" || !parsed.aid || !parsed.sub || !parsed.schoolId || (parsed.exp ?? 0) < Date.now()) {
      return { ok: false, status: 401, message: "A signed student or teacher media token is required." };
    }
    if (parsed.aid !== segments[1]) {
      return { ok: false, status: 403, message: "This media belongs to a different lesson." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, message: "A signed student or teacher media token is required." };
  }
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".vtt") return "text/vtt; charset=utf-8";
  if (ext === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const segments = (await context.params).path ?? [];
  const url = new URL(request.url);
  const access = authorizeGeneratedMediaPath(segments, url.searchParams.get("media"));
  if (!access.ok) {
    return Response.json({ message: access.message }, { status: access.status });
  }

  const root = path.resolve(defaultMediaRoot());
  const absolute = path.resolve(root, ...segments);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  if (!existsSync(absolute)) {
    return new Response("Not found", { status: 404 });
  }
  const stat = statSync(absolute);
  if (!stat.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const type = contentTypeFor(absolute);
  const range = request.headers.get("range");
  const match = range?.match(/bytes=(\d+)-(\d*)/);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
      return new Response("Invalid range", { status: 416 });
    }
    const stream = createReadStream(absolute, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      },
    });
  }

  const stream = createReadStream(absolute);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      ...headers,
      "Content-Length": String(stat.size),
    },
  });
}
