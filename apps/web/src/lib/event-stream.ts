"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reads a server-sent event stream with fetch rather than EventSource, so the
 * page's sign-in headers come along and nothing private goes in the URL.
 * Reconnects after a drop, waiting longer each time (1 s up to 30 s).
 * Returns a function that closes it.
 */
export function openEventStream(
  url: string,
  headers: () => Record<string, string>,
  onEvent: (event: { type: string } & Record<string, unknown>) => void,
  onConnected: (connected: boolean) => void,
): () => void {
  let closed = false;
  let controller: AbortController | null = null;
  let retryMs = 1_000;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = async () => {
    controller = new AbortController();
    try {
      const res = await fetch(url, { headers: { Accept: "text/event-stream", ...headers() }, signal: controller.signal, cache: "no-store" });
      // A sign-in problem won't fix itself by retrying quickly.
      if (res.status === 401 || res.status === 403 || res.status === 404) retryMs = 30_000;
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (!data) continue;
          try {
            const event = JSON.parse(data) as { type: string } & Record<string, unknown>;
            if (event.type === "ready") {
              retryMs = 1_000;
              onConnected(true);
            }
            onEvent(event);
          } catch {
            // A malformed event is skipped; the next one still arrives.
          }
        }
      }
    } catch {
      // Dropped, refused or aborted: handled below.
    }
    if (closed) return;
    onConnected(false);
    retryTimer = setTimeout(() => void connect(), retryMs);
    retryMs = Math.min(retryMs * 2, 30_000);
  };

  void connect();
  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller?.abort();
  };
}

/**
 * Keeps a stream open while `url` is set. `onEvent` may change every render;
 * the latest one is always called. Returns whether the stream is connected,
 * so the page can slow its fallback refresh while it is.
 */
export function useEventStream(
  url: string | null,
  headers: () => Record<string, string>,
  onEvent: (event: { type: string } & Record<string, unknown>) => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const headersRef = useRef(headers);
  headersRef.current = headers;
  useEffect(() => {
    setConnected(false);
    if (!url) return;
    return openEventStream(url, () => headersRef.current(), (event) => handler.current(event), setConnected);
  }, [url]);
  return connected;
}
