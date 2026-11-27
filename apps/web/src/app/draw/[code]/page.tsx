"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { DrawingPad, type PadView, type Stroke } from "@/components/learning/DrawingPad";

/** Phone side of "draw on my phone": just the pad, sending each change to the laptop that showed the QR. */
export default function PhonePad() {
  const { code } = useParams<{ code: string }>();
  const [status, setStatus] = useState<"ready" | "sending" | "sent" | "offline">("ready");
  const latest = useRef<string | null>(null);
  const busy = useRef(false);

  // One request at a time, always the newest drawing, so an old one can never land after a new one.
  async function flush() {
    if (busy.current) return;
    busy.current = true;
    while (latest.current) {
      const body = latest.current;
      latest.current = null;
      setStatus("sending");
      try {
        const res = await fetch(`/api/draw/${code}`, { method: "POST", body });
        setStatus(res.ok ? "sent" : "offline");
      } catch {
        setStatus("offline");
        latest.current ??= body; // try again with the next stroke
        break;
      }
    }
    busy.current = false;
  }

  function send(sheets: Stroke[][], view: PadView) {
    latest.current = JSON.stringify({ sheets, ...view });
    void flush();
  }

  const note = {
    ready: "Draw your working. It shows up on your other screen.",
    sending: "Sending…",
    sent: "On your other screen ✓",
    offline: "Not reaching your other screen. Check you're on the same Wi-Fi; your next stroke will try again.",
  }[status];

  return (
    <main style={{ minHeight: "100dvh", padding: "var(--s-4) 16px", background: "var(--bg)", display: "grid", alignContent: "start", gap: "var(--s-3)" }}>
      <p className="eyebrow" style={{ margin: 0 }}>Cogna · drawing pad</p>
      <DrawingPad onChange={send} height="min(68dvh, 34rem)" />
      <p className={status === "offline" ? "error" : "faint"} role="status" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
        {note}
      </p>
    </main>
  );
}
