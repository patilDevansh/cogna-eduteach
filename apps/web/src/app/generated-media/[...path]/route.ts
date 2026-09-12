import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { authorizeGeneratedMediaPath } from "../../../../../api/src/access/cogna-access";
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

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".vtt") return "text/vtt; charset=utf-8";
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
