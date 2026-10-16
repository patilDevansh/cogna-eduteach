/**
 * Forwards one browser request to the Lotus API and returns a fully-read
 * response, within a time limit.
 *
 * Why buffer instead of streaming the upstream body through: a streamed body
 * that stalls (a half-closed keep-alive socket, an API restart mid-reply)
 * leaves the browser's `res.json()` waiting indefinitely, and the student
 * sits on "Saving your answer…" with no way out. Lotus replies are small JSON,
 * so reading them whole costs nothing, and a hard deadline turns any stall
 * into a clear 504 the page can retry. Retrying an answer is safe: every
 * submission carries a submissionId the API treats idempotently.
 */

export interface ForwardResult {
  status: number;
  contentType: string | null;
  body: string;
}

export interface ForwardOptions {
  /** Upper bound for the whole exchange: connect, headers and body. */
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class LotusUpstreamTimeout extends Error {}
export class LotusUpstreamUnavailable extends Error {}

export async function forwardToLotus(url: string, init: RequestInit, options: ForwardOptions): Promise<ForwardResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  try {
    const response = await doFetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    return { status: response.status, contentType: response.headers.get("content-type"), body };
  } catch (err) {
    if (timedOut) throw new LotusUpstreamTimeout(`Lotus did not answer within ${Math.round(options.timeoutMs / 1000)} s.`);
    throw new LotusUpstreamUnavailable(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How long one Lotus request may take. Most calls are instant; a non-
 * factorisation answer can wait on the AI review, so it gets longer.
 */
export function lotusTimeoutMs(method: string, segments: string[]): number {
  if (method === "POST" && segments.at(-1) === "answers") return 90_000;
  if (segments.at(-1) === "read-aloud") return 30_000;
  return 30_000;
}
