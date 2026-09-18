/**
 * Keep browser requests same-origin while the API owns personalized-video
 * evidence, rendering, and authorization. This prevents the web bundle from
 * instantiating a second Nest service with a separate render worker.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

function videoUrl(request: Request, segments: string[]): string {
  const source = new URL(request.url);
  return `${API_URL}/personalized-videos/${segments.map(encodeURIComponent).join("/")}${source.search}`;
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "authorization",
    "x-cogna-role",
    "x-cogna-student-id",
    "x-cogna-student-token",
    "x-cogna-teacher-token",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function proxy(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  const { segments } = await context.params;
  try {
    const method = request.method;
    const response = await fetch(videoUrl(request, segments), {
      method,
      headers: forwardedHeaders(request),
      body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
    const headers = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json(
      { message: `Personalized video is unavailable at ${API_URL}. Start the API and retry.` },
      { status: 503 },
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, context);
}
