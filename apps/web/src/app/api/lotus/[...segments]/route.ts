/**
 * Lotus runs in the API process. This route keeps the browser same-origin while
 * forwarding its signed student headers to that process. Keeping Nest out of
 * the Next bundle avoids two independent Lotus session stores and lets web and
 * API deploy independently.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
/**
 * Dev-only escape hatch: a second, already-running API instance started with
 * LOTUS_E2E_FAKE_MODEL=true, so a developer can point their browser tab at
 * free, instant fake-model responses (via the start-page toggle) instead of
 * an engineer manually killing and restarting the real API process to
 * iterate on UI. Never consulted in production, regardless of whether it's
 * set in that environment.
 */
const FAKE_API_URL = process.env.LOTUS_FAKE_API_URL?.replace(/\/$/, "");

function lotusUrl(request: Request, segments: string[]): string {
  const source = new URL(request.url);
  const path = segments.map(encodeURIComponent).join("/");
  const wantsFake = process.env.NODE_ENV !== "production" && !!FAKE_API_URL && request.headers.get("x-cogna-lotus-model-mode") === "fake";
  return `${wantsFake ? FAKE_API_URL : API_URL}/lotus/${path}${source.search}`;
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  for (const name of [
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
    const response = await fetch(lotusUrl(request, segments), {
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
      { message: `Cogna Lotus is unavailable at ${API_URL}. Start the API and retry.` },
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

/** Keep the browser proxy aligned with the API's student-data deletion route. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, context);
}
