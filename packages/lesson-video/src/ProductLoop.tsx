import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { PRODUCT_LOOP_FPS, PRODUCT_LOOP_SCENES, PRODUCT_LOOP_WIDTH } from "./types";

const INK = "#16241d";
const INK_SOFT = "#51635a";
const INK_FAINT = "#7d8c84";
const ACCENT = "#0e6b54";
const ACCENT_DEEP = "#08463a";
const ACCENT_WASH = "#e3efe9";
const BG = "#f4f7f3";
const LINE = "#d7e0da";
const DISPLAY = '"Avenir Next", "Trebuchet MS", sans-serif';
const BODY = '"Helvetica Neue", "Segoe UI", sans-serif';
const MATH = "Menlo, Consolas, monospace";

const STAGES = ["Join", "Diagnose", "Teach", "Check", "Teacher acts"] as const;

const ROSTER = [
  {
    name: "Aarav Choudhury",
    roll: "8A-19",
    finding: "Knows (−2)(−5), drops a sign in distribution",
    action: "Make both signed products visible",
    status: "Bridge",
    color: "#c56636",
  },
  {
    name: "Meena Krishnan",
    roll: "8A-29",
    finding: "Opens the first bracket; misses the second",
    action: "One arrow per term across every bracket",
    status: "Bridge",
    color: "#c56636",
  },
  {
    name: "Rohan Sengupta",
    roll: "8A-26",
    finding: "Algebraic method is valid; final division slips",
    action: "Keep the method. Add a substitution check",
    status: "Check finish",
    color: "#5366d6",
  },
  {
    name: "Divya Kapoor",
    roll: "8A-12",
    finding: "Combines x terms; changes constants on one side",
    action: "Same operation on both sides",
    status: "Bridge",
    color: "#c56636",
  },
  {
    name: "Kabir Das",
    roll: "8A-07",
    finding: "Skips and conflicting inputs — not enough evidence",
    action: "Fresh check. No fabricated weakness",
    status: "Recheck",
    color: "#7956a8",
  },
] as const;

function framesFor(seconds: number): number {
  return Math.max(1, Math.round(seconds * PRODUCT_LOOP_FPS));
}

function useEnter(durationInFrames: number) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames - 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return {
    opacity: enter * exit,
    y: interpolate(frame, [0, 16], [22, 0], { extrapolateRight: "clamp" }),
  };
}

function Wordmark({ light = false, size = 28 }: { light?: boolean; size?: number }) {
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: "-0.04em",
        color: light ? "#fff" : INK,
      }}
    >
      Cogna<span style={{ color: light ? "#8ad2b8" : ACCENT }}>.</span>
    </div>
  );
}

