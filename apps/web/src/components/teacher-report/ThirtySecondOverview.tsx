"use client";

import React, { useMemo, useState } from "react";
import type { ReadinessCategory, TeacherReportData } from "@/lib/teacher-report/mock-data";
import styles from "./teacher-report.module.css";

type DepthTerm = "transfer" | "independent" | "assisted" | "incomplete";

interface ThirtySecondOverviewProps {
  data: TeacherReportData;
  onOpenActionBlueprint: () => void;
  onSelectReadinessTab: (tab: ReadinessCategory | "all") => void;
  onOpenEvidenceAudit: () => void;
}

const DEPTH_HELP: Record<DepthTerm, { title: string; definition: string; example: string }> = {
  transfer: {
    title: "Independent transfer",
    definition: "Used the idea without hints when the question looked different from the taught example.",
    example: "Example: after learning 4x − 6 = 2x + 8, the student also solved 3(x − 2) = x + 10.",
  },
  independent: {
    title: "Independent familiar execution",
    definition: "Completed a familiar form without hints, but fresh transfer was not yet demonstrated.",
    example: "Example: the student solved another equation that closely matched the teacher's worked example.",
  },
  assisted: {
    title: "Assisted execution",
    definition: "Reached a valid solution after using a hint or scaffold.",
    example: "Example: Cogna reminded the student to subtract 2x from both sides before they continued correctly.",
  },
  incomplete: {
    title: "Evidence incomplete",
    definition: "Cogna does not yet have enough clean evidence to make a dependable conclusion.",
    example: "Example: the student attempted only one item, skipped, or produced a conflicting input.",
  },
};

const TERM_VISUAL_EXAMPLE: Record<DepthTerm, { before: string; bridge: string; after: string }> = {
  transfer: { before: "4x − 6 = 2x + 8", bridge: "changed form", after: "3(x − 2) = x + 10" },
  independent: { before: "4x − 6 = 2x + 8", bridge: "similar form", after: "5x − 4 = 2x + 11" },
  assisted: { before: "Hint: subtract 2x", bridge: "student continues", after: "2x − 6 = 8" },
  incomplete: { before: "One usable attempt", bridge: "not enough to claim", after: "stable understanding" },
};

const TERM_UI: Record<DepthTerm, { icon: string; color: string; wash: string; beforeLabel: string; afterLabel: string; teacherMove: string }> = {
  transfer: {
    icon: "↗",
    color: "#0d7a5f",
    wash: "#eaf7f2",
    beforeLabel: "Taught form",
    afterLabel: "Changed form",
    teacherMove: "Progress to the planned topic and continue checking transfer on fresh forms.",
  },
  independent: {
    icon: "✓",
    color: "#5366d6",
    wash: "#f0f2ff",
    beforeLabel: "Taught form",
    afterLabel: "Similar form",
    teacherMove: "Offer one changed-form question before concluding that transfer is secure.",
  },
  assisted: {
    icon: "✦",
    color: "#d95f4d",
    wash: "#fff0ed",
    beforeLabel: "Support given",
    afterLabel: "Student continued",
    teacherMove: "Remove the hint on the next attempt and check for independent execution.",
  },
  incomplete: {
    icon: "?",
    color: "#8359b4",
    wash: "#f5effb",
    beforeLabel: "Evidence collected",
    afterLabel: "Current conclusion",
    teacherMove: "Collect a fresh, low-pressure attempt before assigning a learning need.",
  },
};

const COMMON_ERROR_EXAMPLES = [
  {
    id: "Q1",
    studentCount: 7,
    question: "4x − 6 = 2x + 8",
    wrong: "2x = 2",
    correct: "2x = 14 → x = 7",
    note: "Used 8 − 6 instead of 8 + 6.",
  },
  {
    id: "Q2",
    studentCount: 3,
    question: "5x − 4 = 2x + 11",
    wrong: "7x = 15",
    correct: "3x = 15 → x = 5",
    note: "Added variable terms across the equals sign.",
  },
  {
    id: "Q3",
    studentCount: 5,
    question: "3x − 7 = x + 5",
    wrong: "2x = −2",
    correct: "2x = 12 → x = 6",
    note: "Changed the side but did not use the inverse operation.",
  },
];

const READINESS_COPY: Record<ReadinessCategory, { label: string; shortLabel: string; explanation: string }> = {
  ready: {
    label: "Ready for the planned lesson",
    shortLabel: "Ready",
    explanation: "Required prerequisites were demonstrated. This does not mean every student showed fresh transfer.",
  },
  reinforcement: {
    label: "Needs a targeted bridge",
    shortLabel: "10-min bridge",
    explanation: "A specific, evidenced gap is likely to block tomorrow's lesson unless it is addressed first.",
  },
  probe: {
    label: "Needs a short evidence check",
    shortLabel: "Evidence check",
    explanation: "Cogna is abstaining from a learning-gap conclusion until it has cleaner evidence.",
  },
};

