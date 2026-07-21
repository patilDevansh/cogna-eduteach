import Link from "next/link";

export function Wordmark({ href = "/", size }: { href?: string; size?: string }) {
  return (
    <Link href={href} className="wordmark" style={size ? { fontSize: size } : undefined}>
      Cogna<span className="dot">.</span>
    </Link>
  );
}

export function TopBar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="topbar">
      <Wordmark />
      <nav className="topbar-links">{right}</nav>
    </header>
  );
}

export function ProgressDots({ done, total, current }: { done: number; total: number; current?: boolean }) {
  return (
    <div className="progress-dots" role="img" aria-label={`Question ${Math.min(done + 1, total)} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i < done ? "done" : i === done && current ? "now" : ""} />
      ))}
    </div>
  );
}

export function CheckMark() {
  return (
    <svg className="check-draw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M5 13.5 L10.5 19 L21 7.5"
        fill="none"
        stroke="var(--success)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GentleMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="10" fill="none" stroke="var(--caution)" strokeWidth="2.5" />
      <path d="M13 8 v6" stroke="var(--caution)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="13" cy="17.5" r="1.4" fill="var(--caution)" />
    </svg>
  );
}
