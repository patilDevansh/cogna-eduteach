"use client";

import type {
  DiagnosticV2SummaryOverview,
  MicroSkillStatus,
} from "@cogna/shared";
import styles from "@/components/diagnostic-v2.module.css";

type Band = {
  key: string;
  label: string;
  count: number;
  color: string;
};

const STATUS_LABEL: Record<MicroSkillStatus, string> = {
  RELIABLE: "Solid",
  DEVELOPING: "Building",
  EMERGING: "Getting started",
  LIKELY_GAP: "Needs practice",
  UNKNOWN: "Still checking",
};

/** Qualitative fill only — never presented as a percentage score. */
const STATUS_FILL: Record<MicroSkillStatus, number> = {
  RELIABLE: 1,
  DEVELOPING: 0.72,
  EMERGING: 0.42,
  LIKELY_GAP: 0.28,
  UNKNOWN: 0.12,
};

function statusTone(status: MicroSkillStatus): string {
  switch (status) {
    case "RELIABLE":
      return styles.skillSolid;
    case "DEVELOPING":
      return styles.skillBuilding;
    case "LIKELY_GAP":
      return styles.skillGap;
    default:
      return styles.skillQuiet;
  }
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

function OverviewRing({ bands, total }: { bands: Band[]; total: number }) {
  const size = 148;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const stroke = 16;

  if (total === 0) {
    return (
      <div className={styles.overviewRing} aria-hidden="true">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--line)"
            strokeWidth={stroke}
          />
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fontSize="13"
            fill="var(--ink-faint)"
            fontFamily="var(--font-math)"
          >
            —
          </text>
        </svg>
      </div>
    );
  }

  let angle = 0;
  const gaps = 2;
  const usable = 360 - bands.filter((b) => b.count > 0).length * gaps;
  const slices = bands
    .filter((b) => b.count > 0)
    .map((b) => {
      const sweep = (b.count / total) * usable;
      const start = angle;
      const end = angle + sweep;
      angle = end + gaps;
      return { ...b, start, end };
    });

  return (
    <div className={styles.overviewRing}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={`Today's check: ${bands.map((b) => `${b.count} ${b.label}`).join(", ")}`}
      >
        {slices.map((s) => (
          <path
            key={s.key}
            d={arcPath(cx, cy, r, s.start, s.end)}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
          />
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="var(--ink)"
          fontFamily="var(--font-math)"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize="11"
          fill="var(--ink-faint)"
        >
          skills today
        </text>
      </svg>
    </div>
  );
}

export function DiagnosticV2SummaryPanel({
  summaryText,
  overview,
}: {
  summaryText: string;
  overview?: DiagnosticV2SummaryOverview | null;
}) {
  const skills = overview?.skills ?? [];
  const solid = skills.filter(
    (s) => s.status === "RELIABLE" || s.status === "DEVELOPING",
  );
  const gaps = skills.filter((s) => s.status === "LIKELY_GAP");
  const building = skills.filter(
    (s) => s.status === "EMERGING" || s.status === "UNKNOWN",
  );

  const bands: Band[] = [
    {
      key: "solid",
      label: "Solid",
      count: skills.filter((s) => s.status === "RELIABLE").length,
      color: "var(--accent)",
    },
    {
      key: "building",
      label: "Building",
      count: skills.filter((s) => s.status === "DEVELOPING").length,
      color: "var(--accent-deep)",
    },
    {
      key: "started",
      label: "Getting started",
      count: building.length,
      color: "var(--line-strong)",
    },
    {
      key: "gap",
      label: "Needs practice",
      count: gaps.length,
      color: "var(--caution)",
    },
  ];
  const total = bands.reduce((n, b) => n + b.count, 0);

  const finished =
    overview != null
      ? `${overview.itemsCompleted} of ${overview.itemsAttempted} question${
          overview.itemsAttempted === 1 ? "" : "s"
        } finished`
      : null;

  return (
    <div className={styles.summaryPanel}>
      {summaryText ? (
        <div className={styles.summaryBody}>{summaryText}</div>
      ) : (
        <p className="lead">
          Your summary isn&apos;t ready yet — everything you wrote has been
          saved, so nothing is lost.
        </p>
      )}

      {overview && (
        <>
          <div className={styles.summaryOverview}>
            <OverviewRing bands={bands} total={total} />
            <div className={styles.summaryLegend}>
              {finished && <p className={styles.summaryFinished}>{finished}</p>}
              <ul>
                {bands.map((b) => (
                  <li key={b.key}>
                    <span
                      className={styles.legendSwatch}
                      style={{ background: b.color }}
                    />
                    <span>
                      {b.label}
                      <strong> {b.count}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {solid.length > 0 && (
            <section className={styles.summarySection}>
              <h2>Going well</h2>
              <ul className={styles.skillList}>
                {solid.map((s) => (
                  <li key={s.microSkillId} className={statusTone(s.status)}>
                    <div className={styles.skillHead}>
                      <span className={styles.skillName}>{s.childFacingName}</span>
                      <span className={styles.skillBand}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <div className={styles.skillTrack} aria-hidden="true">
                      <div
                        className={styles.skillFill}
                        style={{ width: `${Math.round(STATUS_FILL[s.status] * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {gaps.length > 0 && (
            <section className={styles.summarySection}>
              <h2>We&apos;ll work on</h2>
              <ul className={styles.skillList}>
                {gaps.map((s) => (
                  <li key={s.microSkillId} className={statusTone(s.status)}>
                    <div className={styles.skillHead}>
                      <span className={styles.skillName}>{s.childFacingName}</span>
                      <span className={styles.skillBand}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <div className={styles.skillTrack} aria-hidden="true">
                      <div
                        className={styles.skillFill}
                        style={{ width: `${Math.round(STATUS_FILL[s.status] * 100)}%` }}
                      />
                    </div>
                    {s.note && <p className={styles.skillNote}>{s.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {building.length > 0 && solid.length === 0 && gaps.length === 0 && (
            <section className={styles.summarySection}>
              <h2>Still checking</h2>
              <ul className={styles.skillList}>
                {building.map((s) => (
                  <li key={s.microSkillId} className={statusTone(s.status)}>
                    <div className={styles.skillHead}>
                      <span className={styles.skillName}>{s.childFacingName}</span>
                      <span className={styles.skillBand}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <div className={styles.skillTrack} aria-hidden="true">
                      <div
                        className={styles.skillFill}
                        style={{ width: `${Math.round(STATUS_FILL[s.status] * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${styles.summarySection} ${styles.summaryNext}`}>
            <h2>What&apos;s next</h2>
            <p>
              {gaps.length > 0
                ? "We'll come back to the tricky bits in a few days — a short check, not a whole new test."
                : "Keep practising similar problems so today's skills stay solid."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