export function ThirtySecondOverview({
  data,
  onOpenActionBlueprint,
  onSelectReadinessTab,
  onOpenEvidenceAudit,
}: ThirtySecondOverviewProps) {
  const { classInfo, comprehension, readinessSummary, mainDifficulty, recommendedAction } = data;
  const [isDifficultyOpen, setIsDifficultyOpen] = useState(false);
  const [activeDepthTerm, setActiveDepthTerm] = useState<DepthTerm | null>(null);
  const [activeReadiness, setActiveReadiness] = useState<ReadinessCategory>("reinforcement");
  const [nextTopic, setNextTopic] = useState("Equations with Brackets");
  const [isEditingTopic, setIsEditingTopic] = useState(false);

  const total = classInfo.totalStudents;
  const depthCounts = {
    transfer: comprehension.transferCount,
    independent: comprehension.independentCount - comprehension.transferCount,
    assisted: comprehension.familiarCount - comprehension.independentCount,
    incomplete: total - comprehension.familiarCount,
  };
  const depthTotal = Object.values(depthCounts).reduce((sum, value) => sum + value, 0);
  const readinessCounts: Record<ReadinessCategory, number> = {
    ready: readinessSummary.readyCount,
    reinforcement: readinessSummary.reinforcementCount,
    probe: readinessSummary.probeCount,
  };

  const activeGroup = useMemo(
    () => data.students.filter((student) => student.readiness === activeReadiness),
    [activeReadiness, data.students],
  );

  const depthStops = {
    first: (depthCounts.transfer / depthTotal) * 100,
    second: ((depthCounts.transfer + depthCounts.independent) / depthTotal) * 100,
    third: ((depthCounts.transfer + depthCounts.independent + depthCounts.assisted) / depthTotal) * 100,
  };
  const readyStop = (readinessSummary.readyCount / total) * 100;
  const reinforceStop = ((readinessSummary.readyCount + readinessSummary.reinforcementCount) / total) * 100;
  const difficultyPct = Math.round((mainDifficulty.studentCount / total) * 100);

  return (
    <section aria-label="30-second teacher summary" className={styles.decisionSummary}>
      <header className={styles.reportHeaderCompact}>
        <div className={styles.headerTop}>
          <div className={styles.kickerRow}>
            <span className={styles.badgeClass}>{classInfo.className}</span>
            <span className={styles.teacherContext}>{classInfo.teacherName} · {classInfo.schoolName}</span>
            <span className={styles.classCodeChip}>Class code {classInfo.shareCode}</span>
            <span className={styles.freshnessTag}>
              <span className={styles.liveDot} aria-hidden="true" />
              {classInfo.evidenceFreshness}
            </span>
          </div>
          <button type="button" className={styles.evidenceLink} onClick={onOpenEvidenceAudit}>
            <span className={styles.evidenceBulb} aria-hidden="true">💡</span>
            <span>Why Cogna believes this →</span>
          </button>
        </div>

        <p className={styles.lessonEyebrow}>Yesterday&apos;s lesson · {classInfo.lessonTitle}</p>
        <h1>How well did {classInfo.className} comprehend yesterday&apos;s algebra lesson?</h1>
        <p className={styles.reportSubhead}>
          {classInfo.assessmentTime} · {classInfo.totalStudents} students assessed · Independent exit evidence
        </p>
      </header>

      <div className={styles.priorityGrid}>
        <article className={styles.difficultyHero}>
          <div className={styles.difficultyNumber}>{mainDifficulty.studentCount}</div>
          <div className={styles.difficultyCopy}>
            <div className={styles.difficultySignalRow}>
              <p className={styles.priorityEyebrow}>Students needing attention today</p>
              <span>{difficultyPct}% of class · class-wide signal</span>
            </div>
            <h2>{mainDifficulty.studentCount} students struggled to keep equations balanced when variables appeared on both sides.</h2>
            <p>
              <strong>8</strong> have enough evidence for a targeted bridge; <strong>3</strong> need a fresh confirmation before individual support is assigned.
            </p>
            <button
              type="button"
              className={styles.inlineArrowLink}
              onClick={() => setIsDifficultyOpen(true)}
            >
              See the common errors →
            </button>
          </div>
        </article>

        <article className={styles.tomorrowActionCard}>
          <p className={styles.priorityEyebrow}>Cogna&apos;s take on what should happen tomorrow</p>
          <h2>{recommendedAction.headline}</h2>
          <div className={styles.actionSequence}>
            <span><strong>0–10 min</strong> Whole-class bridge</span>
            <span><strong>Then</strong> 18 progress · 8 targeted practice · 4 evidence check</span>
          </div>
          <button type="button" className={styles.primaryActionButton} onClick={onOpenActionBlueprint}>
            See what to revise in 10 minutes →
          </button>
        </article>
      </div>

      <div className={styles.insightGrid}>
        <article className={styles.insightCard}>
          <div className={styles.cardQuestionHeader}>
            <div>
              <p className={styles.cardEyebrow}>Independent exit check</p>
              <h2>What did students actually understand?</h2>
            </div>
            <span className={styles.conclusionChip}>Conclusion: Moderate</span>
          </div>

          <div className={styles.chartLayout}>
            <div
              className={styles.donutChart}
              style={{
                background: `conic-gradient(#0d7a5f 0 ${depthStops.first}%, #5366d6 ${depthStops.first}% ${depthStops.second}%, #df6b58 ${depthStops.second}% ${depthStops.third}%, #8b63bd ${depthStops.third}% 100%)`,
              }}
              role="img"
              aria-label="16 demonstrated transfer, 5 independent familiar execution, 5 assisted execution, and 4 had incomplete evidence"
            >
              <div className={styles.donutCenter}>
                <strong>{comprehension.transferCount}</strong>
                <span>transferred</span>
              </div>
            </div>

            <div className={styles.chartLegend}>
              {([
                ["transfer", "#0d7a5f", depthCounts.transfer],
                ["independent", "#5366d6", depthCounts.independent],
                ["assisted", "#df6b58", depthCounts.assisted],
                ["incomplete", "#8b63bd", depthCounts.incomplete],
              ] as [DepthTerm, string, number][]).map(([term, color, count]) => (
                <button
                  key={term}
                  type="button"
                  className={`${styles.legendDefinition} ${activeDepthTerm === term ? styles.legendDefinitionActive : ""}`}
                  onClick={() => setActiveDepthTerm(term)}
                >
                  <span className={styles.legendDot} style={{ background: color }} />
                  <span><strong>{DEPTH_HELP[term].title}</strong><small>{DEPTH_HELP[term].definition}</small></span>
                  <b>{count}</b>
                </button>
              ))}
            </div>
          </div>

          <p className={styles.chartClarifier}>
            <strong>Why 18 can be ready while 16 transferred:</strong> readiness asks whether the prerequisites for tomorrow are present; transfer is the stricter test of using the method in a changed form.
          </p>
        </article>

        <article className={styles.insightCard}>
          <div className={styles.cardQuestionHeader}>
            <div>
              <p className={styles.cardEyebrow}>Tomorrow&apos;s planned lesson</p>
              <h2>Who is ready for tomorrow&apos;s {nextTopic} class?</h2>
            </div>
            <button type="button" className={styles.editTopicButton} onClick={() => setIsEditingTopic(true)}>
              Edit topic
            </button>
          </div>

          {isEditingTopic && (
            <div className={styles.topicEditor}>
              <label htmlFor="next-topic">Tomorrow&apos;s planned topic</label>
              <div>
                <input
                  id="next-topic"
                  value={nextTopic}
                  autoFocus
                  onChange={(event) => setNextTopic(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setIsEditingTopic(false);
                  }}
                />
                <button type="button" onClick={() => setIsEditingTopic(false)}>Save</button>
              </div>
            </div>
          )}

          <div className={styles.chartLayout}>
            <div
              className={styles.donutChart}
              style={{
                background: `conic-gradient(#0d7a5f 0 ${readyStop}%, #dc991c ${readyStop}% ${reinforceStop}%, #8b63bd ${reinforceStop}% 100%)`,
              }}
              role="img"
              aria-label="18 ready, 8 need a targeted bridge, and 4 need an evidence check"
            >
              <div className={styles.donutCenter}>
                <strong>{Math.round((readinessSummary.readyCount / total) * 100)}%</strong>
                <span>ready now</span>
              </div>
            </div>

            <div className={styles.chartLegend}>
              {(["ready", "reinforcement", "probe"] as ReadinessCategory[]).map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`${styles.readinessLegend} ${activeReadiness === category ? styles.readinessLegendActive : ""}`}
                  onClick={() => setActiveReadiness(category)}
                >
                  <span className={`${styles.legendDot} ${styles[`readinessDot_${category}`]}`} />
                  <span><strong>{READINESS_COPY[category].shortLabel}</strong><small>{READINESS_COPY[category].explanation}</small></span>
                  <b>{readinessCounts[category]}</b>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.groupPreview}>
            <div>
              <strong>{READINESS_COPY[activeReadiness].label}</strong>
              <span>{activeGroup.map((student) => student.name.split(" ")[0]).join(", ")}</span>
            </div>
            <button type="button" onClick={() => onSelectReadinessTab(activeReadiness)}>
              View these {activeGroup.length} students →
            </button>
          </div>
        </article>
      </div>

      <section className={styles.confidenceStrip} aria-label="Conclusion confidence">
        <div>
          <span>Evidence integrity</span>
          <strong>High</strong>
          <small>Usable attempts were preserved; 1 conflicting input was excluded.</small>
        </div>
        <div>
          <span>Conclusion confidence</span>
          <strong>Moderate</strong>
          <small>26 of 30 students produced usable independent evidence; 4 remain open.</small>
        </div>
        <button type="button" onClick={onOpenEvidenceAudit}>Inspect evidence boundaries →</button>
      </section>

      {isDifficultyOpen && (
        <div
          className={styles.modalScrim}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsDifficultyOpen(false);
          }}
        >
          <section className={`${styles.modalContent} ${styles.commonErrorModal}`} role="dialog" aria-modal="true" aria-label="Common error evidence across questions">
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.badgeClass}>Evidence across questions</span>
                <h3 style={{ marginTop: "var(--s-2)" }}>Where did students go wrong?</h3>
                <p>Representative wrong steps from the 11 students behind this class signal. Counts can overlap across questions.</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setIsDifficultyOpen(false)} aria-label="Close common errors">
                ✕
              </button>
            </div>

            <div className={styles.errorQuestionList}>
              {COMMON_ERROR_EXAMPLES.map((example) => (
                <article key={example.id} className={styles.errorQuestionRow}>
                  <div className={styles.errorQuestionPrompt}>
                    <span>{example.id} · {example.studentCount} students</span>
                    <strong>{example.question}</strong>
                  </div>
                  <div className={styles.errorWrongAnswer}>
                    <span>Common wrong step</span>
                    <strong>{example.wrong}</strong>
                    <small>{example.note}</small>
                  </div>
                  <div className={styles.errorCorrectAnswer}>
                    <span>Balanced path</span>
                    <strong>{example.correct}</strong>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.commonErrorTakeaway}>
              <div>
                <strong>What connects these errors?</strong>
                <span>Students changed a term across the equals sign without consistently applying an equivalent operation.</span>
              </div>
              <div>
                <strong>Try saying this in class</strong>
                <span>{mainDifficulty.stepExample.teacherPrompt}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeDepthTerm && (
        <div
          className={styles.modalScrim}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveDepthTerm(null);
          }}
        >
          <section
            className={`${styles.modalContent} ${styles.termModal}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${DEPTH_HELP[activeDepthTerm].title} explained`}
            style={{
              "--term-accent": TERM_UI[activeDepthTerm].color,
              "--term-wash": TERM_UI[activeDepthTerm].wash,
            } as React.CSSProperties}
          >
            <div className={styles.termAccentBar} />
            <div className={styles.termHero}>
              <div className={styles.termHeroIcon} aria-hidden="true">{TERM_UI[activeDepthTerm].icon}</div>
              <div className={styles.termHeroCopy}>
                <span>{depthCounts[activeDepthTerm]} students in this lesson</span>
                <h3>{DEPTH_HELP[activeDepthTerm].title}</h3>
                <small>What it means</small>
                <p>{DEPTH_HELP[activeDepthTerm].definition}</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setActiveDepthTerm(null)} aria-label="Close term explanation">
                ✕
              </button>
            </div>

            <div className={styles.termEvidenceSection}>
              <span className={styles.termSectionLabel}>How it looks in evidence</span>
              <div className={styles.termEvidenceFlow}>
                <div>
                  <small>{TERM_UI[activeDepthTerm].beforeLabel}</small>
                  <strong>{TERM_VISUAL_EXAMPLE[activeDepthTerm].before}</strong>
                </div>
                <span className={styles.termFlowArrow}>→</span>
                <div>
                  <small>{TERM_UI[activeDepthTerm].afterLabel}</small>
                  <strong>{TERM_VISUAL_EXAMPLE[activeDepthTerm].after}</strong>
                </div>
              </div>
              <p>{DEPTH_HELP[activeDepthTerm].example}</p>
            </div>

            <div className={styles.termTeacherMove}>
              <span>Recommended next teacher move</span>
              <strong>{TERM_UI[activeDepthTerm].teacherMove}</strong>
            </div>

            <p className={styles.termBoundaryNote}>
              <span aria-hidden="true">◇</span>
              Lesson-specific evidence—not a label for intelligence or fixed ability.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