function StageBar({ active }: { active: number }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {STAGES.map((label, index) => {
        const on = index === active;
        const done = index < active;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: on ? ACCENT : done ? ACCENT_WASH : "transparent",
                color: on ? "#fff" : done ? ACCENT_DEEP : INK_FAINT,
                border: `1px solid ${on || done ? "transparent" : LINE}`,
              }}
            >
              {label}
            </div>
            {index < STAGES.length - 1 ? (
              <div style={{ width: 18, height: 1, background: done || on ? ACCENT : LINE }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Caption({ kicker, text, invert = false }: { kicker: string; text: string; invert?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        right: 64,
        bottom: 48,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: invert ? "#8ad2b8" : ACCENT,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 32,
          lineHeight: 1.2,
          color: invert ? "#fff" : INK,
          maxWidth: 1400,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function Chrome({
  title,
  width,
  children,
}: {
  title: string;
  width: number | string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width,
        background: "#fff",
        borderRadius: 18,
        overflow: "hidden",
        border: `1px solid ${LINE}`,
        boxShadow: "0 24px 60px rgba(8,70,58,0.12)",
      }}
    >
      <div
        style={{
          height: 42,
          background: BG,
          borderBottom: `1px solid ${LINE}`,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 7,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#e07a5f" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f2cc8f" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#81b29a" }} />
        <span style={{ marginLeft: 12, fontSize: 13, color: INK_FAINT, fontWeight: 600 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function TitleScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  return (
    <AbsoluteFill style={{ background: ACCENT_DEEP, fontFamily: BODY }}>
      <div
        style={{
          position: "absolute",
          right: -120,
          top: -140,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
        }}
      />
      <div
        style={{
          opacity: motion.opacity,
          transform: `translateY(${motion.y}px)`,
          padding: "120px 80px 0",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8ad2b8" }}>
          Grade 8 · CBSE Mathematics
        </div>
        <Wordmark light size={42} />
        <h1
          style={{
            margin: "28px 0 0",
            fontFamily: DISPLAY,
            fontSize: 92,
            lineHeight: 0.98,
            letterSpacing: "-0.045em",
            color: "#fff",
            maxWidth: 1400,
          }}
        >
          Student and teacher,
          <br />
          one honest loop.
        </h1>
        <p style={{ marginTop: 28, fontSize: 28, color: "#d7e8e0", maxWidth: 920, lineHeight: 1.4 }}>
          Aarav works a problem. Cogna records the evidence. Ananya sees the next teaching move — not a long AI report.
        </p>
      </div>
      <Caption kicker="The product" text="Practice that pays attention." invert />
    </AbsoluteFill>
  );
}

function TwoSidesScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "56px 64px 160px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <Wordmark />
        <StageBar active={0} />
      </div>
      <div
        style={{
          opacity: motion.opacity,
          transform: `translateY(${motion.y}px)`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28,
          height: 680,
        }}
      >
        <Chrome title="student.cogna · classroom" width="100%">
          <div style={{ padding: 28, height: 620 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>
              Student
            </div>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 36, margin: "10px 0 0", color: INK }}>Aarav Choudhury</h2>
            <p style={{ color: INK_SOFT, marginTop: 8 }}>Grade 8 · Section A · class code GURU-8A</p>
            <div
              style={{
                marginTop: 28,
                background: ACCENT_WASH,
                borderRadius: 14,
                padding: 22,
                fontFamily: MATH,
                fontSize: 28,
                fontWeight: 700,
                color: ACCENT_DEEP,
              }}
            >
              Expand: −2(y − 5)
            </div>
            <div style={{ marginTop: 18, color: INK_SOFT, fontSize: 16, lineHeight: 1.5 }}>
              One problem at a time. Hints come one small step at a time. Watching a lesson is separate from showing the work independently.
            </div>
          </div>
        </Chrome>
        <Chrome title="teacher.cogna · today" width="100%">
          <div style={{ padding: 28, height: 620, background: "#fff" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>
              Teacher
            </div>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 36, margin: "10px 0 0", color: INK }}>Ananya Rao</h2>
            <p style={{ color: INK_SOFT, marginTop: 8 }}>Good afternoon. Grade 8 · Section A is ready to read.</p>
            <div
              style={{
                marginTop: 28,
                background: ACCENT_DEEP,
                color: "#fff",
                borderRadius: 14,
                padding: 22,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8ad2b8" }}>
                Cogna’s teaching recommendation
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 24, marginTop: 10, lineHeight: 1.2 }}>
                Reinforce signed operations for 10 minutes before equations with brackets.
              </div>
            </div>
          </div>
        </Chrome>
      </div>
      <Caption kicker="Two seats, one evidence trail" text="The student works. The teacher sees what it meant." />
    </AbsoluteFill>
  );
}

function JoinScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "56px 64px 160px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <Wordmark />
        <StageBar active={0} />
      </div>
      <div style={{ opacity: motion.opacity, transform: `translateY(${motion.y}px)`, display: "flex", justifyContent: "center" }}>
        <Chrome title="cogna · I have a class code" width={780}>
          <div style={{ padding: "40px 48px 48px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>
              Classroom
            </div>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 42, marginTop: 8, color: INK }}>Join Grade 8 · Section A</h2>
            <p style={{ color: INK_SOFT, marginTop: 8 }}>Enter the code your teacher wrote on the board.</p>
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK_SOFT, marginBottom: 8 }}>Class code</div>
              <div
                style={{
                  border: `2px solid ${ACCENT}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                  fontFamily: MATH,
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: INK,
                  background: ACCENT_WASH,
                }}
              >
                GURU-8A
              </div>
            </div>
            <div
              style={{
                marginTop: 18,
                background: ACCENT_WASH,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <strong style={{ display: "block", color: ACCENT_DEEP }}>Class found</strong>
              <span style={{ color: INK_SOFT, fontSize: 14 }}>Ananya Rao · Grade 8 · Section A · 30 students</span>
            </div>
            <div
              style={{
                marginTop: 22,
                background: ACCENT,
                color: "#fff",
                borderRadius: 12,
                padding: "16px 18px",
                textAlign: "center",
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              Continue as Aarav Choudhury · 8A-19
            </div>
          </div>
        </Chrome>
      </div>
      <Caption kicker="Student arrives" text="A class code is enough. The session is signed, calm, and attributed." />
    </AbsoluteFill>
  );
}

function DiagnosticScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  const frame = useCurrentFrame();
  const typed = interpolate(frame, [8, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const working = "−2 × y = −2y\n2 × 5 = 10\n−2y − 10";
  const shown = working.slice(0, Math.round(working.length * typed));
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "56px 64px 160px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <Wordmark />
        <StageBar active={1} />
      </div>
      <div style={{ opacity: motion.opacity, transform: `translateY(${motion.y}px)`, display: "flex", justifyContent: "center" }}>
        <Chrome title="Lotus diagnostic · question 1 of 3" width={920}>
          <div style={{ padding: "32px 40px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: INK_FAINT, fontSize: 14, fontWeight: 700 }}>
              <span>Negative bracket expansion</span>
              <span>34 seconds</span>
            </div>
            <div style={{ fontFamily: MATH, fontSize: 48, fontWeight: 700, margin: "18px 0 8px", color: INK }}>
              Expand: −2(y − 5)
            </div>
            <div style={{ fontSize: 14, color: INK_FAINT, borderLeft: `2px solid ${LINE}`, paddingLeft: 12 }}>
              Checks whether both signs stay visible during written distribution.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 18, marginTop: 24 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK_SOFT, marginBottom: 8 }}>Working</div>
                <div
                  style={{
                    minHeight: 150,
                    border: `1px solid ${LINE}`,
                    borderRadius: 12,
                    padding: 16,
                    fontFamily: MATH,
                    fontSize: 22,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    color: INK,
                    background: BG,
                  }}
                >
                  {shown}
                  <span style={{ opacity: 0.35 }}>▍</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK_SOFT, marginBottom: 8 }}>Answer</div>
                <div
                  style={{
                    border: `1px solid ${LINE}`,
                    borderRadius: 12,
                    padding: "14px 16px",
                    fontFamily: MATH,
                    fontSize: 24,
                    color: INK,
                  }}
                >
                  −2y − 10
                </div>
                <div style={{ marginTop: 18, fontSize: 13, fontWeight: 700, color: INK_SOFT }}>Confidence · 78%</div>
                <div style={{ marginTop: 8, height: 8, background: LINE, borderRadius: 99 }}>
                  <div style={{ width: "78%", height: "100%", background: ACCENT, borderRadius: 99 }} />
                </div>
                <div
                  style={{
                    marginTop: 22,
                    background: ACCENT,
                    color: "#fff",
                    borderRadius: 10,
                    padding: "12px 14px",
                    textAlign: "center",
                    fontWeight: 800,
                  }}
                >
                  Submit
                </div>
              </div>
            </div>
          </div>
        </Chrome>
      </div>
      <Caption
        kicker="Lotus diagnostic"
        text="Every answer, working step, skip, confidence rating, and pause is evidence."
      />
    </AbsoluteFill>
  );
}

function EvidenceScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "56px 64px 160px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <Wordmark />
        <StageBar active={1} />
      </div>
      <div
        style={{
          opacity: motion.opacity,
          transform: `translateY(${motion.y}px)`,
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 28,
        }}
      >
        <Chrome title="What Cogna observed" width="100%">
          <div style={{ padding: 28, display: "grid", gap: 12 }}>
            {[
              ["Signed multiplication", "(−2)(−5) = +10  ·  known"],
              ["Written distribution", "−2(y − 5) became −2y − 10"],
              ["The missed action", "The second sign was not carried"],
              ["Confidence", "High — 78% — while the expansion was incomplete"],
            ].map(([label, value]) => (
              <div key={label} style={{ background: BG, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: INK_FAINT }}>
                  {label}
                </div>
                <div style={{ marginTop: 4, fontSize: 18, color: INK }}>{value}</div>
              </div>
            ))}
          </div>
        </Chrome>
        <div
          style={{
            background: ACCENT_DEEP,
            color: "#fff",
            borderRadius: 18,
            padding: 36,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 520,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8ad2b8" }}>
              Supported teaching need
            </div>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 42, marginTop: 14, lineHeight: 1.1 }}>
              Keep both signs visible.
            </h2>
            <p style={{ marginTop: 16, color: "#d7e8e0", fontSize: 20, lineHeight: 1.45 }}>
              Aarav already knows the sign rule. The lesson will not reteach negatives. It will make both products visible while distributing.
            </p>
          </div>
          <div style={{ fontSize: 15, color: "#8ad2b8" }}>
            Cogna does not invent a weakness. If evidence is thin, it withholds the claim.
          </div>
        </div>
      </div>
      <Caption kicker="Learner-state decision" text="One objective, bounded by what the diagnostic actually showed." />
    </AbsoluteFill>
  );
}

function LessonScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "56px 64px 160px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <Wordmark />
        <StageBar active={2} />
      </div>
      <div style={{ opacity: motion.opacity, transform: `translateY(${motion.y}px)`, display: "flex", justifyContent: "center" }}>
        <Chrome title="Personalized lesson · mathematically verified" width={1080}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", minHeight: 560 }}>
            <div
              style={{
                background: "linear-gradient(140deg,#dff2e9,#b8dece)",
                padding: 40,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT_DEEP }}>
                Your evidence
              </div>
              <h2 style={{ fontFamily: DISPLAY, fontSize: 40, marginTop: 12, color: ACCENT_DEEP, lineHeight: 1.1 }}>
                Write two signed products
              </h2>
              <div
                style={{
                  marginTop: 28,
                  background: "rgba(255,255,255,0.86)",
                  borderRadius: 14,
                  padding: 22,
                  fontFamily: MATH,
                  fontSize: 26,
                  fontWeight: 700,
                  color: ACCENT_DEEP,
                }}
              >
                −2(y − 5) = (−2)(y) + (−2)(−5)
              </div>
              <div
                style={{
                  marginTop: 14,
                  background: "rgba(255,255,255,0.86)",
                  borderRadius: 14,
                  padding: 22,
                  fontFamily: MATH,
                  fontSize: 26,
                  fontWeight: 700,
                  color: ACCENT_DEEP,
                }}
              >
                = −2y + 10
              </div>
              <p style={{ marginTop: 22, color: "#34574e", fontSize: 18, lineHeight: 1.45 }}>
                The outside negative two multiplies both signed terms. Signs first. Arithmetic second.
              </p>
            </div>
            <div style={{ padding: 32, background: "#fff" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT }}>
                Release checks
              </div>
              {[
                "Objective matches Aarav’s evidence",
                "Every expression verified deterministically",
                "Captions, pause, and replay available",
                "Unchecked LLM math is rejected",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    marginTop: 16,
                    padding: "14px 12px",
                    background: ACCENT_WASH,
                    borderRadius: 10,
                    color: ACCENT_DEEP,
                    fontWeight: 650,
                    fontSize: 16,
                  }}
                >
                  ✓  {item}
                </div>
              ))}
            </div>
          </div>
        </Chrome>
      </div>
      <Caption kicker="Personalized teaching" text="A short narrated lesson for this student — released only after verification." />
    </AbsoluteFill>
  );
}

function ExitScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "56px 64px 160px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <Wordmark />
        <StageBar active={3} />
      </div>
      <div style={{ opacity: motion.opacity, transform: `translateY(${motion.y}px)`, display: "flex", justifyContent: "center" }}>
        <Chrome title="Independent exit · no hints" width={880}>
          <div style={{ padding: "36px 44px 44px" }}>
            <div
              style={{
                display: "inline-flex",
                background: "#fff3d4",
                color: "#684306",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Fresh item · unassisted
            </div>
            <div style={{ fontFamily: MATH, fontSize: 48, fontWeight: 700, margin: "22px 0 10px", color: INK }}>
              Expand: −3(a − 4)
            </div>
            <p style={{ color: INK_SOFT, fontSize: 18 }}>
              This is not the taught example. Guided practice and independent evidence stay separate.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 28 }}>
              {[
                ["Watched", "Yes"],
                ["Hints used", "None"],
                ["This item", "Independent"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: BG, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: INK_FAINT }}>
                    {k}
                  </div>
                  <strong style={{ display: "block", marginTop: 4, fontSize: 22, color: INK }}>{v}</strong>
                </div>
              ))}
            </div>
          </div>
        </Chrome>
      </div>
      <Caption kicker="Independent check" text="One successful item is evidence of this form — not a mastery or retention claim." />
    </AbsoluteFill>
  );
}

function TeacherScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  const metrics = [
    ["Understood today", "63%", "19 of 30 showed the taught method independently.", "#0e6b54", "63%"],
    ["Ready next", "18", "Prerequisites for tomorrow’s planned topic.", "#0e6b54", "60%"],
    ["Need a bridge", "8", "A specific gap is supported by repeated evidence.", "#d58b17", "27%"],
    ["Evidence check", "4", "Cogna is withholding a weakness conclusion.", "#7956a8", "13%"],
  ] as const;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "48px 56px 150px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Wordmark />
        <StageBar active={4} />
      </div>
      <div style={{ opacity: motion.opacity, transform: `translateY(${motion.y}px)` }}>
        <Chrome title="teacher.cogna · Today · Grade 8 · Section A" width="100%">
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", minHeight: 620 }}>
            <div style={{ borderRight: `1px solid ${LINE}`, padding: 18, background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_FAINT, marginBottom: 8 }}>
                Ananya Rao
              </div>
              {["Today", "Reports", "Students", "Evidence", "Sessions"].map((item, i) => (
                <div
                  key={item}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginTop: 4,
                    background: i === 0 ? ACCENT_WASH : "transparent",
                    color: i === 0 ? ACCENT_DEEP : INK_SOFT,
                    fontWeight: i === 0 ? 750 : 500,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
            <div style={{ padding: 24, background: BG }}>
              <div style={{ fontSize: 13, fontWeight: 750, color: ACCENT, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Evidence ready · Today
              </div>
              <h2 style={{ fontFamily: DISPLAY, fontSize: 34, marginTop: 4, color: INK }}>Good afternoon, Ananya.</h2>
              <div
                style={{
                  marginTop: 16,
                  background: ACCENT_DEEP,
                  color: "#fff",
                  borderRadius: 16,
                  padding: 22,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8ad2b8" }}>
                      Cogna’s teaching recommendation
                    </div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 26, marginTop: 8, maxWidth: 820, lineHeight: 1.15 }}>
                      Reinforce signed operations for 10 minutes before equations with brackets.
                    </div>
                  </div>
                  <span
                    style={{
                      background: "#fff1cf",
                      color: "#684306",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Reinforcement advised
                  </span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 14 }}>
                {metrics.map(([label, value, note, color, width]) => (
                  <div key={label} style={{ background: "#fff", borderRadius: 14, padding: 14, border: `1px solid ${LINE}` }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: INK_FAINT }}>
                      {label}
                    </div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 32, color: INK, marginTop: 4 }}>{value}</div>
                    <p style={{ fontSize: 12, color: INK_SOFT, marginTop: 4, minHeight: 36 }}>{note}</p>
                    <div style={{ height: 6, background: "#e7eee9", borderRadius: 99, marginTop: 8 }}>
                      <div style={{ width, height: "100%", background: color, borderRadius: 99 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Chrome>
      </div>
      <Caption kicker="Teacher today" text="Thirty seconds: what landed, who needs a bridge, and who should not be labelled yet." />
    </AbsoluteFill>
  );
}

function RosterScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: BODY, padding: "48px 56px 150px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Wordmark />
        <StageBar active={4} />
      </div>
      <div style={{ opacity: motion.opacity, transform: `translateY(${motion.y}px)` }}>
        <Chrome title="Five evidence trails · Grade 8 · Section A" width="100%">
          <div style={{ padding: 22, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT }}>
                  Next action per student
                </div>
                <h2 style={{ fontFamily: DISPLAY, fontSize: 30, marginTop: 4, color: INK }}>Each trail is distinct because the evidence was.</h2>
              </div>
              <div style={{ color: INK_SOFT, fontSize: 14 }}>5 videos verified · 1 abstention</div>
            </div>
            {ROSTER.map((row) => (
              <div
                key={row.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px 1.2fr 1.1fr 140px",
                  gap: 16,
                  alignItems: "center",
                  padding: "14px 8px",
                  borderTop: `1px solid ${LINE}`,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: 17, color: INK }}>{row.name}</strong>
                  <span style={{ fontSize: 13, color: INK_FAINT }}>{row.roll}</span>
                </div>
                <div style={{ fontSize: 15, color: INK_SOFT }}>{row.finding}</div>
                <div style={{ fontSize: 16, color: INK, fontWeight: 650 }}>{row.action}</div>
                <div
                  style={{
                    justifySelf: "end",
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 800,
                    color: row.color,
                    background: `${row.color}18`,
                  }}
                >
                  {row.status}
                </div>
              </div>
            ))}
          </div>
        </Chrome>
      </div>
      <Caption kicker="Teacher action" text="Exact steps sit behind each card. The first screen never dumps a long AI report." />
    </AbsoluteFill>
  );
}

function CloseScene({ durationInFrames }: { durationInFrames: number }) {
  const motion = useEnter(durationInFrames);
  const steps = [
    ["1", "Student works"],
    ["2", "Evidence stored"],
    ["3", "One teaching move"],
    ["4", "Independent check"],
    ["5", "Teacher acts"],
  ];
  return (
    <AbsoluteFill style={{ background: ACCENT_DEEP, fontFamily: BODY }}>
      <div
        style={{
          opacity: motion.opacity,
          transform: `translateY(${motion.y}px)`,
          padding: "110px 80px 0",
        }}
      >
        <Wordmark light size={36} />
        <h1
          style={{
            margin: "24px 0 0",
            fontFamily: DISPLAY,
            fontSize: 72,
            lineHeight: 1.02,
            letterSpacing: "-0.04em",
            color: "#fff",
            maxWidth: 1400,
          }}
        >
          The child practices.
          <br />
          The teacher decides.
        </h1>
        <div style={{ display: "flex", gap: 14, marginTop: 48, flexWrap: "wrap" }}>
          {steps.map(([n, label], index) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 16,
                  padding: "16px 20px",
                  minWidth: 210,
                }}
              >
                <div style={{ color: "#8ad2b8", fontWeight: 800, fontSize: 13, letterSpacing: "0.12em" }}>{n}</div>
                <div style={{ color: "#fff", fontFamily: DISPLAY, fontSize: 22, marginTop: 6 }}>{label}</div>
              </div>
              {index < steps.length - 1 ? <div style={{ color: "#8ad2b8", fontSize: 28 }}>→</div> : null}
            </div>
          ))}
        </div>
      </div>
      <Caption kicker="Cogna" text="Practice that pays attention — without inventing a diagnosis." invert />
    </AbsoluteFill>
  );
}

const SCENE_COMPONENTS: Record<(typeof PRODUCT_LOOP_SCENES)[number]["id"], React.FC<{ durationInFrames: number }>> = {
  title: TitleScene,
  twoSides: TwoSidesScene,
  join: JoinScene,
  diagnostic: DiagnosticScene,
  evidence: EvidenceScene,
  lesson: LessonScene,
  exit: ExitScene,
  teacher: TeacherScene,
  roster: RosterScene,
  close: CloseScene,
};

export const ProductLoop: React.FC = () => {
  let start = 0;
  const scale = PRODUCT_LOOP_WIDTH / 1920;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Audio src={staticFile("product-loop-voice.mp3")} />
      {PRODUCT_LOOP_SCENES.map((scene) => {
        const durationInFrames = framesFor(scene.seconds);
        const from = start;
        start += durationInFrames;
        const Scene = SCENE_COMPONENTS[scene.id];
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <div
              style={{
                position: "absolute",
                width: 1920,
                height: 1080,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <Scene durationInFrames={durationInFrames} />
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
