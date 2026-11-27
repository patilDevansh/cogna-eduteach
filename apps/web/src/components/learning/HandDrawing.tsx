"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DrawingPad, paint, PAPER, type Stroke } from "@/components/learning/DrawingPad";

type Board = { version: number; at: number; width: number; height: number; sheets: Stroke[][] };

/** 32 hex chars from getRandomValues (randomUUID needs https, and a LAN dev address is plain http). */
function newCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * "Work it out by hand?" beside the answer: draw on this screen, or turn a phone into the pad by
 * scanning a QR code. Working only; the typed answer is still what gets checked.
 */
export function HandDrawing() {
  const [mode, setMode] = useState<"closed" | "choose" | "here" | "phone">("closed");

  if (mode === "closed") {
    return (
      <button type="button" className="btn-quiet" onClick={() => setMode("choose")} style={{ marginTop: "var(--s-3)" }}>
        ✎ Work it out by hand?
      </button>
    );
  }

  return (
    <div className="settle" style={{ marginTop: "var(--s-4)" }}>
      {mode === "choose" && (
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: "var(--s-4)", background: "var(--surface)" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Some problems are easier on paper.</p>
          <p className="faint" style={{ margin: "var(--s-1) 0 var(--s-4)", fontSize: "var(--text-sm)" }}>
            Sketch it out wherever is comfortable, then type your final answer above.
          </p>
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setMode("here")}>Draw on this screen</button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode("phone")}>Draw on my phone</button>
            <button type="button" className="btn-quiet" onClick={() => setMode("closed")}>Not now</button>
          </div>
        </div>
      )}

      {mode === "here" && (
        <>
          <DrawingPad />
          <button type="button" className="btn-quiet" onClick={() => setMode("phone")}>Use my phone instead</button>
        </>
      )}

      {mode === "phone" && <PhoneLink onHere={() => setMode("here")} onClose={() => setMode("closed")} />}
    </div>
  );
}

function PhoneLink({ onHere, onClose }: { onHere: () => void; onClose: () => void }) {
  const [code] = useState(newCode);
  const [qr, setQr] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const mirror = useRef<HTMLCanvasElement>(null);
  // The phone can't open "localhost", so dev servers set the address the phone reaches them on.
  const url = typeof window === "undefined" ? "" : `${process.env.NEXT_PUBLIC_PHONE_ORIGIN || window.location.origin}/draw/${code}`;

  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: "#16241d", light: "#ffffff" } }).then(setQr);
  }, [url]);

  // ponytail: 1 s polling of an in-memory relay; switch to the classroom event stream when this moves to the API.
  useEffect(() => {
    let version = -1;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/draw/${code}?since=${version}`, { cache: "no-store" });
        if (res.status === 200) {
          const next: Board = await res.json();
          version = next.version;
          setBoard(next);
        }
      } catch {
        // Keep polling; a dropped request just means the next tick catches up.
      }
      if (!stop) timer = setTimeout(tick, 1000);
    };
    let timer = setTimeout(tick, 0);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [code]);

  // Redraw the phone's current sheet, scaled to fit this screen.
  useEffect(() => {
    const c = mirror.current;
    if (!c || !board) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const scale = Math.min(c.clientWidth / (board.width || 1), c.clientHeight / (board.height || 1));
    paint(c, board.sheets[board.at] ?? [], scale);
  }, [board]);

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: "var(--s-4)", background: "var(--surface)" }}>
      {!board ? (
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 160, height: 160, borderRadius: "var(--radius)", background: "var(--bg)", flexShrink: 0 }}>
            {qr && <img src={qr} alt="QR code that opens a drawing pad on your phone" width={160} height={160} style={{ display: "block", borderRadius: "var(--radius)" }} />}
          </div>
          <div style={{ flex: 1, minWidth: "12rem" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Scan with your phone's camera</p>
            <p className="faint" style={{ margin: "var(--s-1) 0 var(--s-3)", fontSize: "var(--text-sm)" }}>
              Your phone becomes a drawing pad, and what you draw shows up here.
            </p>
            <p className="faint" role="status" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
              <span className="breathe" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--line-strong)", marginRight: 6 }} />
              Waiting for your phone…
            </p>
            <p className="faint" style={{ margin: "var(--s-2) 0 0", fontSize: "var(--text-xs)", wordBreak: "break-all" }}>
              Or open <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{url}</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="settle">
          <p className="faint" role="status" style={{ margin: "0 0 var(--s-2)", fontSize: "var(--text-xs)" }}>
            From your phone · sheet {board.at + 1} of {board.sheets.length}
          </p>
          <canvas ref={mirror} aria-label="Your drawing from your phone" style={{ ...PAPER, height: "16rem" }} />
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-3)", flexWrap: "wrap" }}>
        <button type="button" className="btn-quiet" onClick={onHere}>Draw on this screen instead</button>
        <button type="button" className="btn-quiet" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
