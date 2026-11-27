// Relay for "draw on my phone": the phone POSTs its sheets after each stroke, the laptop polls GET.
// The unguessable code in the QR is the only permission, so it is checked strictly.
// ponytail: in-memory and per process, fine for one dev/pilot server; move to the API + Redis
// (with the classroom event stream instead of polling) before running more than one web instance.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Board = { version: number; at: number; width: number; height: number; sheets: unknown; touched: number };
const boards = new Map<string, Board>();
const CODE = /^[a-f0-9]{32}$/;
const MAX_BYTES = 512_000; // ~ a few thousand points over several sheets
const MAX_BOARDS = 500;
const TTL_MS = 2 * 60 * 60_000;

type Params = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Params) {
  const { code } = await params;
  if (!CODE.test(code)) return new Response(null, { status: 404 });
  const board = boards.get(code);
  const since = Number(new URL(request.url).searchParams.get("since") ?? -1);
  if (!board || board.version === since) return new Response(null, { status: 204 });
  const { touched: _, ...rest } = board;
  return Response.json(rest);
}

export async function POST(request: Request, { params }: Params) {
  const { code } = await params;
  if (!CODE.test(code)) return new Response(null, { status: 404 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response("Drawing too large", { status: 413 });
  let body: { at?: unknown; width?: unknown; height?: unknown; sheets?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response("Bad drawing", { status: 400 });
  }
  const { at, width, height, sheets } = body;
  const valid =
    Array.isArray(sheets) &&
    sheets.every((s) => Array.isArray(s) && s.every((stroke) => Array.isArray(stroke))) &&
    [at, width, height].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
  if (!valid) return new Response("Bad drawing", { status: 400 });

  const now = Date.now();
  for (const [key, b] of boards) if (now - b.touched > TTL_MS) boards.delete(key);
  if (!boards.has(code) && boards.size >= MAX_BOARDS) return new Response("Busy", { status: 503 });
  const version = (boards.get(code)?.version ?? 0) + 1;
  boards.set(code, { version, at: at as number, width: width as number, height: height as number, sheets, touched: now });
  return Response.json({ version });
}
